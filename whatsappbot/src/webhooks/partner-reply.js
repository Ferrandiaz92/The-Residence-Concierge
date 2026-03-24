// src/webhooks/partner-reply.js (updated with notifications)
import { parseIncomingMessage, sendWhatsApp } from '../lib/twilio.js'
import { supabase, updateBookingStatus } from '../lib/supabase.js'

function detectPartnerReply(message) {
  const m = message.toLowerCase().trim()
  if (m.includes('✅') || m === 'yes' || m === 'ok' || m.includes('confirm')) return 'confirmed'
  if (m.includes('❌') || m === 'no' || m.includes('decline') || m.includes('cannot')) return 'declined'
  if (m.includes('🕐') || m.includes('alternative') || m.includes('how about')) return 'alternative'
  return 'unknown'
}

function buildGuestNotification(replyType, booking, partner, altMessage, language) {
  const lang = language || 'en'
  const templates = {
    confirmed: {
      taxi: {
        en: `Great news! Your taxi is confirmed.\n\nDriver: ${partner.name}\n${partner.details?.car ? `Car: ${partner.details.car}` : ''}\n${partner.details?.plate ? `Plate: ${partner.details.plate}` : ''}\n\nThey will be at the hotel entrance at the arranged time. 🚗`,
        ru: `Отличные новости! Ваше такси подтверждено.\n\nВодитель: ${partner.name}\n${partner.details?.car ? `Автомобиль: ${partner.details.car}` : ''}\n\nОни будут у входа в отель в условленное время. 🚗`,
        he: `חדשות מעולות! המונית שלך מאושרת.\n\nנהג: ${partner.name}\n\nהם יהיו בכניסה למלון בזמן המוסכם. 🚗`,
      },
      restaurant: {
        en: `Your table is confirmed! ${partner.name} is expecting you. Enjoy your meal! 🍽️`,
        ru: `Ваш столик подтверждён! ${partner.name} ждёт вас. Приятного аппетита! 🍽️`,
        he: `השולחן שלך מאושר! ${partner.name} מחכה לך. בתאבון! 🍽️`,
      },
      activity: {
        en: `Your booking is confirmed! ${partner.name} is all set for you. Have an amazing time! ⛵`,
        ru: `Ваше бронирование подтверждено! ${partner.name} всё готово. Приятного времяпрепровождения! ⛵`,
        he: `ההזמנה שלך מאושרת! ${partner.name} מוכן עבורך. תיהנה! ⛵`,
      },
    },
    declined: {
      en: `I'm sorry, ${partner.name} is not available at that time. Let me find another option — what time would work best?`,
      ru: `К сожалению, ${partner.name} недоступен. Давайте подберём другой вариант.`,
      he: `מצטער, ${partner.name} אינו זמין. בואו נמצא אפשרות אחרת.`,
    },
    alternative: {
      en: `${partner.name} has suggested an alternative:\n\n"${altMessage}"\n\nWould that work for you?`,
      ru: `${partner.name} предлагает альтернативу:\n\n"${altMessage}"\n\nВас это устроит?`,
      he: `${partner.name} הציע חלופה:\n\n"${altMessage}"\n\nזה מתאים לך?`,
    },
  }

  if (replyType === 'confirmed') {
    const type = booking.type
    const typeTemplates = templates.confirmed[type] || templates.confirmed.taxi
    return typeTemplates[lang] || typeTemplates.en
  }
  if (replyType === 'declined') return templates.declined[lang] || templates.declined.en
  if (replyType === 'alternative') return templates.alternative[lang] || templates.alternative.en
  return null
}

export async function handlePartnerReply(rawBody) {
  const { from, message } = parseIncomingMessage(rawBody)
  console.log(`Partner reply from ${from}: "${message.slice(0, 80)}"`)

  const replyType = detectPartnerReply(message)
  if (replyType === 'unknown') return

  const { data: partner } = await supabase
    .from('partners').select('*').eq('phone', from).eq('active', true).single()
  if (!partner) return

  const { data: booking } = await supabase
    .from('bookings')
    .select(`*, guests(id, phone, language, name, surname, room), hotels(id, name)`)
    .eq('partner_id', partner.id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).single()
  if (!booking) return

  const guest    = booking.guests
  const hotel    = booking.hotels
  const newStatus = replyType === 'confirmed' ? 'confirmed' : replyType === 'declined' ? 'declined' : 'pending'

  await updateBookingStatus(booking.id, newStatus)

  // Create dashboard notification
  const notifType  = replyType === 'confirmed' ? 'partner_confirmed' : 'partner_declined'
  const notifTitle = replyType === 'confirmed'
    ? `${partner.name} confirmed — ${guest.name} · Room ${guest.room}`
    : `${partner.name} declined — ${guest.name} · Room ${guest.room} — find alternative`

  await supabase.from('notifications').insert({
    hotel_id:  hotel.id,
    type:      notifType,
    title:     notifTitle,
    body:      booking.type,
    link_type: 'booking',
    link_id:   booking.id,
  })

  // Notify guest
  const notification = buildGuestNotification(replyType, booking, partner, message, guest.language)
  if (notification && guest.phone) await sendWhatsApp(guest.phone, notification)

  // Ack partner
  const acks = {
    confirmed:   '✅ Confirmed — guest has been notified. Thank you!',
    declined:    '✅ Noted — guest has been informed.',
    alternative: '✅ Forwarded to the guest.',
  }
  await sendWhatsApp(from, acks[replyType] || '✅ Received')
}
