// src/webhooks/whatsapp-inbound.js (updated - adds facility requests)
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

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)
  if (!message.trim()) return

  // 1. Check ticket reply from dept staff
  const isTicketReply = await handleTicketReply(from, message)
  if (isTicketReply) return

  // 2. Load hotel
  let hotel
  try { hotel = await getHotelByWhatsappNumber(to) }
  catch { console.error(`No hotel for: ${to}`); return }

  // 3. Guest
  const guest = await getOrCreateGuest(hotel.id, from)
  if (!guest.name && profileName) {
    const parts = profileName.trim().split(' ')
    await updateGuest(guest.id, { name: parts[0]||null, surname: parts.slice(1).join(' ')||null })
    guest.name = parts[0]||null; guest.surname = parts.slice(1).join(' ')||null
  }

  // 4. Language
  const lang = detectLanguage(message)
  if (lang !== guest.language) { await updateGuest(guest.id, { language: lang }); guest.language = lang }

  // 5. Conversation — reuse existing active/escalated conversation for this guest
  // This fixes the persistence issue — one conversation per stay
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
      .select()
      .single()
    conv = newConv
  }

  // If it was escalated and guest messages again — set back to active
  if (conv.status === 'escalated') {
    await supabase.from('conversations').update({ status: 'active' }).eq('id', conv.id)
  }

  const history = ((conv.messages || [])).slice(-20)

  // 6. Build system prompt with knowledge base + facilities
  const partners   = await getPartners(hotel.id)
  const facilities = await getFacilities(hotel.id)

  let systemPrompt = await buildSystemPromptWithKB(hotel, guest, partners)
  const facilityText = formatFacilitiesForPrompt(facilities)
  if (facilityText) systemPrompt += `\n\n${facilityText}`

  // 7. Save user message
  await appendMessage(conv.id, 'user', message)

  // 8. Create notification
  await createNotification(hotel.id, {
    type:      'guest_message',
    title:     `${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
    body:      message.slice(0, 100),
    link_type: 'conversation',
    link_id:   conv.id,
  })

  // 9. Claude
  let aiResponse
  try { aiResponse = await callClaude(systemPrompt, history, message) }
  catch {
    const fb = { en:"I'm having a brief issue. Please try again.", ru:'Временная ошибка.', he:'שגיאה זמנית.' }
    await sendWhatsApp(from, fb[guest.language]||fb.en); return
  }

  // 10. Check for handoff
  const isHandoff = aiResponse.toLowerCase().includes('[handoff]') ||
    aiResponse.toLowerCase().includes('connect you with our') ||
    aiResponse.toLowerCase().includes('connect you with reception')

  if (isHandoff) {
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
    await createNotification(hotel.id, {
      type:      'bot_handoff',
      title:     `Handoff needed — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
      body:      `"${message.slice(0, 80)}"`,
      link_type: 'conversation',
      link_id:   conv.id,
    })
  }

  // 11. Check for facility request
  const { hasFacility, facility, cleanResponse: facilityClean } = parseFacilityRequest(aiResponse)
  if (hasFacility && facility) {
    await processFacilityRequest(facility, hotel, guest, conv.id)
    await sendWhatsApp(from, facilityClean)
    await appendMessage(conv.id, 'assistant', facilityClean)
    return
  }

  // 12. Check for regular booking
  const { hasBooking, booking, cleanResponse } = parseBookingRequest(aiResponse)
  const replyText = cleanResponse || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  if (hasBooking && booking) await processBooking(booking, hotel, guest, partners)
}

// ── FACILITY REQUEST → Internal ticket to reception ───────────
async function processFacilityRequest(facility, hotel, guest, convId) {
  try {
    // Create an internal ticket for reception to handle
    const description = `FACILITY BOOKING REQUEST
Facility: ${facility.facility}
Date: ${facility.date || 'TBC'}
Time: ${facility.time || 'TBC'}
Guests: ${facility.guests || 1}
${facility.notes ? `Notes: ${facility.notes}` : ''}

Guest: ${guest.name || ''} ${guest.surname || ''} · Room ${guest.room || '?'}
Please check availability and confirm with guest via WhatsApp.`

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
    })

    // Also create a notification for reception
    await createNotification(hotel.id, {
      type:      'guest_message',
      title:     `Facility booking request — ${facility.facility}`,
      body:      `${guest.name || 'Guest'} · Room ${guest.room} · ${facility.date} at ${facility.time}`,
      link_type: 'conversation',
      link_id:   convId,
    })

    console.log(`Facility request created: ${facility.facility} for ${guest.name}`)
  } catch (e) {
    console.error('Facility request error:', e.message)
  }
}

async function createNotification(hotelId, { type, title, body, link_type, link_id }) {
  try {
    await supabase.from('notifications').insert({ hotel_id: hotelId, type, title, body, link_type, link_id })
  } catch (e) { console.error('Notification error:', e.message) }
}

async function processBooking(booking, hotel, guest, partners) {
  const partner = partners.find(p =>
    p.name.toLowerCase().includes((booking.partner||'').toLowerCase()) || p.type === booking.type)
  if (!partner) return
  const base = booking.details?.price || (partner.details?.price_per_person
    ? partner.details.price_per_person * (booking.details?.passengers||1) : 0)
  const comm = base > 0 ? +(base * partner.commission_rate / 100).toFixed(2) : 0
  const saved = await createBooking(hotel.id, guest.id, partner.id, booking.type, booking.details||{}, comm)
  try {
    const msg = await sendWhatsApp(partner.phone, formatPartnerAlert(booking, guest, hotel))
    await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
  } catch(e) { console.error('Partner alert failed:', e.message) }
}
