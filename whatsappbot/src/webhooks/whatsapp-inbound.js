// src/webhooks/whatsapp-inbound.js
// Updated to use knowledge base + create notifications

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

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)
  if (!message.trim()) return

  // 1. Check ticket reply
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

  // 5. Conversation
  const conv    = await getOrCreateConversation(guest.id, hotel.id)
  const history = (await getConversationHistory(conv.id)).slice(-20)

  // 6. Build prompt WITH knowledge base
  const partners     = await getPartners(hotel.id)
  const systemPrompt = await buildSystemPromptWithKB(hotel, guest, partners)

  // 7. Save user message
  await appendMessage(conv.id, 'user', message)

  // 8. Create notification for staff
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
    const fb = { en:"I'm having a brief issue. Please try again.", ru:'Временная ошибка. Попробуйте ещё раз.', he:'שגיאה זמנית. אנא נסה שוב.' }
    await sendWhatsApp(from, fb[guest.language]||fb.en); return
  }

  // 10. Check for handoff signal
  const isHandoff = aiResponse.toLowerCase().includes('[handoff]') ||
                    aiResponse.toLowerCase().includes('connect you with our') ||
                    aiResponse.toLowerCase().includes('connect you with reception')

  if (isHandoff) {
    await createNotification(hotel.id, {
      type:      'bot_handoff',
      title:     `Handoff needed — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
      body:      `Bot escalated: "${message.slice(0, 80)}"`,
      link_type: 'conversation',
      link_id:   conv.id,
    })
    // Mark conversation as escalated
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
  }

  // 11. Reply
  const { hasBooking, booking, cleanResponse } = parseBookingRequest(aiResponse)
  const replyText = cleanResponse || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  // 12. Booking
  if (hasBooking && booking) await processBooking(booking, hotel, guest, partners, conv.id)
}

async function createNotification(hotelId, { type, title, body, link_type, link_id }) {
  try {
    await supabase.from('notifications').insert({ hotel_id: hotelId, type, title, body, link_type, link_id })
  } catch (e) { console.error('Notification error:', e.message) }
}

async function processBooking(booking, hotel, guest, partners, convId) {
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
