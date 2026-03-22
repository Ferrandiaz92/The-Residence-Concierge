// src/webhooks/whatsapp-inbound.js
// ============================================================
// MAIN WHATSAPP WEBHOOK
// This is the heart of the bot. Twilio calls this URL every
// time a guest sends a WhatsApp message to the hotel number.
//
// Flow:
//   Guest sends WhatsApp
//   → Twilio POSTs to this webhook
//   → We load hotel + guest context
//   → We call Claude with full conversation history
//   → Claude replies (and maybe includes a [BOOKING_REQUEST])
//   → We send the reply back via Twilio
//   → If booking: we alert the partner + log it
// ============================================================

import {
  getHotelByWhatsappNumber,
  getOrCreateGuest,
  updateGuest,
  getOrCreateConversation,
  appendMessage,
  getConversationHistory,
  getPartners,
  createBooking,
} from '../lib/supabase.js'

import {
  sendWhatsApp,
  parseIncomingMessage,
} from '../lib/twilio.js'

import {
  detectLanguage,
  buildSystemPrompt,
  parseBookingRequest,
  formatPartnerAlert,
} from '../lib/language.js'

import { callClaude } from '../lib/claude.js'

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)

  console.log(`📨 Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)

  if (!message.trim()) {
    console.log('Empty message — ignoring')
    return
  }

  // ── 1. Load hotel by the number the guest messaged ──────────────
  let hotel
  try {
    hotel = await getHotelByWhatsappNumber(to)
  } catch {
    console.error(`No hotel found for number: ${to}`)
    return
  }

  // ── 2. Get or create guest record ────────────────────────────────
  const guest = await getOrCreateGuest(hotel.id, from)

  // Update guest name from WhatsApp profile if not set yet
  if (!guest.name && profileName) {
    const parts = profileName.trim().split(' ')
    await updateGuest(guest.id, {
      name:    parts[0] || null,
      surname: parts.slice(1).join(' ') || null,
    })
    guest.name    = parts[0] || null
    guest.surname = parts.slice(1).join(' ') || null
  }

  // ── 3. Detect language ──────────────────────────────────────────
  const detectedLang = detectLanguage(message)
  if (detectedLang !== guest.language) {
    await updateGuest(guest.id, { language: detectedLang })
    guest.language = detectedLang
  }

  // ── 4. Get or create conversation ────────────────────────────────
  const conversation = await getOrCreateConversation(guest.id, hotel.id)

  // ── 5. Load conversation history (last 20 messages max) ──────────
  const history = await getConversationHistory(conversation.id)
  const recentHistory = history.slice(-20)

  // ── 6. Load hotel partners ────────────────────────────────────────
  const partners = await getPartners(hotel.id)

  // ── 7. Build system prompt ────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(hotel, guest, partners)

  // ── 8. Save guest message to DB ───────────────────────────────────
  await appendMessage(conversation.id, 'user', message)

  // ── 9. Call Claude ────────────────────────────────────────────────
  let aiResponse
  try {
    aiResponse = await callClaude(systemPrompt, recentHistory, message)
  } catch (err) {
    console.error('Claude failed:', err)
    // Fallback message in detected language
    const fallbacks = {
      en: "I'm sorry, I'm having a brief technical issue. Please try again in a moment, or call reception directly.",
      ru: 'Извините, у меня временная техническая проблема. Пожалуйста, попробуйте ещё раз или свяжитесь с ресепшн.',
      he: 'מצטער, יש לי בעיה טכנית זמנית. אנא נסה שוב בעוד רגע, או צור קשר עם הקבלה.',
    }
    await sendWhatsApp(from, fallbacks[guest.language] || fallbacks.en)
    return
  }

  // ── 10. Parse for booking requests ───────────────────────────────
  const { hasBooking, booking, cleanResponse } = parseBookingRequest(aiResponse)

  // ── 11. Send reply to guest ───────────────────────────────────────
  const replyText = cleanResponse || aiResponse
  await sendWhatsApp(from, replyText)

  // ── 12. Save assistant reply to DB ───────────────────────────────
  await appendMessage(conversation.id, 'assistant', replyText)

  // ── 13. Handle booking if detected ───────────────────────────────
  if (hasBooking && booking) {
    await processBooking(booking, hotel, guest, partners)
  }

  console.log(`✅ Handled message from ${from}`)
}

// ── BOOKING PROCESSOR ─────────────────────────────────────────────────────────

async function processBooking(booking, hotel, guest, partners) {
  console.log(`📋 Processing booking:`, booking.type)

  // Find the matching partner
  const partner = partners.find(p =>
    p.name.toLowerCase().includes((booking.partner || '').toLowerCase()) ||
    p.type === booking.type
  )

  if (!partner) {
    console.warn(`No partner found for booking type: ${booking.type}`)
    return
  }

  // Calculate commission
  const baseFare = booking.details?.price ||
                   (partner.details?.price_per_person
                    ? partner.details.price_per_person * (booking.details?.passengers || booking.details?.participants || 1)
                    : 0)
  const commissionAmount = baseFare > 0
    ? +(baseFare * (partner.commission_rate / 100)).toFixed(2)
    : 0

  // Save booking to database
  const savedBooking = await createBooking(
    hotel.id,
    guest.id,
    partner.id,
    booking.type,
    booking.details || {},
    commissionAmount
  )

  // Format and send partner alert
  const alertText = formatPartnerAlert(booking, guest, hotel)

  try {
    const partnerMsg = await sendWhatsApp(partner.phone, alertText)
    console.log(`📱 Partner alert sent to ${partner.name} (${partner.phone})`)

    // Update booking with Twilio SID for tracking partner replies
    // (used in the partner-reply webhook to match confirmations)
    const { supabase } = await import('../lib/supabase.js')
    await supabase
      .from('bookings')
      .update({ partner_alert_sid: partnerMsg.sid })
      .eq('id', savedBooking.id)
  } catch (err) {
    console.error(`Failed to alert partner ${partner.name}:`, err.message)
  }
}
