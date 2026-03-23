// src/webhooks/whatsapp-inbound.js (updated with ticket routing)
import {
  getHotelByWhatsappNumber, getOrCreateGuest, updateGuest,
  getOrCreateConversation, appendMessage, getConversationHistory,
  getPartners, createBooking,
} from '../lib/supabase.js'
import { sendWhatsApp, parseIncomingMessage } from '../lib/twilio.js'
import { detectLanguage, buildSystemPrompt, parseBookingRequest, formatPartnerAlert } from '../lib/language.js'
import { callClaude } from '../lib/claude.js'
import { handleTicketReply } from '../lib/ticketing.js'

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)
  if (!message.trim()) return

  // 1. Check if dept staff replying to a ticket (👍 ✅ ❌)
  const isTicketReply = await handleTicketReply(from, message)
  if (isTicketReply) { console.log(`Ticket reply from ${from}`); return }

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

  // 6. Build prompt
  const partners     = await getPartners(hotel.id)
  const systemPrompt = buildSystemPrompt(hotel, guest, partners)

  // 7. Save user message
  await appendMessage(conv.id, 'user', message)

  // 8. Claude
  let aiResponse
  try { aiResponse = await callClaude(systemPrompt, history, message) }
  catch {
    const fb = { en:"I'm having a brief issue. Please try again.", ru:'Временная ошибка. Попробуйте ещё раз.', he:'שגיאה זמנית. אנא נסה שוב.' }
    await sendWhatsApp(from, fb[guest.language]||fb.en); return
  }

  // 9. Reply
  const { hasBooking, booking, cleanResponse } = parseBookingRequest(aiResponse)
  await sendWhatsApp(from, cleanResponse || aiResponse)
  await appendMessage(conv.id, 'assistant', cleanResponse || aiResponse)

  // 10. Booking
  if (hasBooking && booking) await processBooking(booking, hotel, guest, partners)
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
    const { supabase } = await import('../lib/supabase.js')
    await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
  } catch(e) { console.error('Partner alert failed:', e.message) }
}
