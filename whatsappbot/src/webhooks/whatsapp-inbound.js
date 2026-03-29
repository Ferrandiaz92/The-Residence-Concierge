// src/webhooks/whatsapp-inbound.js
// ─────────────────────────────────────────────────────────────
// IMPROVEMENT 1: Parallel DB calls
//   Before: partners → facilities → KB → products → memory = 5
//   sequential round-trips, each ~150ms = 750ms+ before Claude.
//   After: all five fire simultaneously with Promise.all.
//   Saving: ~400–600ms on every inbound message.
//
// IMPROVEMENT 2: Partner confirmation → guest notification
//   Handled in partner-reply.js. This file ensures conversation
//   status stays in sync when bookings change.
//
// IMPROVEMENT 3: Structured logging (Pino + Sentry)
//   console.log → log.info, console.error → log.error/log.critical
//   Every log line carries hotel/guest/room context.
//   Claude failures, payment failures, partner alert failures
//   all trigger Sentry alerts.
// ─────────────────────────────────────────────────────────────

import {
  getHotelByWhatsappNumber, getOrCreateGuest, updateGuest,
  getOrCreateConversation, appendMessage, getConversationHistory,
  getPartners, createBooking, supabase,
} from '../lib/supabase.js'
import { sendWhatsApp, parseIncomingMessage } from '../lib/twilio.js'
import { detectLanguage, parseBookingRequest, formatPartnerAlert, buildSystemPrompt } from '../lib/language.js'
import { callClaude } from '../lib/claude.js'
import { handleTicketReply } from '../lib/ticketing.js'
import { getKnowledgeBase, formatKnowledgeForPrompt } from '../lib/knowledge.js'
import { getFacilities, formatFacilitiesForPrompt, parseFacilityRequest } from '../lib/facilities.js'
import { handleFeedbackReply } from '../lib/scheduled.js'
import { loadGuestMemory, formatMemoryForPrompt, updateGuestPreferences } from '../lib/memory.js'
import { notifyReceptionEscalation } from '../lib/push.js'
import { getAvailableProducts, formatProductsForPrompt, parseProductOrder, createGuestOrder } from '../lib/stripe.js'
import { checkInbound, RESTRICTED_PROMPT } from '../lib/abuse.js'
import log, { hotelCtx, guestCtx, bookingCtx } from '../../lib/logger.js'
import { queuePartnerAlert, markRetrySucceeded } from '../lib/partner-retries.js'

// ── SAFE FLIGHT HELPERS ────────────────────────────────────────
function extractAllFlightNumbers(text) {
  try {
    const re = /\b([A-Z][A-Z0-9]|[A-Z]{3})\s*(\d{1,4}[A-Z]?)\b/g
    const bad = new Set(['TV','AC','OK','NO','MY','TO','GO','DO','SO','IT','BE','AM'])
    const out = []
    let m
    while ((m = re.exec(text.toUpperCase())) !== null) {
      if (!bad.has(m[1])) out.push(m[1] + m[2])
    }
    return out
  } catch { return [] }
}

async function safeGetFlight(flightCode) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) { log.warn('RAPIDAPI_KEY not set — skipping flight lookup'); return null }
  const today = new Date().toISOString().split('T')[0]
  const dates = [
    today,
    new Date(Date.now() - 86400000).toISOString().split('T')[0],
    new Date(Date.now() + 86400000).toISOString().split('T')[0],
  ]
  for (const date of dates) {
    try {
      const res = await fetch(
        `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightCode)}/${date}`,
        { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
          signal: AbortSignal.timeout(4000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const f    = Array.isArray(data) ? data[0] : data
      if (!f) continue

      const dep = f.departure || {}
      const arr = f.arrival   || {}

      const arrLocal = arr.predictedTime?.local || arr.revisedTime?.local || arr.scheduledTime?.local
      const depLocal = dep.revisedTime?.local   || dep.scheduledTime?.local
      const arrUtc   = arr.predictedTime?.utc   || arr.revisedTime?.utc   || arr.scheduledTime?.utc

      let arrDelay = 0
      if (arr.scheduledTime?.utc && arr.revisedTime?.utc) {
        arrDelay = Math.round(
          (new Date(arr.revisedTime.utc) - new Date(arr.scheduledTime.utc)) / 60000
        )
      }

      const fmtLocal = (s) => { const m = (s||'').match(/(\d{2}:\d{2})/); return m ? m[1] : null }

      return {
        iata:               f.number?.replace(' ','') || flightCode,
        status:             f.status || 'Expected',
        airline:            f.airline?.name,
        origin:             dep.airport?.name,
        destination:        arr.airport?.name,
        arrivalTimeLocal:   fmtLocal(arrLocal),
        departureTimeLocal: fmtLocal(depLocal),
        estimatedArrive:    arrUtc,
        arriveDelay:        arrDelay,
        arriveTerminal:     arr.terminal,
        gate:               arr.gate || dep.gate,
      }
    } catch (e) {
      log.warn(`safeGetFlight ${flightCode} ${date}: ${e.message}`)
      continue
    }
  }
  return null
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  log.info('Inbound message', { to, preview: message.slice(0, 60) })
  if (!message.trim()) return

  // 1. Ticket reply check
  const isTicketReply = await handleTicketReply(from, message)
  if (isTicketReply) return

  // 2. Load hotel
  let hotel
  try { hotel = await getHotelByWhatsappNumber(to) }
  catch (err) { await log.error('No hotel found for number', err, { to }); return }
  const hCtx = hotelCtx(hotel)

  // 3. Guest
  const guest = await getOrCreateGuest(hotel.id, from)
  if (!guest.name && profileName) {
    const parts = profileName.trim().split(' ')
    await updateGuest(guest.id, { name: parts[0]||null, surname: parts.slice(1).join(' ')||null })
    guest.name = parts[0]||null
    guest.surname = parts.slice(1).join(' ')||null
  }
  const gCtx = guestCtx(guest)
  log.info('Guest loaded', { ...hCtx, ...gCtx })

  // 3b. Abuse check
  let abuseCheck = { action: 'allow' }
  try {
    abuseCheck = await checkInbound(from, message, hotel.id, guest, guest.language || 'en')
  } catch (err) {
    log.warn('Abuse check failed — allowing', { ...hCtx, error: err.message })
  }

  if (abuseCheck.action === 'block') { log.info('Blocked', { ...hCtx, ...gCtx }); return }

  if (abuseCheck.action === 'redirect') {
    await sendWhatsApp(from, abuseCheck.warnMsg); return
  }

  if (abuseCheck.action === 'warn') {
    await sendWhatsApp(from, abuseCheck.warnMsg)
    if (abuseCheck.escalate) {
      const { data: conv } = await supabase
        .from('conversations').select('id').eq('guest_id', guest.id)
        .in('status', ['active','escalated']).order('created_at', { ascending: false }).limit(1).single()
      if (conv) await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
    }
    return
  }

  const isRestricted = abuseCheck.action === 'restrict'

  // 4. Language detection
  const detectedLang = detectLanguage(message)
  if (detectedLang !== guest.language) {
    const NON_LATIN = ['ru','he','ar','zh','el','uk']
    if (NON_LATIN.includes(detectedLang)) {
      await updateGuest(guest.id, { language: detectedLang })
      guest.language = detectedLang
    } else if (!guest.language || guest.language === 'en') {
      if (message.trim().split(/\s+/).length >= 3) {
        await updateGuest(guest.id, { language: detectedLang })
        guest.language = detectedLang
      }
    } else {
      try {
        const { data: lastConvRow } = await supabase
          .from('conversations').select('id').eq('guest_id', guest.id)
          .order('created_at', { ascending: false }).limit(1).single()
        if (lastConvRow) {
          const { data: lastMsgs } = await supabase
            .from('messages').select('content').eq('conversation_id', lastConvRow.id)
            .eq('role', 'user').order('created_at', { ascending: false }).limit(2)
          const allNewLang = (lastMsgs||[]).length >= 2 &&
            lastMsgs.every(m => detectLanguage(m.content||'') === detectedLang)
          if (allNewLang) { await updateGuest(guest.id, { language: detectedLang }); guest.language = detectedLang }
        }
      } catch {}
    }
  }

  // 5. Feedback reply check
  const isFeedback = await handleFeedbackReply(from, message, hotel.id)
  if (isFeedback) return

  // 6. Conversation — reuse or create
  const { data: existingConv } = await supabase
    .from('conversations').select('*').eq('guest_id', guest.id)
    .in('status', ['active','escalated']).order('created_at', { ascending: false }).limit(1).single()

  let conv = existingConv
  if (!conv) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({ guest_id: guest.id, hotel_id: hotel.id, status: 'active' })
      .select().single()
    conv = newConv
  }

  // ── IMPROVEMENT 1: Parallel fetches ───────────────────────
  // All six data sources are independent — fire them together.
  // Before: ~750ms sequential. After: ~150ms (slowest one wins).
  const endParallel = log.time('parallel_fetches', hCtx)

  const [partners, facilities, kbEntries, products, memory, history] = await Promise.all([
    getPartners(hotel.id),
    getFacilities(hotel.id),
    getKnowledgeBase(hotel.id),
    getAvailableProducts(hotel.id),
    loadGuestMemory(guest.id),
    getConversationHistory(conv.id, 20),
  ])

  endParallel()
  log.info('Parallel fetches done', { ...hCtx, partners: partners.length, kbEntries: kbEntries.length, products: products.length })

  // 8. Build system prompt
  const kbText     = formatKnowledgeForPrompt(kbEntries)
  const basePrompt = buildSystemPrompt(hotel, guest, partners)
  let systemPrompt = kbText ? `${basePrompt}\n\n${kbText}` : basePrompt

  // Stay status context
  const stayStatus = guest.stay_status || 'prospect'
  if (stayStatus === 'checked_out') {
    systemPrompt += `\n\n[STAY CONTEXT] This guest has ALREADY CHECKED OUT. Only help with: post-stay questions, lost items, invoice queries, or future rebooking. Be warm and grateful.`
  } else if (stayStatus === 'pre_arrival') {
    systemPrompt += `\n\n[STAY CONTEXT] Guest has a booking but NOT checked in yet. Check-in: ${guest.check_in}. Help them prepare for arrival.`
  } else if (stayStatus === 'active') {
    systemPrompt += `\n\n[STAY CONTEXT] Guest is checked in. Room: ${guest.room}. Check-out: ${guest.check_out}. Full concierge service.`
  }

  if (isRestricted) systemPrompt += RESTRICTED_PROMPT

  // Frustration detector
  const recentMsgs     = history.slice(-8)
  const recentGuest    = recentMsgs.filter(m => m.role === 'user')
  const recentBot      = recentMsgs.filter(m => m.role === 'assistant')
  const hadResolution  = recentBot.some(m => (m.content||'').includes('[BOOKING]') || (m.content||'').includes('confirmed') || (m.content||'').toLowerCase().includes('ticket'))
  if (recentGuest.length >= 3 && !hadResolution) {
    systemPrompt += `\n\n[FRUSTRATION ALERT] Guest sent ${recentGuest.length} messages without resolution. If you cannot resolve this reply, use [HANDOFF] immediately. Do not keep asking clarifying questions.`
    log.warn('Frustration alert triggered', { ...hCtx, ...gCtx, msgCount: recentGuest.length })
  }

  const facilityText = formatFacilitiesForPrompt(facilities)
  if (facilityText) systemPrompt += `\n\n${facilityText}`

  const memoryText = formatMemoryForPrompt(memory, guest.language || 'en')
  if (memoryText) systemPrompt += memoryText

  const productText = formatProductsForPrompt(products, guest.language || 'en')
  if (productText) systemPrompt += productText

  // Upsell context
  const lastBotMsg = [...history].reverse().find(m => m.role === 'assistant')
  const isRespondingToUpsell = lastBotMsg?.sent_by === 'scheduled' &&
    /book|arrange|réserv|buchen|reserv|prenotare/i.test(lastBotMsg?.content || '')
  if (isRespondingToUpsell) {
    systemPrompt += '\n\nCONTEXT: Guest is responding to your activity suggestions. If they show interest, book immediately.'
  }

  // 9. Save user message + notification
  await appendMessage(conv.id, 'user', message)
  await createNotification(hotel.id, {
    type: 'guest_message',
    title: `${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
    body: message.slice(0, 100),
    link_type: 'conversation', link_id: conv.id,
  })

  // 10. Flight lookup
  const allFlights = extractAllFlightNumbers(message)
  if (allFlights.length > 0) {
    const allResults = await Promise.all(allFlights.slice(0,2).map(fn => safeGetFlight(fn)))
    const flightData = allResults.find(f => f !== null) || null

    if (flightData) {
      const arrStr = flightData.arrivalTimeLocal
      const depStr = flightData.departureTimeLocal
      const delay  = flightData.arriveDelay || 0
      let taxiStr  = null
      if (arrStr) {
        const [h,m] = arrStr.split(':').map(Number)
        const total = h * 60 + m + 30
        taxiStr = `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
      }
      systemPrompt +=
        `\n\n[FLIGHT DATA — REAL TIME]\nFlight: ${flightData.iata} (${flightData.airline||''})` +
        `\nStatus: ${flightData.status}` +
        (arrStr ? `\nArrives: ${arrStr} local${delay > 15 ? ` — DELAYED ${delay}min` : ' — on time'}` : '') +
        (depStr ? `\nDeparts: ${depStr} local` : '') +
        (taxiStr ? `\nTaxi pickup: ${taxiStr} (30min after landing)` : '') +
        `\nCRITICAL: Use this data now. Tell the guest the flight time. Ask only: passengers + special needs.`
      log.info('Flight injected', { ...hCtx, flight: flightData.iata, status: flightData.status, delay })
    } else {
      systemPrompt += `\n\n[FLIGHT LOOKUP] No data for ${allFlights.join(', ')}. Ask: arrival or departure? Time? Passengers?`
    }
  }

  // 11. Auto-ticket for maintenance keywords
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
      .from('internal_tickets').select('id')
      .eq('hotel_id', hotel.id).eq('room', guest.room).eq('department', 'maintenance')
      .not('status', 'in', '("resolved","cancelled")').gte('created_at', twoHoursAgo).limit(1)

    if (!existingTicket || existingTicket.length === 0) {
      const { count } = await supabase.from('internal_tickets')
        .select('*', { count:'exact', head:true }).eq('hotel_id', hotel.id)
      try {
        await supabase.from('internal_tickets').insert({
          hotel_id: hotel.id, guest_id: guest.id, department: 'maintenance',
          category: 'room_issue', description: `[AUTO] Guest report: "${message.slice(0, 200)}"`,
          room: guest.room, priority: 'normal', status: 'pending',
          created_by: 'bot', ticket_number: (count||0) + 1,
        })
        autoTicketCreated = true
        log.info('Auto maintenance ticket created', { ...hCtx, ...gCtx })
      } catch(e) {
        await log.error('Auto-ticket insert failed', e, { ...hCtx, ...gCtx })
      }
    }
  }

  if (autoTicketCreated) {
    systemPrompt += `\n\n[MAINTENANCE TICKET CREATED] Acknowledge warmly. Tell them it's logged and maintenance will attend shortly. Daytime: within 30min. Overnight: within 20min. Do NOT troubleshoot.`
  }

  // 12. Call Claude
  const cleanHistory = history.filter(m => m.content && m.content.trim())
  let aiResponse
  const endClaude = log.time('claude_api', { ...hCtx, ...gCtx })

  try {
    aiResponse = await callClaude(systemPrompt, cleanHistory, message)
    endClaude()
    log.info('Claude responded', { ...hCtx, ...gCtx, chars: aiResponse.length })
  } catch (err) {
    endClaude()
    // IMPROVEMENT 3: Claude failures → Sentry critical alert
    await log.critical('Claude API failed — guest left without response', err, { ...hCtx, ...gCtx })
    const fb = {
      en:"I'm having a brief issue. Please try again.",ru:'Временная ошибка.',he:'שגיאה זמנית.',
      es:'Un momento, por favor.',de:'Kurzer Fehler. Bitte versuchen.',fr:'Un instant. Réessayez.',
      it:'Un momento. Riprova.',pt:'Um momento. Tente novamente.',zh:'请稍候，请重试。',
      ar:'خطأ مؤقت.',nl:'Even een fout. Probeer opnieuw.',pl:'Chwilowy błąd.',
      sv:'Kortvarigt fel.',fi:'Lyhyt virhe.',uk:'Тимчасова помилка.',el:'Σφάλμα.',ca:'Un moment.',
    }
    await sendWhatsApp(from, fb[guest.language]||fb.en)
    return
  }

  // 13. Handoff check — added missing language patterns
  const isHandoff = /\[handoff\]|connect you with our|connect you with reception|te pongo en contacto|je vous mets en contact|verbinde sie mit|vi metto in contatto|передаю вас|מעביר אותך|转接给|σας συνδέω/i.test(aiResponse)

  if (isHandoff) {
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
    await createNotification(hotel.id, {
      type: 'bot_handoff',
      title: `Handoff — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
      body: `"${message.slice(0, 80)}"`,
      link_type: 'conversation', link_id: conv.id,
    })
    notifyReceptionEscalation({
      hotelId: hotel.id,
      guestName: `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest',
      room: guest.room || null, convId: conv.id,
    }).catch(e => log.error('Push escalation failed', e, { ...hCtx, ...gCtx }))

    log.warn('Conversation escalated', { ...hCtx, ...gCtx, convId: conv.id })

    const receptionHours = hotel.config?.reception_hours || '08:00–23:00'
    const ackMsgs = {
      en: `I've passed your message to our team and someone will be with you shortly. Our reception is available ${receptionHours}. Thank you for your patience 🙏`,
      ru: `Я передал ваше сообщение нашей команде, скоро с вами свяжутся. Ресепшен работает ${receptionHours}. Спасибо за терпение 🙏`,
      he: `העברתי את הבקשה שלך לצוות שלנו, מישהו יצור איתך קשר בקרוב. הקבלה פתוחה ${receptionHours}. תודה על הסבלנות 🙏`,
      de: `Ich habe Ihre Nachricht weitergeleitet. Jemand meldet sich bald. Rezeption: ${receptionHours}. Vielen Dank 🙏`,
      fr: `J'ai transmis votre message. Quelqu'un vous contactera bientôt. Réception: ${receptionHours}. Merci 🙏`,
      es: `He pasado su mensaje. Alguien le atenderá en breve. Recepción: ${receptionHours}. Gracias 🙏`,
    }
    const ackMsg = ackMsgs[guest.language] || ackMsgs.en
    await sendWhatsApp(from, ackMsg)
    await appendMessage(conv.id, 'assistant', ackMsg)
  }

  // 14. Facility request
  const { hasFacility, facility, cleanResponse: facilityClean } = parseFacilityRequest(aiResponse)
  if (hasFacility && facility) {
    await processFacilityRequest(facility, hotel, guest, conv.id)
    await sendWhatsApp(from, facilityClean)
    await appendMessage(conv.id, 'assistant', facilityClean)
    return
  }

  // 15. Parse booking + product tags
  const { hasBooking, booking, cleanResponse: afterBooking } = parseBookingRequest(aiResponse)
  const { hasOrder, order: productOrder, cleanResponse: finalReply } = parseProductOrder(afterBooking || aiResponse)

  const replyText = finalReply || afterBooking || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  if (hasBooking && booking) {
    await processBooking(booking, hotel, guest, partners, isRespondingToUpsell ? 'upsell' : 'guest_request')
      .catch(e => log.error('processBooking failed', e, { ...hCtx, ...gCtx }))
    const partner = partners.find(p => p.type === booking.type)
    if (partner || booking.type) await updateGuestPreferences(guest.id, booking.type, partner?.name)
  }

  if (hasOrder && productOrder) {
    await processProductOrder(productOrder, hotel, guest, conv.id, products, from)
      .catch(e => log.critical('processProductOrder failed', e, { ...hCtx, ...gCtx }))
  }
}

// ── HELPERS ───────────────────────────────────────────────────

async function createNotification(hotelId, { type, title, body, link_type, link_id }) {
  try {
    await supabase.from('notifications').insert({ hotel_id: hotelId, type, title, body, link_type, link_id })
  } catch(e) { log.warn('Notification insert failed', { hotelId, type, error: e.message }) }
}

async function processFacilityRequest(facility, hotel, guest, convId) {
  try {
    const description = `FACILITY BOOKING REQUEST\nFacility: ${facility.facility}\nDate: ${facility.date||'TBC'}\nTime: ${facility.time||'TBC'}\nGuests: ${facility.guests||1}\n\nGuest: ${guest.name||''} ${guest.surname||''} · Room ${guest.room||'?'}`
    await supabase.from('internal_tickets').insert({
      hotel_id: hotel.id, guest_id: guest.id, department: 'concierge',
      category: 'facility_booking', description, room: guest.room,
      priority: 'normal', status: 'pending', created_by: 'bot',
    })
  } catch(e) { await log.error('Facility request failed', e, hotelCtx(hotel)) }
}

function scorePartner(partner, booking, stats) {
  const caps = partner.capabilities || partner.details || {}
  const details = booking.details || {}
  let score = 0, reasons = []

  if (booking.type === 'taxi') {
    const pax = details.passengers || details.pax || 1
    const maxPax = caps.max_passengers || 4
    if (pax <= maxPax) { score += 15; reasons.push(`fits ${pax} pax`) }
    const required = details.requirements || []
    const hasFeatures = caps.features || []
    const matched = required.filter(r => hasFeatures.some(f => f.toLowerCase().includes(r.toLowerCase())))
    score += required.length === 0 ? 15 : Math.round((matched.length / required.length) * 15)
    const luggage = details.luggage || 0
    if (luggage <= (caps.max_luggage || 4)) { score += 10 }
    const isOvernight = details.time && (parseInt(details.time) >= 23 || parseInt(details.time) <= 6)
    if (isOvernight && !caps.available_24h) { score -= 10; reasons.push('⚠ not 24h') }
  } else { score += 40 }

  const partnerStats = (stats||[]).find(s => s.partner_id === partner.id)
  const rate = partnerStats?.confirmation_rate_pct
  const total = partnerStats?.total_bookings || 0
  if (total < 3)   { score += 20; reasons.push('new partner') }
  else if (rate >= 90) { score += 35; reasons.push(`${rate}% confirm`) }
  else if (rate >= 75) { score += 28 }
  else if (rate >= 60) { score += 20 }
  else if (rate >= 40) { score += 10 }

  const destination = (details.destination || '').toLowerCase()
  const serviceAreas = (caps.service_areas || []).map(a => a.toLowerCase())
  if (serviceAreas.length === 0) { score += 15 }
  else {
    const match = serviceAreas.some(a => destination.includes(a) || a.includes(destination.split(' ')[0]))
    score += match ? 25 : 5
    if (match) reasons.push('covers destination')
  }

  return { score, reasons }
}

async function processBooking(booking, hotel, guest, partners, source = 'guest_request') {
  const candidates = partners.filter(p =>
    p.type === booking.type || p.name.toLowerCase().includes((booking.partner||'').toLowerCase())
  )
  if (candidates.length === 0) { log.warn('No partners for type', { type: booking.type }); return }

  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: recent } = await supabase.from('bookings').select('id')
    .eq('hotel_id', hotel.id).eq('guest_id', guest.id).eq('type', booking.type)
    .eq('status', 'pending').gte('created_at', tenMinsAgo).limit(1)
  if (recent && recent.length > 0) { log.warn('Duplicate booking — skipping', guestCtx(guest)); return }

  if (candidates.length === 1) return await _sendToPartner(candidates[0], booking, hotel, guest, source, false)

  const { data: stats } = await supabase.from('v_partner_stats').select('*').in('partner_id', candidates.map(p => p.id))
  const scored = candidates.map(p => ({ partner: p, ...scorePartner(p, booking, stats||[]) })).sort((a,b) => b.score - a.score)
  const best = scored[0]
  const flagLowConf = best.score < 40

  log.info('Partner selected', { ...hotelCtx(hotel), partner: best.partner.name, score: best.score, lowConf: flagLowConf })
  return await _sendToPartner(best.partner, booking, hotel, guest, source, flagLowConf, best.reasons)
}

async function _sendToPartner(partner, booking, hotel, guest, source, lowConfidence = false, matchReasons = []) {
  const details = booking.details || {}
  const base = details.price || (partner.details?.price_per_person ? partner.details.price_per_person * (details.passengers || details.pax || 1) : 0)
  const comm = base > 0 ? +(base * partner.commission_rate / 100).toFixed(2) : 0

  const { data: saved } = await supabase.from('bookings').insert({
    hotel_id: hotel.id, guest_id: guest.id, partner_id: partner.id,
    type: booking.type,
    details: { ...(booking.details||{}), _match_score: matchReasons.join(' | '), _low_confidence: lowConfidence },
    commission_amount: comm, status: 'pending', source,
  }).select().single()

  if (!saved) return

  if (lowConfidence) {
    supabase.from('notifications').insert({
      hotel_id: hotel.id, type: 'booking_low_confidence',
      title: `⚠ Low-confidence match — ${booking.type} for ${guest.name||'Guest'}`,
      body: `Sent to ${partner.name} but match score was low. Please verify.`,
      link_type: 'booking', link_id: saved.id,
    }).catch(()=>{})
  }

  try {
    const alertMsg = formatPartnerAlert(booking, guest, hotel)
    const msg = await sendWhatsApp(partner.phone, alertMsg)
    await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
    await markRetrySucceeded(saved.id)  // cancel any queued retries for this booking
    log.info('Partner alerted', { partnerId: partner.id, bookingId: saved.id })
  } catch(e) {
    // FIX #1: Queue for retry instead of just logging and giving up
    // Cron retries: 2min → 10min → 30min. After 3 failures → reception notified.
    const alertMsg = formatPartnerAlert(booking, guest, hotel)
    await queuePartnerAlert({
      hotelId:   hotel.id,
      bookingId: saved.id,
      partner,
      message:   alertMsg,
      lastError: e.message,
    })
    await log.critical('Partner alert FAILED — queued for retry', e, {
      ...hotelCtx(hotel), ...guestCtx(guest),
      partnerId: partner.id, partnerName: partner.name,
      bookingId: saved.id, bookingType: booking.type,
    })
  }
}

async function processProductOrder(orderData, hotel, guest, convId, products, guestPhone) {
  const product = products.find(p => p.id === orderData.product_id)
  const tier    = product && (product.tiers||[]).find(t => t.name.toLowerCase() === orderData.tier_name.toLowerCase())
  if (!product || !tier) { log.warn('Product or tier not found', { productId: orderData.product_id }); return }

  const quantity = orderData.quantity || 1

  try {
    const { order, paymentUrl } = await createGuestOrder({ hotelId: hotel.id, guestId: guest.id, convId, product, tier, quantity, hotel, guest })
    const total = (tier.price * quantity).toFixed(0)
    const paymentMsg = [`💳 *${product.name} — ${quantity > 1 ? `${quantity}× ` : ''}${tier.name}*`, `Total: €${total}`, ``, `Your secure payment link:`, paymentUrl, ``, `⏱ Valid for 24 hours. Once paid I'll send your confirmation immediately.`].join('\n')
    await sendWhatsApp(guestPhone, paymentMsg)
    await appendMessage(convId, 'assistant', paymentMsg, { sent_by: 'payment_bot' })
    log.info('Payment link sent', { ...hotelCtx(hotel), orderId: order.id, total })
  } catch(e) {
    await log.critical('Payment link FAILED — guest not charged but expects confirmation', e, { ...hotelCtx(hotel), ...guestCtx(guest) })
    try { await sendWhatsApp(guestPhone, `I'm arranging your payment link — please give me just a moment or ask reception to assist. 🙏`) } catch {}
  }
}
