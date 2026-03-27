// src/webhooks/whatsapp-inbound.js
// ============================================================
// Key additions vs previous version:
//
// 1. QR code room detection — if message matches "Room 312"
//    pattern, resolve to active guest in that room
//    Link companion guests automatically
//
// 2. Stay status awareness — bot behaves differently based
//    on stay_status (pre_arrival, active, checked_out, prospect)
//
// 3. Grey zone handling — if room exists but no active guest
//    (between checkout and next check-in), ask to confirm
// ============================================================

import {
  getHotelByWhatsappNumber,
  getOrCreateGuest,
  getGuestByRoom,
  linkCompanionGuest,
  updateGuest,
  getOrCreateConversation,
  appendMessage,
  getConversationHistory,
  getPartners,
  createBooking,
  supabase,
} from '../lib/supabase.js'
import { sendWhatsApp, parseIncomingMessage }           from '../lib/twilio.js'
import { detectLanguage, parseBookingRequest, formatPartnerAlert } from '../lib/language.js'
import { callClaude }                                   from '../lib/claude.js'
import { handleTicketReply }                            from '../lib/ticketing.js'
import { buildSystemPromptWithKB }                      from '../lib/knowledge.js'
import { getFacilities, formatFacilitiesForPrompt, parseFacilityRequest } from '../lib/facilities.js'
import { handleFeedbackReply }                          from '../lib/scheduled.js'
import { loadGuestMemory, formatMemoryForPrompt, updateGuestPreferences } from '../lib/memory.js'
import { notifyReceptionEscalation, notifyReceptionMessage } from '../lib/push.js'
import { getAvailableProducts, formatProductsForPrompt, parseProductOrder, createGuestOrder } from '../lib/stripe.js'

// ── ROOM NUMBER PATTERN ───────────────────────────────────────
// Matches: "Room 312", "room 312", "312", "room: 312", "#312"
const ROOM_PATTERN = /^(?:room[:\s#]*)?(\d{1,4}[a-z]?)$/i

function extractRoomNumber(message) {
  const clean = message.trim()
  const match = clean.match(ROOM_PATTERN)
  return match ? match[1].toUpperCase() : null
}

// ── STAY STATUS CONTEXT FOR BOT ───────────────────────────────
function getStayContext(guest) {
  switch (guest.stay_status) {
    case 'pre_arrival':
      return `\n\n[STAY CONTEXT] This guest has a booking but has not checked in yet. Check-in date: ${guest.check_in}. Be welcoming and help them prepare for their arrival.`
    case 'active':
      return `\n\n[STAY CONTEXT] Guest is currently checked in. Room: ${guest.room}. Check-out: ${guest.check_out}. Provide full concierge service.`
    case 'checked_out':
      return `\n\n[STAY CONTEXT] This guest has already checked out. They may be giving feedback or have a post-stay question. Be warm and helpful, mention you hope their stay was wonderful.`
    case 'prospect':
    default:
      return `\n\n[STAY CONTEXT] This person has not booked a stay yet. They may be enquiring about the hotel or services. Be welcoming and informative.`
  }
}

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)
  if (!message.trim()) return

  // 1. Ticket reply check (staff WhatsApp replies)
  const isTicketReply = await handleTicketReply(from, message)
  if (isTicketReply) return

  // 2. Load hotel
  let hotel
  try { hotel = await getHotelByWhatsappNumber(to) }
  catch { console.error(`No hotel for: ${to}`); return }

  // 3. ── QR CODE ROOM DETECTION ────────────────────────────
  // Check if this is a room number message (from QR code scan)
  const roomNumber = extractRoomNumber(message)

  if (roomNumber) {
    const activeGuest = await getGuestByRoom(hotel.id, roomNumber)

    if (activeGuest) {
      // Someone scanned the room QR — check if it's the primary guest
      // or a companion (family member, colleague)
      const cleanFrom = from.replace('whatsapp:', '')

      if (cleanFrom === activeGuest.phone) {
        // Primary guest is messaging their own room number — normal flow
        // Fall through to standard handling below
      } else {
        // Different phone — this is a companion guest
        const companion = await linkCompanionGuest(hotel.id, from, activeGuest)
        const lang      = detectLanguage(message)

        // Welcome companion with room context
        const companionWelcome = {
          en: `Welcome! 🌴 I've linked you to ${roomNumber}.\n\nI'm the hotel concierge — available 24/7 for restaurant bookings, taxis, activities and anything you need. How can I help?`,
          ru: `Добро пожаловать! 🌴 Я связал вас с номером ${roomNumber}.\n\nЯ консьерж отеля — доступен 24/7. Чем могу помочь?`,
          he: `ברוך הבא! 🌴 קישרתי אותך לחדר ${roomNumber}.\n\nאני הקונסיירז' של המלון — זמין 24/7. איך אוכל לעזור?`,
        }

        await sendWhatsApp(from, companionWelcome[lang] || companionWelcome.en)
        console.log(`Companion guest linked to room ${roomNumber}`)
        return
      }
    } else {
      // No active guest in this room — grey zone
      // Could be: guest between checkout and next check-in,
      // or someone who typed a room number in conversation
      // Ask gently to confirm
      const greyZoneMsg = {
        en: `Thanks for your message! Are you a current hotel guest checking in today, or are you already checked in? Just reply "checking in" or "already here" and I'll get you set up. 🌴`,
        ru: `Спасибо за сообщение! Вы заезжаете сегодня или уже в отеле? Ответьте "заезжаю" или "я уже здесь". 🌴`,
        he: `תודה על הפנייה! האם אתה מגיע היום לצ'ק-אין, או שאתה כבר בבית המלון? ענה "מגיע היום" או "אני כבר כאן". 🌴`,
      }
      const lang = detectLanguage(message)
      await sendWhatsApp(from, greyZoneMsg[lang] || greyZoneMsg.en)
      return
    }
  }

  // 4. Standard guest lookup by phone
  const guest = await getOrCreateGuest(hotel.id, from)

  // Update name from WhatsApp profile if not set
  if (!guest.name && profileName) {
    const parts = profileName.trim().split(' ')
    await updateGuest(guest.id, { name: parts[0]||null, surname: parts.slice(1).join(' ')||null })
    guest.name    = parts[0]||null
    guest.surname = parts.slice(1).join(' ')||null
  }

  // 5. Language detection
  const lang = detectLanguage(message)
  if (lang !== guest.language) { await updateGuest(guest.id, { language: lang }); guest.language = lang }

  // 6. Feedback reply check
  const isFeedback = await handleFeedbackReply(from, message, hotel.id)
  if (isFeedback) return

  // 7. Conversation — reuse or create
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('*')
    .eq('guest_id', guest.id)
    .in('status', ['active', 'escalated'])
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
  if (conv.status === 'escalated') {
    await supabase.from('conversations').update({ status: 'active' }).eq('id', conv.id)
  }

  const history = (conv.messages || []).slice(-20)

  // 8. Load guest memory
  const memory   = await loadGuestMemory(guest.id)
  const partners = await getPartners(hotel.id)
  const facilities = await getFacilities(hotel.id)

  // 9. Build system prompt with KB + stay context
  let systemPrompt = await buildSystemPromptWithKB(hotel, guest, partners)
  systemPrompt    += getStayContext(guest)  // ← adds stay_status context

  if (facilities?.length > 0) {
    systemPrompt += formatFacilitiesForPrompt(facilities)
  }
  if (memory) {
    systemPrompt += formatMemoryForPrompt(memory)
  }

  // Add products
  try {
    const products = await getAvailableProducts(hotel.id)
    if (products?.length > 0) {
      systemPrompt += formatProductsForPrompt(products)
    }
  } catch {}

  // 10. Check for facility booking intent
  const facilityRequest = parseFacilityRequest(message)
  if (facilityRequest && guest.stay_status === 'active') {
    // Create internal ticket for facility request
    const description = `FACILITY BOOKING REQUEST\nFacility: ${facilityRequest.facility}\nDate: ${facilityRequest.date||'TBC'}\nTime: ${facilityRequest.time||'TBC'}\nGuests: ${facilityRequest.guests||1}\n\nGuest: ${guest.name||''} ${guest.surname||''} · Room ${guest.room||'?'}\nPlease check availability and confirm with guest via WhatsApp.`

    await supabase.from('internal_tickets').insert({
      hotel_id:    hotel.id,
      guest_id:    guest.id,
      department:  'concierge',
      category:    'facility_booking',
      description,
      room:        guest.room,
      priority:    'normal',
      status:      'pending',
      created_by:  'bot',
    }).catch(() => {})
  }

  // 11. Call Claude
  await appendMessage(conv.id, 'user', message)

  const botReply = await callClaude(systemPrompt, [
    ...history,
    { role: 'user', content: message }
  ])

  await appendMessage(conv.id, 'assistant', botReply)

  // 12. Parse booking intent
  if (botReply.includes('[BOOKING_REQUEST]')) {
    const bookingDetails = parseBookingRequest(botReply, guest, hotel)
    if (bookingDetails) {
      const booking = await createBooking({
        hotel_id:   hotel.id,
        guest_id:   guest.id,
        partner_id: bookingDetails.partnerId || null,
        type:       bookingDetails.type,
        details:    bookingDetails.details,
        status:     'pending',
        created_by: 'bot',
      })

      const matchedPartner = partners.find(p =>
        p.type === bookingDetails.type || p.id === bookingDetails.partnerId
      )

      if (matchedPartner) {
        const alertMsg = formatPartnerAlert(booking, guest, hotel, matchedPartner)
        await sendWhatsApp(matchedPartner.phone, alertMsg)
      }
    }
  }

  // 13. Check for product order
  try {
    const productOrder = await parseProductOrder(botReply, guest, hotel)
    if (productOrder) {
      await createGuestOrder(productOrder)
    }
  } catch {}

  // 14. Handle escalation
  if (botReply.includes('[ESCALATE]') || botReply.includes('[HANDOFF]')) {
    await supabase
      .from('conversations')
      .update({ status: 'escalated' })
      .eq('id', conv.id)

    await notifyReceptionEscalation({
      hotelId: hotel.id,
      guestName: `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest',
      room:    guest.room,
      message,
    }).catch(() => {})
  } else {
    await notifyReceptionMessage({
      hotelId:  hotel.id,
      guestName: `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest',
      room:     guest.room,
      message,
    }).catch(() => {})
  }

  // 15. Update guest memory/preferences
  await updateGuestPreferences(guest.id, message, botReply).catch(() => {})

  // 16. Send reply (clean up internal tags)
  const cleanReply = botReply
    .replace(/\[BOOKING_REQUEST\].*$/s, '')
    .replace(/\[ESCALATE\]/g, '')
    .replace(/\[HANDOFF\]/g, '')
    .trim()

  await sendWhatsApp(from, cleanReply)

  // 17. Add stay context note if pre_arrival guest
  // (bot already handles via system prompt, just log)
  console.log(`Reply sent to ${from} (stay_status: ${guest.stay_status || 'unknown'})`)
}
