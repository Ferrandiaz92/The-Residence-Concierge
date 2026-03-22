// src/webhooks/partner-reply.js
// ============================================================
// PARTNER REPLY WEBHOOK
// Handles when a taxi driver or restaurant replies ✅ or ❌
// to a booking alert on WhatsApp.
//
// Flow:
//   Partner taps ✅ (or ❌ or 🕐)
//   → Twilio POSTs to this webhook
//   → We find the pending booking for this partner
//   → We update booking status
//   → We notify the guest automatically
// ============================================================

import { parseIncomingMessage, sendWhatsApp } from '../lib/twilio.js'
import { supabase, updateBookingStatus } from '../lib/supabase.js'

// ── REPLY DETECTION ───────────────────────────────────────────────────────────

function detectPartnerReply(message) {
  const m = message.toLowerCase().trim()

  if (m.includes('✅') || m === 'yes' || m === 'ok' || m === 'confirm' ||
      m.includes('confirmed') || m.includes('accept'))
    return 'confirmed'

  if (m.includes('❌') || m === 'no' || m.includes('decline') ||
      m.includes('cannot') || m.includes("can't") || m.includes('sorry'))
    return 'declined'

  if (m.includes('🕐') || m.includes('alternative') || m.includes('instead') ||
      m.includes('different time') || m.includes('how about'))
    return 'alternative'

  return 'unknown'
}

// ── GUEST NOTIFICATION MESSAGES ──────────────────────────────────────────────

function buildGuestNotification(replyType, booking, partner, altMessage, language) {
  const templates = {
    confirmed: {
      taxi: {
        en: `Great news! Your taxi is confirmed.\n\nDriver: ${partner.name}\n${partner.details?.car ? `Car: ${partner.details.car}` : ''}\n${partner.details?.plate ? `Plate: ${partner.details.plate}` : ''}\n\nThey'll be at the hotel entrance at the arranged time. Have a wonderful journey! 🚗`,
        ru: `Отличные новости! Ваше такси подтверждено.\n\nВодитель: ${partner.name}\n${partner.details?.car ? `Автомобиль: ${partner.details.car}` : ''}\n${partner.details?.plate ? `Номер: ${partner.details.plate}` : ''}\n\nОни будут у входа в отель в условленное время. Приятной поездки! 🚗`,
        he: `חדשות מעולות! המונית שלך מאושרת.\n\nנהג: ${partner.name}\n${partner.details?.car ? `רכב: ${partner.details.car}` : ''}\n${partner.details?.plate ? `לוחית: ${partner.details.plate}` : ''}\n\nהם יהיו בכניסה למלון בזמן המוסכם. נסיעה נעימה! 🚗`,
      },
      restaurant: {
        en: `Your table is confirmed! ${partner.name} is expecting you.\n\nPlease arrive at your reserved time. If your plans change, just let me know. Enjoy your meal! 🍽️`,
        ru: `Ваш столик подтверждён! ${partner.name} ждёт вас.\n\nПожалуйста, приходите к зарезервированному времени. Приятного аппетита! 🍽️`,
        he: `השולחן שלך מאושר! ${partner.name} מחכה לך.\n\nאנא הגע בזמן השמור. בתאבון! 🍽️`,
      },
      activity: {
        en: `Your booking is confirmed! ${partner.name} is all set for you.\n\nThey'll be in touch with any final details. Have an amazing experience! ⛵`,
        ru: `Ваше бронирование подтверждено! ${partner.name} всё готово.\n\nОтличного времяпрепровождения! ⛵`,
        he: `ההזמנה שלך מאושרת! ${partner.name} מוכן עבורך.\n\nתיהנה! ⛵`,
      },
    },
    declined: {
      en: `I'm sorry, ${partner.name} is not available at that time.\n\nLet me find another option for you — what time would work best?`,
      ru: `К сожалению, ${partner.name} недоступен в это время.\n\nДавайте подберём другой вариант — какое время вам подходит?`,
      he: `מצטער, ${partner.name} אינו זמין באותו זמן.\n\nבואו נמצא אפשרות אחרת — מה הזמן שנוח לך?`,
    },
    alternative: {
      en: `${partner.name} has suggested an alternative. Here's their message:\n\n"${altMessage}"\n\nWould that work for you?`,
      ru: `${partner.name} предлагает альтернативу:\n\n"${altMessage}"\n\nВас это устроит?`,
      he: `${partner.name} הציע חלופה:\n\n"${altMessage}"\n\nזה מתאים לך?`,
    },
  }

  const lang = language || 'en'

  if (replyType === 'confirmed') {
    const type = booking.type
    const typeTemplates = templates.confirmed[type] || templates.confirmed.taxi
    return typeTemplates[lang] || typeTemplates.en
  }

  if (replyType === 'declined') {
    return templates.declined[lang] || templates.declined.en
  }

  if (replyType === 'alternative') {
    return templates.alternative[lang] || templates.alternative.en
  }

  return null
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export async function handlePartnerReply(rawBody) {
  const { from, message } = parseIncomingMessage(rawBody)

  console.log(`📨 Partner reply from ${from}: "${message.slice(0, 80)}"`)

  const replyType = detectPartnerReply(message)
  if (replyType === 'unknown') {
    console.log('Unrecognised partner reply — ignoring')
    return
  }

  // Find the most recent pending booking for this partner phone number
  const { data: partner, error: partnerError } = await supabase
    .from('partners')
    .select('*')
    .eq('phone', from)
    .eq('active', true)
    .single()

  if (partnerError || !partner) {
    console.warn(`No partner found for phone: ${from}`)
    return
  }

  // Get their most recent pending booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      *,
      guests(id, phone, language, name, surname, room),
      hotels(id, name)
    `)
    .eq('partner_id', partner.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (bookingError || !booking) {
    console.warn(`No pending booking found for partner: ${partner.name}`)
    return
  }

  const guest = booking.guests
  const newStatus = replyType === 'confirmed' ? 'confirmed'
                  : replyType === 'declined'  ? 'declined'
                  : 'pending' // alternative keeps pending while guest responds

  // Update booking status
  await updateBookingStatus(booking.id, newStatus)

  // Update commission status if confirmed
  if (replyType === 'confirmed' && booking.commission_amount > 0) {
    await supabase
      .from('commissions')
      .update({ status: 'confirmed' })
      .eq('booking_id', booking.id)
  }

  // Build guest notification
  const notification = buildGuestNotification(
    replyType,
    booking,
    partner,
    message, // raw partner message for "alternative" case
    guest.language
  )

  if (notification && guest.phone) {
    await sendWhatsApp(guest.phone, notification)
    console.log(`✅ Guest ${guest.phone} notified: booking ${newStatus}`)
  }

  // Acknowledge partner
  const partnerAck = {
    confirmed: '✅ Confirmed — guest has been notified. Thank you!',
    declined:  '✅ Noted — guest has been informed. We\'ll try another option.',
    alternative: '✅ Your alternative has been forwarded to the guest.',
  }
  await sendWhatsApp(from, partnerAck[replyType] || '✅ Received')
}
