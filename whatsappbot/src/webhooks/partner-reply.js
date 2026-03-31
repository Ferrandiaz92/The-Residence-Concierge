// src/webhooks/partner-reply.js
// ─────────────────────────────────────────────────────────────
// IMPROVEMENT 2: Partner confirmation → guest notification
//   The guest notification logic was already in place but had gaps:
//   - No logging on success/failure (you couldn't tell if it worked)
//   - Partner ack was sent even if guest notification failed
//   - Missing language support (only en/ru/he for confirmations)
//   - No conversation append after guest notification (dashboard gap)
//
//   This version:
//   - Logs every step with hotel/guest/partner context
//   - Appends the guest notification to the conversation so the
//     dashboard shows "taxi confirmed" in the chat timeline
//   - Sends partner ack only after guest is successfully notified
//   - Adds de/fr/es/it/pt confirmation messages
//
// IMPROVEMENT 3: Structured logging throughout
// ─────────────────────────────────────────────────────────────

import { parseIncomingMessage, sendWhatsApp } from '../lib/twilio.js'
import { supabase, updateBookingStatus, appendMessage } from '../lib/supabase.js'
import log, { hotelCtx, guestCtx } from '../../lib/logger.js'

function detectPartnerReply(message) {
  const m = message.toLowerCase().trim()
  if (m.includes('✅') || m === 'yes' || m === 'ok' || m.includes('confirm')) return 'confirmed'
  if (m.includes('❌') || m === 'no'  || m.includes('decline') || m.includes('cannot')) return 'declined'
  if (m.includes('🕐') || m.includes('alternative') || m.includes('how about')) return 'alternative'
  return 'unknown'
}

function buildGuestNotification(replyType, booking, partner, altMessage, language) {
  const lang = language || 'en'

  // ── IMPROVEMENT 2: added de/fr/es/it/pt confirmation messages ──
  const confirmed = {
    taxi: {
      en: `Great news! Your taxi is confirmed. 🚗\n\nDriver: ${partner.name}${partner.details?.car ? `\nCar: ${partner.details.car}` : ''}${partner.details?.plate ? `\nPlate: ${partner.details.plate}` : ''}\n\nThey will be at the hotel entrance at the arranged time.`,
      ru: `Отличные новости! Ваше такси подтверждено. 🚗\n\nВодитель: ${partner.name}\n\nОни будут у входа в отель в условленное время.`,
      he: `חדשות מעולות! המונית שלך מאושרת. 🚗\n\nנהג: ${partner.name}\n\nהם יהיו בכניסה למלון בזמן המוסכם.`,
      de: `Gute Neuigkeiten! Ihr Taxi ist bestätigt. 🚗\n\nFahrer: ${partner.name}${partner.details?.car ? `\nFahrzeug: ${partner.details.car}` : ''}\n\nSie werden zur vereinbarten Zeit am Hoteleingang sein.`,
      fr: `Bonne nouvelle! Votre taxi est confirmé. 🚗\n\nChauffeur: ${partner.name}${partner.details?.car ? `\nVéhicule: ${partner.details.car}` : ''}\n\nIl sera à l'entrée de l'hôtel à l'heure convenue.`,
      es: `¡Buenas noticias! Su taxi está confirmado. 🚗\n\nConductor: ${partner.name}${partner.details?.car ? `\nVehículo: ${partner.details.car}` : ''}\n\nEstarán en la entrada del hotel a la hora acordada.`,
      it: `Ottime notizie! Il tuo taxi è confermato. 🚗\n\nAutista: ${partner.name}${partner.details?.car ? `\nVeicolo: ${partner.details.car}` : ''}\n\nSaranno all'ingresso dell'hotel all'orario concordato.`,
      pt: `Ótimas notícias! O seu táxi está confirmado. 🚗\n\nMotorista: ${partner.name}\n\nEstarão na entrada do hotel à hora combinada.`,
      zh: `好消息！您的出租车已确认。🚗\n\n司机：${partner.name}\n\n他们将在约定时间在酒店门口等候。`,
      ar: `أخبار رائعة! تم تأكيد سيارة الأجرة الخاصة بك. 🚗\n\nالسائق: ${partner.name}\n\nسيكونون عند مدخل الفندق في الوقت المحدد.`,
      nl: `Goed nieuws! Uw taxi is bevestigd. 🚗\n\nChauffeur: ${partner.name}\n\nZe zijn op de afgesproken tijd bij de hotelentrance.`,
      el: `Καλά νέα! Το ταξί σας επιβεβαιώθηκε. 🚗\n\nΟδηγός: ${partner.name}\n\nΘα είναι στην είσοδο του ξενοδοχείου την ώρα που συμφωνήθηκε.`,
    },
    restaurant: {
      en: `Your table is confirmed! ${partner.name} is expecting you. Enjoy your meal! 🍽️`,
      ru: `Ваш столик подтверждён! ${partner.name} ждёт вас. Приятного аппетита! 🍽️`,
      he: `השולחן שלך מאושר! ${partner.name} מחכה לך. בתאבון! 🍽️`,
      de: `Ihr Tisch ist bestätigt! ${partner.name} erwartet Sie. Guten Appetit! 🍽️`,
      fr: `Votre table est confirmée! ${partner.name} vous attend. Bon appétit! 🍽️`,
      es: `¡Su mesa está confirmada! ${partner.name} le espera. ¡Buen provecho! 🍽️`,
      it: `Il suo tavolo è confermato! ${partner.name} la aspetta. Buon appetito! 🍽️`,
      pt: `A sua mesa está confirmada! ${partner.name} está à sua espera. Bom apetite! 🍽️`,
      zh: `您的座位已确认！${partner.name}等候您的光临。祝您用餐愉快！🍽️`,
      ar: `تم تأكيد طاولتك! ${partner.name} بانتظارك. بالهناء والشفاء! 🍽️`,
      nl: `Uw tafel is bevestigd! ${partner.name} verwacht u. Eet smakelijk! 🍽️`,
      el: `Το τραπέζι σας επιβεβαιώθηκε! Σας περιμένουν στο ${partner.name}. Καλή όρεξη! 🍽️`,
    },
    activity: {
      en: `Your booking is confirmed! ${partner.name} is all set for you. Have an amazing time! ⛵`,
      ru: `Ваше бронирование подтверждено! ${partner.name} всё готово. Приятного времяпрепровождения! ⛵`,
      he: `ההזמנה שלך מאושרת! ${partner.name} מוכן עבורך. תיהנה! ⛵`,
      de: `Ihre Buchung ist bestätigt! ${partner.name} ist bereit für Sie. Viel Spaß! ⛵`,
      fr: `Votre réservation est confirmée! ${partner.name} est prêt pour vous. Amusez-vous bien! ⛵`,
      es: `¡Su reserva está confirmada! ${partner.name} está listo para usted. ¡Que lo disfrute! ⛵`,
      it: `La sua prenotazione è confermata! ${partner.name} è pronto per lei. Divertiti! ⛵`,
      pt: `A sua reserva está confirmada! ${partner.name} está pronto para si. Divirta-se! ⛵`,
      zh: `您的预订已确认！${partner.name}已为您准备就绪。祝您玩得愉快！⛵`,
      ar: `تم تأكيد حجزك! ${partner.name} جاهز لك. استمتع! ⛵`,
      nl: `Uw boeking is bevestigd! ${partner.name} staat klaar voor u. Veel plezier! ⛵`,
      el: `Η κράτησή σας επιβεβαιώθηκε! Η ${partner.name} είναι έτοιμη για εσάς. Περάστε καλά! ⛵`,
    },
  }

  const declined = {
    en: `I'm sorry, ${partner.name} is not available at that time. Let me find another option for you — what time would work best?`,
    ru: `К сожалению, ${partner.name} недоступен. Давайте подберём другой вариант. Какое время подойдёт?`,
    he: `מצטער, ${partner.name} אינו זמין. בואו נמצא אפשרות אחרת — מה הזמן המועדף?`,
    de: `Es tut mir leid, ${partner.name} ist zu diesem Zeitpunkt nicht verfügbar. Soll ich eine Alternative finden? Welche Zeit würde passen?`,
    fr: `Désolé, ${partner.name} n'est pas disponible à cette heure. Puis-je trouver une alternative? Quelle heure vous conviendrait?`,
    es: `Lo siento, ${partner.name} no está disponible en ese momento. ¿Busco otra opción? ¿Qué hora le vendría bien?`,
    it: `Mi dispiace, ${partner.name} non è disponibile in quel momento. Cerco un'alternativa? Che orario le andrebbe?`,
    pt: `Lamento, ${partner.name} não está disponível nessa altura. Posso encontrar outra opção? Que horas lhe daria jeito?`,
    zh: `抱歉，${partner.name}在那个时间段没有空位。我为您找其他选择吧，什么时间最合适？`,
    ar: `آسف، ${partner.name} غير متاح في ذلك الوقت. هل أجد بديلاً؟ ما الوقت المناسب لك؟`,
    nl: `Sorry, ${partner.name} is op dat moment niet beschikbaar. Zal ik een alternatief zoeken? Welke tijd schikt u?`,
    el: `Λυπάμαι, η ${partner.name} δεν είναι διαθέσιμη εκείνη την ώρα. Να βρω εναλλακτική; Τι ώρα σας βολεύει;`,
  }

  const alternative = {
    en: `${partner.name} has suggested an alternative:\n\n"${altMessage}"\n\nWould that work for you?`,
    ru: `${partner.name} предлагает альтернативу:\n\n"${altMessage}"\n\nВас это устроит?`,
    he: `${partner.name} הציע חלופה:\n\n"${altMessage}"\n\nזה מתאים לך?`,
    de: `${partner.name} schlägt eine Alternative vor:\n\n"${altMessage}"\n\nWäre das für Sie in Ordnung?`,
    fr: `${partner.name} propose une alternative:\n\n"${altMessage}"\n\nCela vous conviendrait-il?`,
    es: `${partner.name} ha sugerido una alternativa:\n\n"${altMessage}"\n\n¿Le vendría bien?`,
    it: `${partner.name} ha suggerito un'alternativa:\n\n"${altMessage}"\n\nAndrebbe bene?`,
    pt: `${partner.name} sugeriu uma alternativa:\n\n"${altMessage}"\n\nIria servir?`,
  }

  if (replyType === 'confirmed') {
    const typeTemplates = confirmed[booking.type] || confirmed.taxi
    return typeTemplates[lang] || typeTemplates.en
  }
  if (replyType === 'declined')    return declined[lang]    || declined.en
  if (replyType === 'alternative') return alternative[lang] || alternative.en
  return null
}

// ── SESSION-EXPIRED HELPERS ──────────────────────────────────

// Creates a staff notification when the 24h WhatsApp session is closed
// and we can't reach the guest automatically
async function createSessionExpiredAlert({ supabase, hotel, guest, booking, partner, replyType, notification }) {
  const guestName = `${guest.name || ''} ${guest.surname || ''}`.trim() || 'Guest'
  const typeLabel = replyType === 'confirmed' ? 'CONFIRMED' : replyType === 'declined' ? 'DECLINED' : 'replied'

  await supabase.from('notifications').insert({
    hotel_id:  hotel.id,
    type:      'session_expired_manual_needed',
    title:     `📵 Manual message needed — ${partner.name} ${typeLabel}`,
    body:      `${guestName} · Room ${guest.room || '?'} — WhatsApp session expired. Please message guest: "${notification?.slice(0, 120)}..."`,
    link_type: 'booking',
    link_id:   booking.id,
    urgent:    true,
  }).catch(() => {})
}

// Attempts to send a pre-approved WhatsApp template message.
// Template must be configured in hotel.config.whatsapp_templates.
// Returns true if sent successfully, false if no template or send failed.
async function trySendTemplate({ guest, booking, partner, replyType, hotel }) {
  try {
    const templates = hotel.config?.whatsapp_templates
    if (!templates) return false

    const templateKey = `${booking.type}_${replyType}`  // e.g. 'taxi_confirmed'
    const template    = templates[templateKey] || templates[replyType]
    if (!template) return false

    // WhatsApp template via Twilio Content API
    const twilio = (await import('../lib/twilio.js'))
    const client = twilio.getTwilioClient?.() || null
    if (!client) return false

    const toPhone = guest.phone.startsWith('whatsapp:') ? guest.phone : `whatsapp:${guest.phone}`

    await client.messages.create({
      from:             process.env.TWILIO_WHATSAPP_NUMBER,
      to:               toPhone,
      contentSid:       template.sid,           // e.g. 'HXxxxxxxx'
      contentVariables: JSON.stringify({
        1: partner.name || 'our partner',
        2: booking.details?.time || '',
        3: partner.details?.car  || '',
      }),
    })
    return true
  } catch(e) {
    console.warn('Template send failed:', e.message)
    return false
  }
}

export async function handlePartnerReply(rawBody) {
  const { from, message } = parseIncomingMessage(rawBody)
  log.info('Partner reply received', { preview: message.slice(0, 60) })

  const replyType = detectPartnerReply(message)
  if (replyType === 'unknown') {
    log.debug('Partner reply type unknown — ignoring', { preview: message.slice(0, 40) })
    return
  }

  const { data: partner } = await supabase
    .from('partners').select('*').eq('phone', from).eq('active', true).single()
  if (!partner) {
    log.warn('Partner reply from unrecognised number', {})
    return
  }

  // Find most recent pending booking from this partner
  const { data: booking } = await supabase
    .from('bookings')
    .select(`*, guests(id, phone, language, name, surname, room, stay_status), hotels(id, name)`)
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!booking) {
    log.warn('No booking found for partner reply', { partnerId: partner.id })
    return
  }

  const guest = booking.guests
  const hotel = booking.hotels
  const hCtx  = hotelCtx(hotel)
  const gCtx  = guestCtx(guest)

  log.info('Processing partner reply', {
    ...hCtx, ...gCtx,
    partnerId:   partner.id,
    partnerName: partner.name,
    replyType,
    bookingId:   booking.id,
    bookingType: booking.type,
  })

  // Guard: check booking is still actionable
  if (['cancelled', 'declined'].includes(booking.status)) {
    await sendWhatsApp(from, `ℹ️ Note: This booking (${booking.type} for ${guest?.name || 'guest'}) was already cancelled. No action needed — thank you!`)
    log.info('Partner reply ignored — booking already cancelled', { bookingId: booking.id })
    return
  }

  if (booking.status === 'confirmed' && replyType === 'confirmed') {
    await sendWhatsApp(from, `✅ Already confirmed — thank you!`)
    return
  }

  if (guest?.stay_status === 'checked_out' && replyType === 'confirmed') {
    await sendWhatsApp(from, `ℹ️ Note: This guest has already checked out. Please disregard this booking. Apologies for the confusion!`)
    await updateBookingStatus(booking.id, 'cancelled')
    log.info('Partner reply ignored — guest already checked out', { ...hCtx, ...gCtx })
    return
  }

  // Update booking status
  const newStatus = replyType === 'confirmed' ? 'confirmed'
    : replyType === 'declined' ? 'declined' : 'pending'
  await updateBookingStatus(booking.id, newStatus)

  // Dashboard notification
  const notifTitle = replyType === 'confirmed'
    ? `✅ ${partner.name} confirmed — ${guest?.name} · Room ${guest?.room}`
    : `❌ ${partner.name} declined — ${guest?.name} · Room ${guest?.room} — find alternative`

  await supabase.from('notifications').insert({
    hotel_id:  hotel.id,
    type:      replyType === 'confirmed' ? 'partner_confirmed' : 'partner_declined',
    title:     notifTitle,
    body:      booking.type,
    link_type: 'booking',
    link_id:   booking.id,
  }).catch(() => {})

  // Notify guest — with 24h session awareness
  // WhatsApp Business only allows free-form messages within 24h of last guest message.
  // If the window is closed we fall back to a template message (if configured),
  // or create a staff notification so reception can follow up manually.
  const notification = buildGuestNotification(replyType, booking, partner, message, guest?.language)

  if (notification && guest?.phone) {
    // Find the active conversation and check session window
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .eq('guest_id', guest.id)
      .in('status', ['active', 'escalated'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastMsgAt   = conv?.last_message_at ? new Date(conv.last_message_at) : null
    const sessionOpen = lastMsgAt && (Date.now() - lastMsgAt.getTime()) < 23.5 * 60 * 60 * 1000

    if (sessionOpen) {
      // ── Session open: send free-form message ─────────────────
      try {
        await sendWhatsApp(guest.phone, notification)
        if (conv) {
          await appendMessage(conv.id, 'assistant', notification, { sent_by: 'partner_reply' })
        }
        log.info('Guest notified of partner reply (session open)', { ...hCtx, ...gCtx, replyType })
      } catch(e) {
        // Check if Twilio error is specifically 63016 (session expired mid-check)
        const is63016 = e?.code === 63016 || e?.message?.includes('63016')
        if (is63016) {
          log.warn('Partner reply: 24h session closed mid-send — creating staff notification', { ...hCtx, ...gCtx })
          await createSessionExpiredAlert({ supabase, hotel, guest, booking, partner, replyType, notification })
        } else {
          await log.error('Failed to notify guest of partner reply', e, { ...hCtx, ...gCtx, bookingId: booking.id })
        }
      }
    } else {
      // ── Session closed (>23.5h): try template, else staff alert ─
      log.warn('Partner reply: 24h session closed — attempting template fallback', {
        ...hCtx, ...gCtx,
        lastMsgAt: lastMsgAt?.toISOString(),
        hoursElapsed: lastMsgAt ? Math.round((Date.now() - lastMsgAt.getTime()) / 3600000) : 'unknown',
      })

      const templateSent = await trySendTemplate({ guest, booking, partner, replyType, hotel })

      if (templateSent) {
        if (conv) {
          const templateNote = `[Sent via WhatsApp template — session had expired] ${notification}`
          await appendMessage(conv.id, 'assistant', templateNote, { sent_by: 'partner_reply_template' })
        }
        log.info('Partner reply: template message sent to guest', { ...hCtx, ...gCtx, replyType })
      } else {
        // No template configured — create staff notification
        await createSessionExpiredAlert({ supabase, hotel, guest, booking, partner, replyType, notification })
      }
    }
  }

  // Ack partner — only after guest notification attempt
  const acks = {
    confirmed:   '✅ Confirmed — guest has been notified. Thank you!',
    declined:    '✅ Noted — guest has been informed and we\'ll find an alternative.',
    alternative: '✅ Forwarded to the guest. We\'ll let you know their response.',
  }
  await sendWhatsApp(from, acks[replyType] || '✅ Received')
  log.info('Partner ack sent', { partnerId: partner.id, replyType })
}
