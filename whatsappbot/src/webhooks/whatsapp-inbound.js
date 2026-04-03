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
import { logKnowledgeGap, detectHedging } from '../lib/knowledge-gaps.js'
import { getLocalGuideContext, detectLocalGuideIntent } from '../lib/local-guide.js'
import { callClaude } from '../lib/claude.js'
import { handleTicketReply } from '../lib/ticketing.js'
import { getKnowledgeBase, formatKnowledgeForPrompt } from '../lib/knowledge.js'
import { getFacilities, formatFacilitiesForPrompt, parseFacilityRequest } from '../lib/facilities.js'
import { handleFeedbackReply } from '../lib/scheduled.js'
import { loadGuestMemory, formatMemoryForPrompt, updateGuestPreferences } from '../lib/memory.js'
import { notifyReceptionEscalation } from '../lib/push.js'
import { getAvailableProducts, formatProductsForPrompt, parseProductOrder, createGuestOrder } from '../lib/stripe.js'
import { checkInbound, RESTRICTED_PROMPT } from '../lib/abuse.js'
import { sanitizeMessage, sanitizeName, sanitizeForPrompt, MAX_MESSAGE_LEN } from '../lib/sanitize.js'
import log, { hotelCtx, guestCtx, bookingCtx } from '../../lib/logger.js'
import { queuePartnerAlert, markRetrySucceeded } from '../lib/partner-retries.js'
import { parseCancelFacility, parseCancelBooking, parseCancelRoom,
         cancelFacility, cancelPartnerBooking, escalateRoomCancellation,
         CANCEL_CONFIRM, trackProspectConversion } from '../lib/cancellations.js'
import { parseSendImage, processImageRequest, buildImagePromptSection } from '../lib/images.js'
// Flight helpers defined inline below (safeGetFlight)
import { detectProspectInterests, updateProspectStage,
         buildProspectPromptSection } from '../lib/prospect-nurture.js'
import { handleFallback } from '../lib/fallback.js'

// ── FLIGHT HELPERS (inline — proven working) ──────────────────
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
  if (!key) { log.warn('RAPIDAPI_KEY not set'); return null }
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
          signal: AbortSignal.timeout(8000) }
      )
      log.info(`Flight API ${flightCode} ${date}: HTTP ${res.status}`)
      if (!res.ok) continue
      const data = await res.json()
      const f    = Array.isArray(data) ? data[0] : data
      if (!f) { log.info(`Flight API ${flightCode} ${date}: empty`); continue }

      const dep = f.departure || {}
      const arr = f.arrival   || {}
      const arrLocal = arr.predictedTime?.local || arr.revisedTime?.local || arr.scheduledTime?.local
      const depLocal = dep.revisedTime?.local   || dep.scheduledTime?.local
      const arrUtc   = arr.predictedTime?.utc   || arr.revisedTime?.utc   || arr.scheduledTime?.utc
      let arrDelay = 0
      if (arr.scheduledTime?.utc && arr.revisedTime?.utc) {
        arrDelay = Math.round((new Date(arr.revisedTime.utc) - new Date(arr.scheduledTime.utc)) / 60000)
      }
      const fmtLocal = (s) => { const m = (s||'').match(/(\d{2}:\d{2})/); return m ? m[1] : null }
      const result = {
        iata: f.number?.replace(' ','') || flightCode,
        status: f.status || 'Expected',
        airline: f.airline?.name,
        origin: dep.airport?.name,
        destination: arr.airport?.name,
        arrivalTimeLocal: fmtLocal(arrLocal),
        departureTimeLocal: fmtLocal(depLocal),
        estimatedArrive: arrUtc,
        arriveDelay: arrDelay,
        arriveTerminal: arr.terminal,
        gate: arr.gate || dep.gate,
      }
      log.info(`Flight API ${flightCode}: found`, { status: result.status, arr: result.arrivalTimeLocal })
      return result
    } catch (e) {
      log.warn(`Flight API ${flightCode} ${date} error: ${e.message}`)
      continue
    }
  }
  log.warn(`Flight API: no data for ${flightCode}`)
  return null
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message: rawMessage, profileName: rawProfileName } = parseIncomingMessage(rawBody)

  // ── Input sanitization ────────────────────────────────────
  const message     = sanitizeMessage(rawMessage)
  const profileName = sanitizeName(rawProfileName)

  if (rawMessage.length > MAX_MESSAGE_LEN) {
    log.warn('Message truncated', { to, originalLen: rawMessage.length, truncatedTo: MAX_MESSAGE_LEN })
  }

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
    // profileName is user-controlled (WhatsApp display name) — already sanitized above
    // but double-check length and split safely
    const cleanName = profileName.slice(0, 60)
    const parts     = cleanName.split(/\s+/).filter(Boolean)
    if (parts.length > 0 && parts[0].length >= 2) {  // skip single-char or empty names
      await updateGuest(guest.id, { name: parts[0], surname: parts.slice(1).join(' ')||null })
      guest.name    = parts[0]
      guest.surname = parts.slice(1).join(' ')||null
    }
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

  // 4. Language detection — always update when confident
  const detectedLang = detectLanguage(message)
  if (detectedLang !== guest.language) {
    const NON_LATIN  = ['ru','he','ar','zh','el','uk']
    const wordCount  = message.trim().split(/\s+/).length
    const isNonLatin = NON_LATIN.includes(detectedLang)

    // Non-Latin scripts: always update immediately — single character is definitive
    if (isNonLatin) {
      await updateGuest(guest.id, { language: detectedLang })
      guest.language = detectedLang

    // Latin language switching from null/en: update after 3+ words
    } else if (!guest.language || guest.language === 'en') {
      if (wordCount >= 3) {
        await updateGuest(guest.id, { language: detectedLang })
        guest.language = detectedLang
      }

    // Latin language switching FROM another Latin language (e.g. ES → EN, or EN → ES):
    // Update after just 1 message with 2+ words — lower threshold than initial detection
    // This fixes the case where a guest starts in English then switches to Spanish
    } else {
      if (wordCount >= 2) {
        await updateGuest(guest.id, { language: detectedLang })
        guest.language = detectedLang
        log.info('Guest language updated', { ...guestCtx(guest), from: guest.language, to: detectedLang })
      }
    }
  }

  // 4b. Facility alternative reply check (Yes/No to alternative slot offer)
  const msgTrimmed = message.trim().toLowerCase()
  if (msgTrimmed === 'yes' || msgTrimmed === 'no' || msgTrimmed === 'si' || msgTrimmed === 'да' || msgTrimmed === 'כן' || msgTrimmed === 'نعم') {
    // Check if this guest has a pending 'alternative' facility booking
    const { data: altBooking } = await supabase
      .from('facility_bookings')
      .select('*')
      .eq('guest_id', guest.id)
      .eq('status', 'alternative')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (altBooking) {
      const isYes = ['yes','si','да','כן','نعم','oui','ja','sí'].includes(msgTrimmed)
      const lang  = guest.language || 'en'
      const facName = altBooking.facility_name || 'facility'
      const altTime = altBooking.alternative_time || ''
      const altDate = altBooking.alternative_date || ''

      if (isYes) {
        // Confirm the alternative slot
        await supabase.from('facility_bookings').update({
          status:        'confirmed',
          time:          altBooking.alternative_time || altBooking.time,
          date:          altBooking.alternative_date || altBooking.date,
          guest_notified: true,
          ack_at:        new Date().toISOString(),
        }).eq('id', altBooking.id)

        const ref = altBooking.id.slice(-6).toUpperCase()
        const dateDisp = altDate ? (() => { try { const [y,m,d] = altDate.split('-'); return d+'/'+m+'/'+y } catch { return altDate } })() : ''
        const CONF = {
          en: `Your ${facName} booking is confirmed ✅\n\n📅 Date: ${dateDisp || 'TBC'}\n⏰ Time: ${altTime || 'TBC'}\n\nSee you there! 🎾\n\n🔖 Booking ref: ${ref}\n(Show this to staff on arrival)`,
          ru: `Бронирование ${facName} подтверждено ✅\n\n📅 ${dateDisp || 'TBC'}\n⏰ ${altTime || 'TBC'}\n\n🔖 Реф: ${ref}`,
          he: `ההזמנה ל${facName} אושרה ✅\n\n📅 ${dateDisp || 'TBC'}\n⏰ ${altTime || 'TBC'}\n\n🔖 מספר: ${ref}`,
          de: `${facName} bestätigt ✅\n\n📅 ${dateDisp || 'TBC'}\n⏰ ${altTime || 'TBC'}\n\n🔖 Ref: ${ref}`,
          fr: `${facName} confirmé ✅\n\n📅 ${dateDisp || 'TBC'}\n⏰ ${altTime || 'TBC'}\n\n🔖 Réf: ${ref}`,
          es: `${facName} confirmado ✅\n\n📅 ${dateDisp || 'TBC'}\n⏰ ${altTime || 'TBC'}\n\n🔖 Ref: ${ref}`,
        }
        const confirmMsg = CONF[lang] || CONF.en
        await sendWhatsApp(from, confirmMsg)
        await appendMessage(conv?.id, 'assistant', confirmMsg, { sent_by: 'facility_confirmation' })

        // Notify facility contact
        if (altBooking.facility_id) {
          const { data: fac } = await supabase.from('facilities').select('contact_phone, name').eq('id', altBooking.facility_id).single()
          if (fac?.contact_phone) {
            const facMsg = `✅ Guest confirmed the alternative slot: ${altTime}${altDate ? ' on ' + altDate : ''}\nRef: ${ref}\nGuest: ${guest.name || ''}${guest.room ? ' · Room ' + guest.room : ''}`
            await sendWhatsApp(fac.contact_phone, facMsg).catch(() => {})
          }
        }
      } else {
        // Guest said No — politely offer to find another time
        const DECLINE = {
          en: `No problem! Would you like me to check other available times for ${facName}? 😊`,
          ru: `Понятно! Подобрать другое время для ${facName}? 😊`,
          he: `אין בעיה! תרצה לבדוק זמנים אחרים ל${facName}? 😊`,
          de: `Kein Problem! Soll ich andere Zeiten für ${facName} prüfen? 😊`,
          fr: `Pas de problème! Voulez-vous que je vérifie d'autres créneaux pour ${facName}? 😊`,
          es: `¡No hay problema! ¿Busco otros horarios disponibles para ${facName}? 😊`,
        }
        const declineMsg = DECLINE[lang] || DECLINE.en
        await supabase.from('facility_bookings').update({ status: 'rejected' }).eq('id', altBooking.id)
        await sendWhatsApp(from, declineMsg)
        await appendMessage(conv?.id, 'assistant', declineMsg, { sent_by: 'facility_confirmation' })
      }
      return  // handled — don't pass to Claude or ticket handler
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

  // ── Per-guest flight lookup rate limit ───────────────────
  // Prevent quota abuse — max 3 flight lookups per guest per 10 minutes
  if (!global._flightRateMap) global._flightRateMap = new Map()
  const flightRateKey    = `${guest.id}`
  const flightRateWindow = 10 * 60 * 1000
  const flightRateMax    = 3
  const flightRateNow    = Date.now()
  const flightRateRec    = global._flightRateMap.get(flightRateKey) || { count:0, start: flightRateNow }
  if (flightRateNow - flightRateRec.start > flightRateWindow) {
    global._flightRateMap.set(flightRateKey, { count: 0, start: flightRateNow })
  }
  const flightRateLimited = flightRateRec.count >= flightRateMax

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
  // Sanitize DB-sourced fields before prompt injection
  // A guest's name or staff notes stored in DB could contain injection strings
  const safeGuest = {
    ...guest,
    name:     sanitizeForPrompt(guest.name, 60),
    surname:  sanitizeForPrompt(guest.surname, 60),
    room:     (guest.room||'').replace(/[^\w\s\-]/g, '').slice(0, 10),
    notes:    sanitizeForPrompt(guest.notes, 200),
  }
  const kbText     = formatKnowledgeForPrompt(kbEntries)
  const basePrompt = buildSystemPrompt(hotel, safeGuest, partners)
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

  // Feature #5: Image sending
  const imagePromptSection = buildImagePromptSection(hotel)
  if (imagePromptSection) systemPrompt += imagePromptSection

  // Feature #7: Prospect context
  if (guest.guest_type === 'prospect' || guest.stay_status === 'prospect') {
    systemPrompt += buildProspectPromptSection(guest, hotel)
    const interests = detectProspectInterests(message)
    if (interests.length > 0) {
      await updateProspectStage(guest.id, 'interested', interests)
    }
  }

  // Cancellation instructions for Claude
  systemPrompt += '\n\nCANCELLATION HANDLING:\n' +
    'When a guest wants to cancel something, use these tags:\n\n' +
    'For facility bookings (tennis, spa, conference room, pool):\n' +
    '[CANCEL_FACILITY]{\"type\":\"tennis\",\"time\":\"15:00\"}\n\n' +
    'For partner bookings (taxi, restaurant, activity):\n' +
    '[CANCEL_BOOKING]{\"type\":\"taxi\",\"reason\":\"plans changed\"}\n\n' +
    'For room/stay cancellations — NEVER cancel, always escalate:\n' +
    '[CANCEL_ROOM]\n\n' +
    'Place the tag at the END of your response. Only use ONE cancellation tag per response.'

  // 8b. Quick ack — send ⏳ immediately for requests needing heavy processing
  // Guest sees response within 1-2s instead of waiting 5-8s in silence
  const needsAck = /\b(book|taxi|transfer|airport|restaurant|table|tour|cruise|spa|activity|flight|pay|order|room|reserve|arrange|help me|i need|i want)\b/i.test(message)
  if (needsAck) {
    sendQuickAck(from, guest.language).catch(() => {})  // fire-and-forget
  }

  // 9. Save user message + notification
  await appendMessage(conv.id, 'user', message)
  await createNotification(hotel.id, {
    type: 'guest_message',
    title: `${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
    body: message.slice(0, 100),
    link_type: 'conversation', link_id: conv.id,
  })

  // 9a. Local Guide context injection — restaurants, beaches, attractions
  const localGuideIntents = detectLocalGuideIntent(message)
  if (localGuideIntents.length > 0) {
    const localGuideCtx = await getLocalGuideContext(hotel.id, message).catch(() => null)
    if (localGuideCtx) {
      systemPrompt += localGuideCtx
      log.info('Local guide context injected', { ...hCtx, intents: localGuideIntents })
    }
  }

  // 9b. Multi-intent detection — inject warning if message has multiple booking types
  const msgLowerFull = message.toLowerCase()
  const hasRoomIntent = /\b(room|suite|accommodation|check.?in|check.?out|reserv.*room|book.*room|room.*book|upgrade|transfer.*room)\b/i.test(message)
  const hasTaxiIntent = /\b(taxi|transfer|airport|pickup|pick.?up|driver|car|ride|transport)\b/i.test(message)
  const hasRestaurantIntent = /\b(restaurant|table|dinner|lunch|breakfast|reserv.*table|book.*table|dining)\b/i.test(message)
  const hasActivityIntent = /\b(tour|boat|cruise|activity|trip|excursion|booking.*activity)\b/i.test(message)
  const serviceCount = [hasTaxiIntent, hasRestaurantIntent, hasActivityIntent].filter(Boolean).length
  const isMultiIntent = (hasRoomIntent && serviceCount > 0) || serviceCount > 1
  if (isMultiIntent) {
    systemPrompt += `\n\n[MULTI-REQUEST DETECTED] This message contains multiple booking requests. ` +
      `You MUST handle them one at a time. ` +
      `${hasRoomIntent ? 'Room request detected — output [ESCALATE] for that. ' : ''}` +
      `Output only ONE [BOOKING] tag maximum. ` +
      `Tell the guest you are handling the first request and will sort the next one immediately after.`
    log.info('Multi-intent message detected', { ...hCtx, hasRoom: hasRoomIntent, taxi: hasTaxiIntent, restaurant: hasRestaurantIntent })
  }

  // 10. Flight lookup — rate limited to 3 per guest per 10 minutes
  const allFlights = !flightRateLimited ? extractAllFlightNumbers(message) : []
  if (flightRateLimited && extractAllFlightNumbers(message).length > 0) {
    log.warn('Flight lookup rate limited', { ...hCtx, ...gCtx })
    global._flightRateMap.set(flightRateKey, { count: flightRateRec.count + 1, start: flightRateRec.start })
  }
  if (allFlights.length > 0) {
    global._flightRateMap.set(flightRateKey, { count: (flightRateRec.count||0) + 1, start: flightRateRec.start })
    log.info('Flight numbers detected', { flights: allFlights })
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
        `\n\n⚠️ OVERRIDE ALL PREVIOUS FLIGHT INSTRUCTIONS ⚠️` +
        `\nYou DO have live flight data right now. Ignore any earlier instruction saying you don't.` +
        `\nDo NOT refer the guest to any website. Do NOT say you lack flight information.` +
        `\n\n[FLIGHT DATA — REAL TIME]\nFlight: ${flightData.iata} (${flightData.airline||''})` +
        `\nFrom: ${flightData.origin||'?'} → To: ${flightData.destination||'?'}` +
        `\nStatus: ${flightData.status}` +
        (arrStr ? `\nArrives: ${arrStr} local${delay > 15 ? ` — DELAYED ${delay}min` : ' — on time'}` : '') +
        (depStr ? `\nDeparts: ${depStr} local` : '') +
        (taxiStr ? `\nRecommended taxi pickup: ${taxiStr} (30min after landing + clearance)` : '') +
        `\nCRITICAL: Tell the guest the flight time clearly. Ask ONLY: how many passengers?`
      log.info('Flight injected', { ...hCtx, flight: flightData.iata, status: flightData.status, delay })
    } else {
      // Soft fallback — don't interrogate the guest with multiple questions
      systemPrompt += `\n\n[FLIGHT LOOKUP] Flight ${allFlights.join(', ')} detected in message. ` +
        `Live API data is temporarily unavailable. ` +
        `Do NOT recommend any external websites (not hermesairports.com or any other). ` +
        `Do NOT say you lack flight capabilities. ` +
        `Simply ask: "Could you confirm the arrival time so I can arrange your taxi?" Then book immediately.`
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
    await log.critical('Claude API failed — using rule-based fallback', err, { ...hCtx, ...gCtx })
    // Feature #12: Rule-based fallback instead of dead-end error message
    const { reply: fallbackReply } = await handleFallback(
      message, hotel, guest, conv, 'claude_error'
    )
    await sendWhatsApp(from, fallbackReply)
    await appendMessage(conv.id, 'assistant', fallbackReply, { sent_by: 'fallback' })
    return
  }

  // 13. Handoff check — added missing language patterns
  const isHandoff = /\[handoff\]|connect you with (?:our )?(?:reception|team|staff|front desk|manager)|te pongo en contacto con (?:recepci[oó]n|el equipo)|je vous mets en contact avec|verbinde sie mit (?:der rezeption|unserem team)|передаю вас (?:на ресепшн|команде)|מעביר אותך ל(?:צוות|קבלה)|转接给(?:前台|我们的团队)|σας συνδέω με/i.test(aiResponse)

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
    return  // handoff handled — do not fall through to normal reply path
  }

  // Feature #2: Room cancellation — escalate immediately
  if (parseCancelRoom(aiResponse)) {
    await escalateRoomCancellation(hotel, guest, conv.id)
    const roomMsg = CANCEL_CONFIRM.room[guest.language] || CANCEL_CONFIRM.room.en
    await sendWhatsApp(from, roomMsg)
    await appendMessage(conv.id, 'assistant', roomMsg)
    return
  }

  // Feature #2: Facility cancellation (Flow A)
  const { hasCancelFacility, facilityCancel, cleanResponse: afterFacilityCancel } = parseCancelFacility(aiResponse)
  if (hasCancelFacility && facilityCancel) {
    const result = await cancelFacility(facilityCancel, hotel, guest, conv.id)
    const lang   = guest.language || 'en'
    const reply  = afterFacilityCancel ||
      (CANCEL_CONFIRM.facility[lang] || CANCEL_CONFIRM.facility.en)(facilityCancel.type)
    await sendWhatsApp(from, reply)
    await appendMessage(conv.id, 'assistant', reply)
    return
  }

  // Feature #2: Partner booking cancellation (Flow B)
  const { hasCancelBooking, bookingCancel, cleanResponse: afterBookingCancel } = parseCancelBooking(aiResponse)
  if (hasCancelBooking && bookingCancel) {
    const result  = await cancelPartnerBooking(bookingCancel, hotel, guest, conv.id)
    const lang    = guest.language || 'en'
    const reply   = afterBookingCancel ||
      (CANCEL_CONFIRM.partner[lang] || CANCEL_CONFIRM.partner.en)(bookingCancel.type, result.partner?.name)
    await sendWhatsApp(from, reply)
    await appendMessage(conv.id, 'assistant', reply)
    return
  }

  // Feature #5: Image sending
  const { hasSendImage, imageRequest, cleanResponse: afterImageTag } = parseSendImage(aiResponse)
  if (hasSendImage && imageRequest) {
    const textPart = afterImageTag || ''
    if (textPart.trim()) {
      await sendWhatsApp(from, textPart)
      await appendMessage(conv.id, 'assistant', textPart)
    }
    const imageSent = await processImageRequest(
      imageRequest, hotel, guest, from, conv.id, appendMessage
    )
    if (!imageSent && !textPart.trim()) {
      const fallbackText = `I'll have that information for you shortly! 😊`
      await sendWhatsApp(from, fallbackText)
      await appendMessage(conv.id, 'assistant', fallbackText)
    }
    return
  }

  // 14. Facility request
  const { hasFacility, facility, cleanResponse: facilityClean } = parseFacilityRequest(aiResponse)
  if (hasFacility && facility) {
    await processFacilityRequest(facility, hotel, guest, conv.id)
    await sendWhatsApp(from, facilityClean)
    await appendMessage(conv.id, 'assistant', facilityClean)
    return
  }

  // 14b. Detect [ESCALATE] tag — for room bookings and complex requests
  //  Claude outputs [ESCALATE] when it needs to hand off to reception
  //  Can co-exist with [BOOKING] for multi-intent messages (e.g. taxi + room)
  let processedResponse = aiResponse
  if (aiResponse.includes('[ESCALATE]')) {
    processedResponse = aiResponse.replace(/\[ESCALATE\]/g, '').trim()
    // Mark conversation as escalated so reception sees it
    try { await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id) } catch {}
    const escalateBody = isMultiIntent
      ? `Multi-request: guest asked for room + service. Bot handled service; room needs reception. Message: ${message.slice(0, 80)}`
      : `Bot escalated: ${message.slice(0, 80)}`
    try {
      await supabase.from('notifications').insert({
        hotel_id: hotel.id, type: 'escalation',
        title: `Reception needed — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
        body: escalateBody,
        link_type: 'conversation', link_id: conv.id,
      })
    } catch {}
    try { await notifyReceptionEscalation({ hotelId: hotel.id, guestName: `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest', room: guest.room || null, convId: conv.id }) } catch {}
    log.info('Bot escalated via [ESCALATE] tag', { ...hCtx, ...gCtx, isMultiIntent })
  }

  // 15. Parse booking + product tags
  const { hasBooking, booking, cleanResponse: afterBooking } = parseBookingRequest(processedResponse)
  // Check for cash payment intent in the ORIGINAL aiResponse (before tag stripping)
  const hasCashIntent = /\b(cash|pay.?on.?site|pay.?at.?(hotel|arrival|reception)|onsite|on.?arrival)\b/i.test(message) &&
    /\b(cash|pay.?cash|prefer.?cash|want.?to.?pay.?cash|paying.?cash)\b/i.test(message)
  const { hasOrder, order: productOrder, cleanResponse: finalReply } = parseProductOrder(afterBooking || processedResponse)

  const replyText = finalReply || afterBooking || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  // ── Knowledge gap detection ───────────────────────────────
  // Log questions the bot couldn't answer confidently
  const wasEscalated = processedResponse.includes('[ESCALATE]') || conv.status === 'escalated'
  const hasHedging   = detectHedging(replyText)
  if (wasEscalated || hasHedging) {
    logKnowledgeGap(hotel.id, {
      questionText:    message,
      detectionSource: wasEscalated ? 'escalation' : 'hedging',
      language:        guest.language || 'en',
      conversationId:  conv.id,
    })
  }

  if (hasBooking && booking) {
    await processBooking(booking, hotel, guest, partners, isRespondingToUpsell ? 'upsell' : 'guest_request')
      .catch(e => log.error('processBooking failed', e, { ...hCtx, ...gCtx }))
    const partner = partners.find(p => p.type === booking.type)
    if (partner || booking.type) await updateGuestPreferences(guest.id, booking.type, partner?.name)

    // Feature #7: Track prospect conversion
    if (guest.guest_type === 'prospect' || guest.stay_status === 'prospect') {
      await trackProspectConversion(guest.id, null)
        .catch(e => log.warn('trackProspectConversion failed', { error: e.message }))
    }
  }

  if (hasOrder && productOrder) {
    await processProductOrder(productOrder, hotel, guest, conv.id, products, from, hasCashIntent)
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
    })
  }

  try {
    const msg = await sendWhatsApp(partner.phone, formatPartnerAlert(booking, guest, hotel))
    await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
    log.info('Partner alerted', { partnerId: partner.id, bookingId: saved.id })
  } catch(e) {
    // IMPROVEMENT 3: Sentry critical — booking saved but partner never notified
    await log.critical('Partner alert FAILED — booking created but partner not notified', e, {
      ...hotelCtx(hotel), ...guestCtx(guest),
      partnerId: partner.id, partnerName: partner.name,
      bookingId: saved.id, bookingType: booking.type,
    })
  }
}

async function processProductOrder(orderData, hotel, guest, convId, products, guestPhone, cashPayment = false) {
  const product = products.find(p => p.id === orderData.product_id)
  const tier    = product && (product.tiers||[]).find(t => t.name.toLowerCase() === orderData.tier_name.toLowerCase())
  if (!product || !tier) { log.warn('Product or tier not found', { productId: orderData.product_id }); return }

  const quantity = orderData.quantity || 1
  const total    = (tier.price * quantity).toFixed(0)

  if (cashPayment) {
    // ── CASH ON ARRIVAL flow ─────────────────────────────────
    // Create order record with cash_pending status (no Stripe session)
    try {
      const { data: order } = await supabase.from('guest_orders').insert({
        hotel_id:         hotel.id,
        guest_id:         guest.id,
        product_id:       product.id,
        partner_id:       product.partner_id || null,
        conversation_id:  convId,
        tier_name:        tier.name,
        quantity,
        unit_price:       tier.price,
        total_amount:     tier.price * quantity,
        amount_eur:       tier.price * quantity,
        product_name:     product.name,
        commission_rate:  product.commission_rate || 15,
        commission_amount: +((tier.price * quantity) * (product.commission_rate || 15) / 100).toFixed(2),
        status:           'cash_pending',
      }).select().single()

      // Determine which department to notify based on product category
      const deptMap = {
        spa_treatment: 'wellness', wellness: 'wellness',
        activity: 'concierge',    transport: 'concierge',
        dining: 'fnb',            birthday: 'fnb',
        celebration: 'fnb',       membership: 'concierge',
      }
      const dept = deptMap[product.category] || 'concierge'

      // Notify the relevant department
      const guestName = `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest'
      await supabase.from('notifications').insert({
        hotel_id:  hotel.id,
        type:      'cash_order',
        title:     `💵 Cash on arrival — ${product.name}`,
        body:      `${guestName} · Room ${guest.room||'?'} — ${quantity > 1 ? quantity + '× ' : ''}${tier.name} — €${total} — CASH ON ARRIVAL. Please confirm with guest directly.`,
        link_type: 'order',
        link_id:   order?.id || null,
        urgent:    true,
        department: dept,
      })

      log.info('Cash order created + dept notified', { ...hotelCtx(hotel), dept, total, product: product.name })
    } catch(e) {
      await log.critical('Cash order creation failed', e, { ...hotelCtx(hotel), ...guestCtx(guest) })
    }
    return
  }

  // ── STRIPE payment link flow (existing) ─────────────────────
  try {
    const { order, paymentUrl } = await createGuestOrder({ hotelId: hotel.id, guestId: guest.id, convId, product, tier, quantity, hotel, guest })
    const paymentMsg = [`💳 *${product.name} — ${quantity > 1 ? `${quantity}× ` : ''}${tier.name}*`, `Total: €${total}`, ``, `Your secure payment link:`, paymentUrl, ``, `⏱ Valid for 24 hours. Once paid I'll send your confirmation immediately.`].join('\n')
    await sendWhatsApp(guestPhone, paymentMsg)
    await appendMessage(convId, 'assistant', paymentMsg, { sent_by: 'payment_bot' })
    log.info('Payment link sent', { ...hotelCtx(hotel), orderId: order.id, total })
  } catch(e) {
    await log.critical('Payment link FAILED — guest not charged but expects confirmation', e, { ...hotelCtx(hotel), ...guestCtx(guest) })
    try { await sendWhatsApp(guestPhone, `I'm arranging your payment link — please give me just a moment or ask reception to assist. 🙏`) } catch {}
  }
}
