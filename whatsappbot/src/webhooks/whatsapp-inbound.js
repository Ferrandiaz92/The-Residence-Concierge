// src/webhooks/whatsapp-inbound.js (updated — guest memory)
import {
  getHotelByWhatsappNumber, getOrCreateGuest, updateGuest,
  getOrCreateConversation, appendMessage, getConversationHistory,
  getPartners, createBooking, supabase,
} from '../lib/supabase.js'
import { sendWhatsApp, parseIncomingMessage } from '../lib/twilio.js'
import { detectLanguage, parseBookingRequest, formatPartnerAlert } from '../lib/language.js'
import { callClaude } from '../lib/claude.js'
import { handleTicketReply } from '../lib/ticketing.js'
import { buildSystemPromptWithKB } from '../lib/knowledge.js'
import { getFacilities, formatFacilitiesForPrompt, parseFacilityRequest } from '../lib/facilities.js'
import { handleFeedbackReply } from '../lib/scheduled.js'
import { loadGuestMemory, formatMemoryForPrompt, updateGuestPreferences } from '../lib/memory.js'
import { notifyReceptionEscalation, notifyReceptionMessage } from '../lib/push.js'
import { getAvailableProducts, formatProductsForPrompt, parseProductOrder, createGuestOrder } from '../lib/stripe.js'
import { checkInbound, RESTRICTED_PROMPT } from '../lib/abuse.js'
import { getFlightStatus, extractFlightNumber, calculateTaxiTime, formatFlightStatus } from '../lib/flights.js'

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)
  if (!message.trim()) return

  // 1. Ticket reply check
  const isTicketReply = await handleTicketReply(from, message)
  if (isTicketReply) return

  // 2. Load hotel
  let hotel
  try { hotel = await getHotelByWhatsappNumber(to) }
  catch { console.error(`No hotel for: ${to}`); return }

  // 3. Guest — create or load
  const guest = await getOrCreateGuest(hotel.id, from)
  if (!guest.name && profileName) {
    const parts = profileName.trim().split(' ')
    await updateGuest(guest.id, { name: parts[0]||null, surname: parts.slice(1).join(' ')||null })
    guest.name = parts[0]||null; guest.surname = parts.slice(1).join(' ')||null
  }

  // 3b. Abuse / security check — before doing anything else
  const abuseCheck = await checkInbound(from, message, hotel.id, guest, guest.language || 'en')

  if (abuseCheck.action === 'block') {
    console.log(`Blocked message from ${from}`)
    return  // Silence — no response
  }

  if (abuseCheck.action === 'redirect') {
    // Known guest who is blocked — redirect to reception, don't block silently
    await sendWhatsApp(from, abuseCheck.warnMsg)
    return
  }

  if (abuseCheck.action === 'warn') {
    await sendWhatsApp(from, abuseCheck.warnMsg)
    // For high severity warnings, also escalate conversation
    if (abuseCheck.escalate) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('guest_id', guest.id)
        .in('status', ['active','escalated'])
        .order('created_at', { ascending: false })
        .limit(1).single()
      if (conv) {
        await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
      }
    }
    return
  }

  // action === 'restrict' — continue but add restriction to system prompt later
  const isRestricted = abuseCheck.action === 'restrict'

  // 4. Language detection — only switch after 2+ consecutive messages in new language
  const lang = detectLanguage(message)
  if (lang !== guest.language) {
    // Check last message — only switch after 2 consecutive in new language
    // Load last conversation message to check previous language
    const { data: lastConvRow } = await supabase
      .from('conversations')
      .select('messages')
      .eq('guest_id', guest.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const lastMsgs     = lastConvRow?.messages || []
    const lastGuestMsg = [...lastMsgs].reverse().find(m => m.role === 'user')
    const lastLang     = lastGuestMsg ? detectLanguage(lastGuestMsg.content || '') : guest.language
    if (lastLang === lang) {
      await updateGuest(guest.id, { language: lang })
      guest.language = lang
    }
  }

  // 5. Feedback reply check
  const isFeedback = await handleFeedbackReply(from, message, hotel.id)
  if (isFeedback) return

  // 6. Conversation — reuse existing
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('*')
    .eq('guest_id', guest.id)
    .in('status', ['active','escalated'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let conv = existingConv
  if (!conv) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({ guest_id: guest.id, hotel_id: hotel.id, messages: [], status: 'active' })
      .select().single()
    conv = newConv
  }
  // FIX #3: Never reset escalated → active automatically
  // Only reception can de-escalate by manually marking resolved
  // Bot keeps responding but conversation stays escalated so it shows in Alerts
  const wasEscalated = conv.status === 'escalated'

  const history = (conv.messages || []).slice(-20)

  // 7. Load guest memory (previous stays + preferences)
  const memory = await loadGuestMemory(guest.id)

  // 8. Build system prompt with KB + facilities + memory
  const partners    = await getPartners(hotel.id)
  const facilities  = await getFacilities(hotel.id)
  let systemPrompt  = await buildSystemPromptWithKB(hotel, guest, partners)

  // ── FIX #5: Stay status context ──────────────────────────────
  const stayStatus = guest.stay_status || 'prospect'
  if (stayStatus === 'checked_out') {
    systemPrompt += `\n\n[STAY CONTEXT] This guest has ALREADY CHECKED OUT. Their stay is over. ` +
      `Do NOT offer active hotel services (room service, housekeeping, activity bookings). ` +
      `Only help with: post-stay questions, lost items, invoice queries, or future rebooking enquiries. ` +
      `Be warm and grateful for their stay.`
  } else if (stayStatus === 'pre_arrival') {
    systemPrompt += `\n\n[STAY CONTEXT] Guest has a booking but has NOT checked in yet. ` +
      `Check-in date: ${guest.check_in}. Help them prepare for arrival. ` +
      `You can answer questions and arrange things for when they arrive.`
  } else if (stayStatus === 'active') {
    systemPrompt += `\n\n[STAY CONTEXT] Guest is currently checked in. Room: ${guest.room}. ` +
      `Check-out: ${guest.check_out}. Provide full concierge service.`
  }

  // Restricted mode — only hotel topics allowed
  if (isRestricted) {
    systemPrompt += RESTRICTED_PROMPT
  }

  // FIX #2: Frustration detector — count recent unresolved guest messages
  const recentMsgs     = (conv.messages || []).slice(-8)
  const recentGuest    = recentMsgs.filter(m => m.role === 'user')
  const recentBot      = recentMsgs.filter(m => m.role === 'assistant')
  const hadBooking     = recentBot.some(m => (m.content||'').includes('[BOOKING]') || (m.content||'').includes('confirmed'))
  const hadTicket      = recentBot.some(m => (m.content||'').toLowerCase().includes('ticket') || (m.content||'').toLowerCase().includes('team'))
  const repeatingGuest = recentGuest.length >= 3 && !hadBooking && !hadTicket
  if (repeatingGuest) {
    systemPrompt += `\n\n[FRUSTRATION ALERT] This guest has sent ${recentGuest.length} messages without resolution. ` +
      `If you cannot resolve their request in this reply, you MUST use [HANDOFF] to escalate to reception. ` +
      `Do not keep asking clarifying questions — act or escalate.`
  }

  // Add facilities
  const facilityText = formatFacilitiesForPrompt(facilities)
  if (facilityText) systemPrompt += `\n\n${facilityText}`

  // Add guest memory if returning guest
  const memoryText = formatMemoryForPrompt(memory, guest.language || 'en')
  if (memoryText) systemPrompt += memoryText

  // Add today's available products (experiences, events, etc.)
  const products    = await getAvailableProducts(hotel.id)
  const productText = formatProductsForPrompt(products, guest.language || 'en')
  if (productText) systemPrompt += productText

  // 9. Detect upsell context
  const lastBotMsg = [...(conv.messages||[])].reverse().find(m => m.role === 'assistant')
  const isRespondingToUpsell = lastBotMsg?.sent_by === 'scheduled' &&
    (lastBotMsg?.content?.includes('book') || lastBotMsg?.content?.includes('arrange') ||
     lastBotMsg?.content?.includes('réserv') || lastBotMsg?.content?.includes('buchen') ||
     lastBotMsg?.content?.includes('reserv') || lastBotMsg?.content?.includes('prenotare'))

  if (isRespondingToUpsell) {
    systemPrompt += '\n\nCONTEXT: Guest is responding to your activity suggestions. If they show interest, book immediately.'
  }

  // 10. Save user message + notification
  await appendMessage(conv.id, 'user', message)
  await createNotification(hotel.id, {
    type:      'guest_message',
    title:     `${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
    body:      message.slice(0, 100),
    link_type: 'conversation',
    link_id:   conv.id,
  })

  // 11. Claude
  let aiResponse
  try { aiResponse = await callClaude(systemPrompt, history, message) }
  catch {
    const fb = {
      en:'I\'m having a brief issue. Please try again.',
      ru:'Временная ошибка.',
      he:'שגיאה זמנית.',
      es:'Un momento, por favor. Inténtalo de nuevo.',
      de:'Kurzer Fehler. Bitte versuchen Sie es nochmal.',
      fr:'Un instant. Veuillez réessayer.',
      it:'Un momento. Riprova.',
      pt:'Um momento. Tente novamente.',
      zh:'请稍候，请重试。',
      ar:'خطأ مؤقت. حاول مرة أخرى.',
      nl:'Even een fout. Probeer het opnieuw.',
      pl:'Chwilowy błąd. Spróbuj ponownie.',
      sv:'Ett kortvarigt fel. Försök igen.',
      fi:'Lyhyt virhe. Yritä uudelleen.',
      uk:'Тимчасова помилка.',
      el:'Σφάλμα. Δοκιμάστε ξανά.',
      ca:'Un moment. Torna-ho a intentar.',
    }
    await sendWhatsApp(from, fb[guest.language]||fb.en); return
  }

  // 11b. Flight status check — if guest mentions a flight number in any message
  const mentionedFlight = extractFlightNumber(message)
  if (mentionedFlight && !autoTicketCreated) {
    // Add real-time flight status to system prompt context
    const flightData = await getFlightStatus(mentionedFlight).catch(() => null)
    if (flightData) {
      const statusSummary = formatFlightStatus(flightData, guest.language || 'en')
      systemPrompt += `\n\n[FLIGHT DATA - REAL TIME] Guest mentioned flight ${mentionedFlight}. ` +
        `Current status: ${flightData.status}. ` +
        `${flightData.arriveDelay > 0 ? `Arrival delayed ${flightData.arriveDelay} minutes.` : 'On time.'} ` +
        `Scheduled arrival: ${flightData.scheduledArrive ? new Date(flightData.scheduledArrive).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'unknown'}. ` +
        `Estimated arrival: ${flightData.estimatedArrive ? new Date(flightData.estimatedArrive).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'unknown'}. ` +
        `If booking a taxi for this flight, use the estimated arrival time + 30 minutes for immigration/baggage. ` +
        `You can share this flight status with the guest naturally.`
    }
  }

  // 12a. Auto-ticket for maintenance/facility issues
  const msgLower = message.toLowerCase()
  const MAINT_KEYWORDS = ['tv','television','remote control','air conditioning','air-conditioning',
    ' ac ',' ac,','broken','not working',"doesn't work",'doesnt work','out of order',
    'leak','leaking','flood','shower','toilet','flush','light ','lights','lamp','bulb',
    'electricity','power cut','noise','loud','smell','smoke','heating','too hot','too cold',
    'door','lock','key card','wifi','internet','no signal']
  const isMaintIssue = MAINT_KEYWORDS.some(k => msgLower.includes(k))
  let autoTicketCreated = false

  if (isMaintIssue && guest.stay_status === 'active' && guest.room) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: existingTicket } = await supabase
      .from('internal_tickets')
      .select('id')
      .eq('hotel_id', hotel.id)
      .eq('room', guest.room)
      .eq('department', 'maintenance')
      .not('status', 'in', '("resolved","cancelled")')
      .gte('created_at', twoHoursAgo)
      .limit(1)

    if (!existingTicket || existingTicket.length === 0) {
      const { count } = await supabase.from('internal_tickets')
        .select('*', { count:'exact', head:true }).eq('hotel_id', hotel.id)
      const ticketNum = (count || 0) + 1

      try {
        await supabase.from('internal_tickets').insert({
          hotel_id:    hotel.id,
          guest_id:    guest.id,
          department:  'maintenance',
          category:    'room_issue',
          description: `[AUTO] Guest report: "${message.slice(0, 200)}"`,
          room:        guest.room,
          priority:    'normal',
          status:      'pending',
          created_by:  'bot',
          ticket_number: ticketNum,
        })
      } catch(e) { console.error('Auto-ticket insert failed:', e.message) }

      autoTicketCreated = true
      console.log(`Auto-ticket created for room ${guest.room}: ${message.slice(0, 50)}`)
    }
  }

  // Inject auto-ticket context into system prompt so bot responds correctly
  if (autoTicketCreated) {
    systemPrompt += `\n\n[MAINTENANCE TICKET CREATED] A maintenance ticket has been automatically logged for this guest's issue. ` +
      `In your reply: (1) acknowledge their issue warmly, (2) tell them it has been logged and our maintenance team will attend shortly, ` +
      `(3) give a realistic timeframe based on time of day (daytime: within 30 minutes, overnight: within 20 minutes as duty team alerted). ` +
      `Do NOT ask further questions about the issue. Do NOT try to troubleshoot — a human will handle it.`
  }

  // 12. Handoff check
  const isHandoff = aiResponse.toLowerCase().includes('[handoff]') ||
    aiResponse.toLowerCase().includes('connect you with our') ||
    aiResponse.toLowerCase().includes('connect you with reception') ||
    aiResponse.toLowerCase().includes('te pongo en contacto') ||
    aiResponse.toLowerCase().includes('je vous mets en contact') ||
    aiResponse.toLowerCase().includes('verbinde sie mit') ||
    aiResponse.toLowerCase().includes('vi metto in contatto')

  if (isHandoff) {
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
    await createNotification(hotel.id, {
      type:      'bot_handoff',
      title:     `Handoff — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
      body:      `"${message.slice(0, 80)}"`,
      link_type: 'conversation',
      link_id:   conv.id,
    })
    // 🔔 Push reception immediately
    notifyReceptionEscalation({
      hotelId:   hotel.id,
      guestName: `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest',
      room:      guest.room || null,
      convId:    conv.id,
    }).catch(e => console.error('Push escalation error:', e))

    // ── FIX #10: Guest acknowledgement on escalation ──────────
    // Guest knows a human is coming — no awkward silence
    const receptionHours = hotel.config?.reception_hours || '08:00–23:00'
    const ackMsgs = {
      en: `I've passed your message to our team and someone will be with you shortly. Our reception is available ${receptionHours}. Thank you for your patience 🙏`,
      ru: `Я передал ваше сообщение нашей команде, скоро с вами свяжутся. Ресепшен работает ${receptionHours}. Спасибо за терпение 🙏`,
      he: `העברתי את הבקשה שלך לצוות שלנו, מישהו יצור איתך קשר בקרוב. הקבלה פתוחה ${receptionHours}. תודה על הסבלנות 🙏`,
      de: `Ich habe Ihre Nachricht an unser Team weitergeleitet. Jemand wird sich bald bei Ihnen melden. Rezeption: ${receptionHours}. Vielen Dank für Ihre Geduld 🙏`,
      fr: `J'ai transmis votre message à notre équipe, quelqu'un vous contactera bientôt. Réception disponible ${receptionHours}. Merci pour votre patience 🙏`,
      es: `He pasado su mensaje a nuestro equipo, alguien le atenderá en breve. Recepción disponible ${receptionHours}. Gracias por su paciencia 🙏`,
    }
    const ackMsg = ackMsgs[guest.language] || ackMsgs.en
    await sendWhatsApp(from, ackMsg)
    await appendMessage(conv.id, 'assistant', ackMsg)
  }

  // 13. Facility request check
  const { hasFacility, facility, cleanResponse: facilityClean } = parseFacilityRequest(aiResponse)
  if (hasFacility && facility) {
    await processFacilityRequest(facility, hotel, guest, conv.id)
    await sendWhatsApp(from, facilityClean)
    await appendMessage(conv.id, 'assistant', facilityClean)
    return
  }

  // 14. Parse BOTH booking and product order tags BEFORE sending to guest
  const { hasBooking, booking, cleanResponse: afterBooking } = parseBookingRequest(aiResponse)
  const { hasOrder, order: productOrder, cleanResponse: finalReply } = parseProductOrder(afterBooking || aiResponse)

  // Send the clean response (all tags stripped)
  const replyText = finalReply || afterBooking || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  if (hasBooking && booking) {
    const source = isRespondingToUpsell ? 'upsell' : 'guest_request'
    await processBooking(booking, hotel, guest, partners, source)

    const partner = partners.find(p =>
      p.name.toLowerCase().includes((booking.partner||'').toLowerCase()) || p.type === booking.type)
    if (partner || booking.type) {
      await updateGuestPreferences(guest.id, booking.type, partner?.name)
    }
  }

  // 15. Product order — send payment link
  if (hasOrder && productOrder) {
    await processProductOrder(productOrder, hotel, guest, conv.id, products, from)
  }
}

async function createNotification(hotelId, { type, title, body, link_type, link_id }) {
  try {
    await supabase.from('notifications').insert({ hotel_id: hotelId, type, title, body, link_type, link_id })
  } catch(e) { console.error('Notification error:', e.message) }
}

async function processFacilityRequest(facility, hotel, guest, convId) {
  try {
    const description = `FACILITY BOOKING REQUEST\nFacility: ${facility.facility}\nDate: ${facility.date||'TBC'}\nTime: ${facility.time||'TBC'}\nGuests: ${facility.guests||1}\n\nGuest: ${guest.name||''} ${guest.surname||''} · Room ${guest.room||'?'}\nPlease check availability and confirm with guest via WhatsApp.`
    await supabase.from('internal_tickets').insert({
      hotel_id: hotel.id, guest_id: guest.id,
      department: 'concierge', category: 'facility_booking',
      description, room: guest.room, priority: 'normal',
      status: 'pending', created_by: 'bot',
    })
    await createNotification(hotel.id, {
      type: 'guest_message',
      title: `Facility booking — ${facility.facility}`,
      body: `${guest.name||'Guest'} · Room ${guest.room} · ${facility.date} at ${facility.time}`,
      link_type: 'conversation', link_id: convId,
    })
  } catch(e) { console.error('Facility request error:', e.message) }
}

// ── SMART PARTNER MATCHING ───────────────────────────────────
// Scores each candidate partner on:
//   1. Capability match  (40%) — vehicle type, features, passengers, luggage
//   2. Confirmation rate (35%) — 90-day historical acceptance rate
//   3. Service area      (25%) — does destination match partner's service areas
// Minimum score to auto-select: 40 points out of 100
// Below minimum: still selects best available but flags for reception review

function scorePartner(partner, booking, stats) {
  const caps     = partner.capabilities || partner.details || {}
  const details  = booking.details || {}
  let score      = 0
  let reasons    = []

  // ── 1. Capability match (max 40 pts) ──
  if (booking.type === 'taxi') {
    // Passengers
    const pax = details.passengers || details.pax || 1
    const maxPax = caps.max_passengers || 4
    if (pax <= maxPax) { score += 15; reasons.push(`fits ${pax} pax`) }
    else { reasons.push(`⚠ only fits ${maxPax} pax, need ${pax}`) }

    // Required features
    const required = details.requirements || []
    const hasFeatures = caps.features || []
    const matched = required.filter(r => hasFeatures.some(f => f.toLowerCase().includes(r.toLowerCase())))
    const featureScore = required.length === 0 ? 15 : Math.round((matched.length / required.length) * 15)
    score += featureScore
    if (matched.length > 0) reasons.push(`features: ${matched.join(', ')}`)

    // Luggage
    const luggage = details.luggage || 0
    const maxLuggage = caps.max_luggage || 4
    if (luggage <= maxLuggage) { score += 10; reasons.push(`handles ${luggage} bags`) }

    // 24h availability
    const hour = new Date().getHours()
    const isOvernightReq = details.time && (parseInt(details.time) >= 23 || parseInt(details.time) <= 6)
    if (!isOvernightReq || caps.available_24h) { score += 0 } // no bonus, just not penalised
    else { score -= 10; reasons.push('⚠ not 24h') }

  } else {
    // Non-taxi: simpler capability check
    score += 40
  }

  // ── 2. Confirmation rate (max 35 pts) ──
  const partnerStats = stats.find(s => s.partner_id === partner.id)
  const rate         = partnerStats?.confirmation_rate_pct
  const totalBkgs    = partnerStats?.total_bookings || 0

  if (totalBkgs < 3) {
    // Not enough history — neutral score, don't penalise new partners
    score += 20
    reasons.push('new partner (no history yet)')
  } else if (rate >= 90) { score += 35; reasons.push(`${rate}% confirm rate`) }
  else if (rate >= 75)   { score += 28; reasons.push(`${rate}% confirm rate`) }
  else if (rate >= 60)   { score += 20; reasons.push(`${rate}% confirm rate`) }
  else if (rate >= 40)   { score += 10; reasons.push(`⚠ ${rate}% confirm rate`) }
  else                   { score += 0;  reasons.push(`⚠ low ${rate}% confirm rate`) }

  // ── 3. Service area match (max 25 pts) ──
  const destination  = (details.destination || '').toLowerCase()
  const serviceAreas = (caps.service_areas || []).map(a => a.toLowerCase())

  if (serviceAreas.length === 0) {
    // No areas defined — assume covers everything, neutral score
    score += 15
  } else {
    const areaMatch = serviceAreas.some(area =>
      destination.includes(area) || area.includes(destination.split(' ')[0])
    )
    if (areaMatch) { score += 25; reasons.push('covers destination') }
    else           { score += 5;  reasons.push('⚠ destination may be outside service area') }
  }

  return { score, reasons }
}

async function processBooking(booking, hotel, guest, partners, source = 'guest_request') {
  // Filter partners by type
  const candidates = partners.filter(p =>
    p.type === booking.type || p.name.toLowerCase().includes((booking.partner||'').toLowerCase())
  )
  if (candidates.length === 0) {
    console.warn(`No partners found for type: ${booking.type}`)
    return
  }

  // ── FIX #12: Duplicate booking check ──
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('bookings').select('id')
    .eq('hotel_id', hotel.id).eq('guest_id', guest.id)
    .eq('type', booking.type).eq('status', 'pending')
    .gte('created_at', tenMinsAgo).limit(1)
  if (recent && recent.length > 0) {
    console.warn(`Duplicate booking detected — skipping`)
    return
  }

  // Single partner — skip scoring
  if (candidates.length === 1) {
    return await _sendToPartner(candidates[0], booking, hotel, guest, source, false)
  }

  // Multiple partners — run smart matching
  // Load 90-day stats for all candidates
  const candidateIds = candidates.map(p => `"${p.id}"`).join(',')
  const { data: stats } = await supabase
    .from('v_partner_stats')
    .select('*')
    .in('partner_id', candidates.map(p => p.id))

  // Score each partner
  const scored = candidates.map(partner => {
    const { score, reasons } = scorePartner(partner, booking, stats || [])
    return { partner, score, reasons }
  }).sort((a, b) => b.score - a.score)

  const best        = scored[0]
  const MIN_SCORE   = 40
  const flagLowConf = best.score < MIN_SCORE

  console.log(`Partner selection for ${booking.type}:`)
  scored.forEach(s => console.log(`  ${s.partner.name}: ${s.score}/100 — ${s.reasons.join(', ')}`))
  console.log(`Selected: ${best.partner.name} (score: ${best.score})${flagLowConf ? ' [LOW CONFIDENCE — flagged]' : ''}`)

  return await _sendToPartner(best.partner, booking, hotel, guest, source, flagLowConf, best.reasons)
}

async function _sendToPartner(partner, booking, hotel, guest, source, lowConfidence = false, matchReasons = []) {
  const details = booking.details || {}

  // ── Flight status check — correct pickup time if flight delayed ──
  if (details.flight) {
    const flightNum = extractFlightNumber(details.flight)
    if (flightNum) {
      const flightData = await getFlightStatus(flightNum).catch(() => null)
      if (flightData) {
        const direction = details.destination?.toLowerCase().includes('airport') ? 'arrival'
          : details.pickup?.toLowerCase().includes('airport') ? 'departure'
          : 'arrival'

        const taxiCalc = calculateTaxiTime(flightData, direction, hotel.config)
        if (taxiCalc) {
          // Correct the time in booking details
          details.time         = taxiCalc.pickupTimeStr
          details.flight_status = flightData.status
          details.flight_delay  = taxiCalc.delayMins
          if (taxiCalc.note) details.flight_note = taxiCalc.note

          console.log(`Flight ${flightNum}: ${flightData.status}, delay ${taxiCalc.delayMins}min, taxi adjusted to ${taxiCalc.pickupTimeStr}`)
        }
      }
    }
  }

  const base = booking.details?.price || (partner.details?.price_per_person
    ? partner.details.price_per_person * (booking.details?.passengers || booking.details?.pax || 1) : 0)
  const comm = base > 0 ? +(base * partner.commission_rate / 100).toFixed(2) : 0

  const { data: saved } = await supabase.from('bookings').insert({
    hotel_id:          hotel.id,
    guest_id:          guest.id,
    partner_id:        partner.id,
    type:              booking.type,
    details: {
      ...(booking.details || {}),
      _match_score:    matchReasons.join(' | '),
      _low_confidence: lowConfidence,
    },
    commission_amount: comm,
    status:           'pending',
    source,
  }).select().single()

  if (!saved) return

  // If low confidence — also notify reception so they can manually verify
  if (lowConfidence) {
    try { await supabase.from('notifications').insert({
      hotel_id:  hotel.id,
      type:      'booking_low_confidence',
      title:     `⚠ Low-confidence partner match — ${booking.type} for ${guest.name || 'Guest'}`,
      body:      `Sent to ${partner.name} but match score was low. Please verify.`,
      link_type: 'booking',
      link_id:   saved.id,
    }) } catch {}
  }

  try {
    const msg = await sendWhatsApp(partner.phone, formatPartnerAlert(booking, guest, hotel))
    await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
  } catch(e) { console.error('Partner alert failed:', e.message) }
}

async function processProductOrder(orderData, hotel, guest, convId, products, guestPhone) {
  console.log('processProductOrder called:', JSON.stringify(orderData))

  // Find the product
  const product = products.find(p => p.id === orderData.product_id)
  if (!product) {
    console.error('processProductOrder: product not found:', orderData.product_id)
    console.error('Available product IDs:', products.map(p => p.id))
    return
  }

  // Find the tier — case-insensitive
  const tier = (product.tiers || []).find(t =>
    t.name.toLowerCase() === orderData.tier_name.toLowerCase()
  )
  if (!tier) {
    console.error('processProductOrder: tier not found:', orderData.tier_name)
    console.error('Available tiers:', (product.tiers||[]).map(t => t.name))
    return
  }

  const quantity = orderData.quantity || 1
  console.log(`Creating order: ${product.name} / ${tier.name} x${quantity} @ €${tier.price}`)

  try {
    const { order, paymentUrl } = await createGuestOrder({
      hotelId: hotel.id,
      guestId: guest.id,
      convId,
      product,
      tier,
      quantity,
      hotel,
      guest,
    })

    console.log('Order created:', order.id, 'Payment URL:', paymentUrl)

    const total      = (tier.price * quantity).toFixed(0)
    const tierLabel  = quantity > 1 ? `${quantity}× ${tier.name}` : tier.name
    const paymentMsg = [
      `💳 *${product.name} — ${tierLabel}*`,
      `Total: €${total}`,
      ``,
      `Your secure payment link:`,
      paymentUrl,
      ``,
      `⏱ Valid for 24 hours. Once paid I'll send your confirmation immediately.`,
    ].join('\n')

    await sendWhatsApp(guestPhone, paymentMsg)
    await appendMessage(convId, 'assistant', paymentMsg, { sent_by: 'payment_bot' })
    console.log(`✅ Payment link sent for order ${order.id}: €${total}`)

  } catch(e) {
    console.error('processProductOrder FAILED:', e.message)
    console.error(e.stack)
    // Send a fallback message so guest isn't left hanging
    try {
      await sendWhatsApp(guestPhone,
        `I'm arranging your payment link — please give me just a moment or ask reception to assist. 🙏`
      )
    } catch {}
  }
}
