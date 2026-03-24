// src/lib/scheduled.js
// Handles all scheduled WhatsApp messages:
// - 7 days before check-in
// - 24h before check-in
// - Day 1 upsell
// - Mid-stay upsell (6+ night stays only)
// - Day before checkout
// - Post-checkout feedback request

import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

function getTwilio() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

async function sendWhatsApp(to, body) {
  const client = getTwilio()
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to:   toFormatted,
    body,
  })
}

// ── MESSAGE BUILDERS ──────────────────────────────────────────

function buildPreCheckin7d(guest, hotel, lang) {
  const name = guest.name || 'there'
  const msgs = {
    en: `Hi ${name}! 🌴 We're looking forward to welcoming you to ${hotel.name} in 7 days.

Here are a few tips to make the most of your stay:
🌊 The Mediterranean is perfect for swimming this time of year
🚗 Parking is free underground — barrier code 4521
🌡️ Pack light layers — warm days, cool evenings
✈️ Arriving by air? We can arrange an airport transfer for you

Any questions before you arrive? Just reply here and I'll help!`,

    ru: `Привет, ${name}! 🌴 Через 7 дней мы будем рады приветствовать вас в ${hotel.name}.

Несколько советов для отличного отдыха:
🌊 Средиземное море сейчас идеально для купания
🚗 Бесплатная парковка в подземном гараже — код 4521
🌡️ Берите лёгкую одежду — тёплые дни, прохладные вечера
✈️ Летите самолётом? Можем организовать трансфер

Есть вопросы до приезда? Пишите — помогу!`,

    he: `היי ${name}! 🌴 אנחנו מצפים לקבל אותך ב${hotel.name} בעוד 7 ימים.

כמה טיפים להפיק את המיטב מהשהות שלך:
🌊 הים התיכון מושלם לשחייה בעונה זו
🚗 חניה חינם במרתף — קוד 4521
🌡️ קח שכבות קלות — ימים חמים, ערבים קרירים
✈️ מגיע בטיסה? נוכל לסדר העברה משדה התעופה

שאלות לפני ההגעה? פשוט שלח הודעה!`,
  }
  return msgs[lang] || msgs.en
}

function buildPreCheckin24h(guest, hotel, lang) {
  const name  = guest.name || 'there'
  const room  = guest.room ? `Room ${guest.room}` : 'your room'
  const msgs  = {
    en: `${name}, your stay at ${hotel.name} starts tomorrow! 🎉

📍 Check-in from 14:00 — ${room} will be ready
🚗 Underground parking — entrance on the side street, code 4521
📶 WiFi: FourSeasons_Guest | Password: Limassol2026
☀️ Early check-in from 10:00 available for €30 if you'd like

Would you like us to arrange an airport transfer? Just let me know your flight arrival time and I'll take care of it.

See you tomorrow! 🌴`,

    ru: `${name}, ваш отдых в ${hotel.name} начинается завтра! 🎉

📍 Заезд с 14:00 — ${room} будет готов
🚗 Подземная парковка — въезд с боковой улицы, код 4521
📶 WiFi: FourSeasons_Guest | Пароль: Limassol2026
☀️ Ранний заезд с 10:00 доступен за €30

Нужен трансфер из аэропорта? Напишите время прилёта — организую!

До встречи завтра! 🌴`,

    he: `${name}, השהות שלך ב${hotel.name} מתחילה מחר! 🎉

📍 צ'ק-אין מ-14:00 — ${room} יהיה מוכן
🚗 חניה תת-קרקעית — כניסה מהרחוב הצדדי, קוד 4521
📶 WiFi: FourSeasons_Guest | סיסמה: Limassol2026
☀️ צ'ק-אין מוקדם מ-10:00 זמין ב-€30

רוצה שנסדר העברה משדה התעופה? שלח לי את שעת הנחיתה!

להתראות מחר! 🌴`,
  }
  return msgs[lang] || msgs.en
}

function buildDay1Upsell(guest, hotel, partners, lang) {
  const name = guest.name || 'there'

  // Pick top partners by type for suggestions
  const activities  = partners.filter(p => ['activity','boat tour','wine tour','golf'].includes(p.type)).slice(0,2)
  const restaurants = partners.filter(p => p.type === 'restaurant').slice(0,1)

  let suggestions = ''
  if (activities.length > 0) {
    suggestions += activities.map(p => `🌟 ${p.name}`).join('\n') + '\n'
  }
  if (restaurants.length > 0) {
    suggestions += `🍽️ ${restaurants[0].name} — top local restaurant\n`
  }
  if (!suggestions) {
    suggestions = '🌊 Boat tour along the coastline\n🍷 Commandaria wine tasting tour\n'
  }

  const msgs = {
    en: `Good morning ${name}! ☀️ We hope you slept well.

Here are some experiences our guests love — I can book any of these for you in minutes:

${suggestions}
🎾 Tennis court — available mornings
🏊 Rooftop pool lane — book a private slot

What sounds good? Just reply and I'll arrange everything! 🌴`,

    ru: `Доброе утро, ${name}! ☀️ Надеемся, вы хорошо отдохнули.

Вот что нравится нашим гостям — могу забронировать за несколько минут:

${suggestions}
🎾 Теннисный корт — доступен утром
🏊 Бассейн на крыше — бронирование дорожки

Что вас заинтересовало? Пишите — организую всё! 🌴`,

    he: `בוקר טוב ${name}! ☀️ מקווים שישנת טוב.

הנה חוויות שהאורחים שלנו אוהבים — אני יכול להזמין כל אחת מהן תוך דקות:

${suggestions}
🎾 מגרש טניס — זמין בבקרים
🏊 נתיב שחייה בבריכת הגג — הזמנת נתיב פרטי

מה נשמע טוב? פשוט ענה ואסדר הכל! 🌴`,
  }
  return msgs[lang] || msgs.en
}

function buildMidstayUpsell(guest, hotel, partners, lang, nightsLeft) {
  const name = guest.name || 'there'
  const activities = partners.filter(p => ['activity','boat tour','wine tour'].includes(p.type)).slice(0,3)

  let suggestions = activities.length > 0
    ? activities.map(p => `✨ ${p.name}`).join('\n')
    : '✨ Sunset boat tour\n✨ Commandaria wine tour\n✨ Day trip to Paphos'

  const msgs = {
    en: `Hi ${name}! 👋 You still have ${nightsLeft} nights left — plenty of time to make some memories!

Our guests' favourites that are still available:

${suggestions}

Any of these catch your eye? I'll take care of the booking right away 🌴`,

    ru: `Привет, ${name}! 👋 У вас ещё ${nightsLeft} ночей — достаточно времени для новых впечатлений!

Любимые занятия наших гостей, которые ещё доступны:

${suggestions}

Что-то заинтересовало? Забронирую сразу 🌴`,

    he: `היי ${name}! 👋 נשארו לך עוד ${nightsLeft} לילות — הרבה זמן ליצור זיכרונות!

המועדפים של האורחים שלנו שעדיין זמינים:

${suggestions}

משהו נתפס? אסדר את ההזמנה מיד 🌴`,
  }
  return msgs[lang] || msgs.en
}

function buildPreCheckout(guest, hotel, lang) {
  const name     = guest.name || 'there'
  const checkout = guest.check_out
    ? new Date(guest.check_out).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})
    : 'tomorrow'

  const msgs = {
    en: `Hi ${name}! Just a friendly reminder — your checkout is ${checkout} at 11:00.

A few options that might be useful:
🕒 Late checkout until 16:00 — €50, subject to availability
🚗 Airport transfer — let me know your flight time and I'll arrange it
🧳 Luggage storage — we can hold your bags after checkout

Is there anything I can help with for your departure? 🌴`,

    ru: `Привет, ${name}! Напоминаю — ваш выезд ${checkout} в 11:00.

Полезные варианты:
🕒 Поздний выезд до 16:00 — €50, по наличию
🚗 Трансфер в аэропорт — сообщите время рейса, организую
🧳 Хранение багажа — можем оставить вещи после выезда

Чем могу помочь с отъездом? 🌴`,

    he: `היי ${name}! תזכורת ידידותית — הצ'ק-אאוט שלך ${checkout} בשעה 11:00.

כמה אפשרויות שעשויות לעזור:
🕒 צ'ק-אאוט מאוחר עד 16:00 — €50, בהתאם לזמינות
🚗 העברה לשדה התעופה — שלח את שעת הטיסה ואסדר
🧳 אחסון מטען — נוכל לשמור את התיקים אחרי הצ'ק-אאוט

יש משהו שאוכל לעזור לגבי העזיבה? 🌴`,
  }
  return msgs[lang] || msgs.en
}

function buildPostCheckout(guest, hotel, lang) {
  const name = guest.name || 'there'
  const msgs = {
    en: `${name}, thank you so much for staying with us at ${hotel.name}! 🌴

We hope you had a wonderful time. How would you rate your overall experience?

Reply with a number:
5 ⭐ Excellent
4 😊 Very good
3 😐 Good
2 😕 Could be better
1 😞 Poor`,

    ru: `${name}, большое спасибо за то, что остановились в ${hotel.name}! 🌴

Надеемся, отдых был отличным. Как вы оцениваете своё пребывание?

Ответьте цифрой:
5 ⭐ Отлично
4 😊 Очень хорошо
3 😐 Хорошо
2 😕 Могло быть лучше
1 😞 Плохо`,

    he: `${name}, תודה רבה על השהות שלך ב${hotel.name}! 🌴

אנו מקווים שנהנית. איך היית מדרג את החוויה שלך?

ענה במספר:
5 ⭐ מצוין
4 😊 טוב מאוד
3 😐 טוב
2 😕 יכול להיות טוב יותר
1 😞 גרוע`,
  }
  return msgs[lang] || msgs.en
}

function buildFeedbackFollowup(rating, hotel, lang, tripadvisorUrl) {
  const msgs = {
    high: {
      en: `Thank you so much! ⭐⭐⭐⭐⭐ We're thrilled you had a great experience.

If you have a moment, a review on TripAdvisor would mean the world to us:
${tripadvisorUrl || 'https://tripadvisor.com'}

We hope to welcome you back soon! 🌴`,
      ru: `Большое спасибо! ⭐⭐⭐⭐⭐ Мы рады, что вам понравилось.

Если есть минутка, отзыв на TripAdvisor очень важен для нас:
${tripadvisorUrl || 'https://tripadvisor.com'}

Будем рады видеть вас снова! 🌴`,
      he: `תודה רבה! ⭐⭐⭐⭐⭐ אנחנו שמחים שנהנית.

אם יש לך רגע, ביקורת ב-TripAdvisor תהיה חשובה מאוד עבורנו:
${tripadvisorUrl || 'https://tripadvisor.com'}

נשמח לקבל אותך שוב! 🌴`,
    },
    low: {
      en: `Thank you for your honest feedback. We're sorry your stay wasn't everything it should have been.

Could you tell us what we could have done better? Your feedback goes directly to our manager and helps us improve.`,
      ru: `Спасибо за честный отзыв. Жаль, что отдых не оправдал ожиданий.

Не могли бы вы рассказать, что мы могли бы сделать лучше? Ваш отзыв поступит напрямую к менеджеру.`,
      he: `תודה על המשוב הכנה. אנו מצטערים שהשהות לא הייתה כפי שהיתה צריכה להיות.

האם תוכל לספר לנו מה יכולנו לעשות טוב יותר? המשוב שלך יגיע ישירות למנהל.`,
    },
  }
  return rating >= 4
    ? (msgs.high[lang] || msgs.high.en)
    : (msgs.low[lang] || msgs.low.en)
}

// ── MAIN SCHEDULER ────────────────────────────────────────────
export async function processScheduledMessages(hotelId) {
  const supabase = getSupabase()
  const now      = new Date()
  const results  = { sent: 0, skipped: 0, failed: 0, errors: [] }

  // Load hotel + partners
  const { data: hotel } = await supabase
    .from('hotels').select('*').eq('id', hotelId).single()
  const { data: partners } = await supabase
    .from('partners').select('*').eq('hotel_id', hotelId).eq('active', true)

  // Load all active guests
  const { data: guests } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .not('phone', 'is', null)

  for (const guest of (guests || [])) {
    if (!guest.check_in || !guest.check_out || !guest.phone) continue

    const checkinDate  = new Date(guest.check_in)
    const checkoutDate = new Date(guest.check_out)
    const stayNights   = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24))
    const lang         = guest.language || 'en'

    // Helper — check if a message type should be sent and hasn't been
    async function shouldSend(type) {
      const { data } = await supabase
        .from('scheduled_messages')
        .select('id, status')
        .eq('guest_id', guest.id)
        .eq('message_type', type)
        .single()
      // Already sent or explicitly skipped
      if (data?.status === 'sent' || data?.status === 'skipped') return false
      return true
    }

    async function markSent(type) {
      await supabase.from('scheduled_messages').upsert({
        hotel_id: hotelId, guest_id: guest.id,
        message_type: type, status: 'sent', sent_at: now.toISOString(),
      }, { onConflict: 'guest_id,message_type' })
    }

    async function markSkipped(type) {
      await supabase.from('scheduled_messages').upsert({
        hotel_id: hotelId, guest_id: guest.id,
        message_type: type, status: 'skipped', sent_at: now.toISOString(),
      }, { onConflict: 'guest_id,message_type' })
    }

    async function send(type, message) {
      try {
        await sendWhatsApp(guest.phone, message)
        await markSent(type)

        // Save to conversation
        const { data: conv } = await supabase
          .from('conversations')
          .select('id, messages')
          .eq('guest_id', guest.id)
          .in('status', ['active','escalated'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (conv) {
          const messages = [...(conv.messages||[]), {
            role: 'assistant', content: message,
            ts: now.toISOString(), sent_by: 'scheduled',
          }]
          await supabase.from('conversations')
            .update({ messages, last_message_at: now.toISOString() })
            .eq('id', conv.id)
        }

        results.sent++
      } catch (e) {
        await supabase.from('scheduled_messages').upsert({
          hotel_id: hotelId, guest_id: guest.id,
          message_type: type, status: 'failed', error: e.message,
        }, { onConflict: 'guest_id,message_type' })
        results.failed++
        results.errors.push(`${guest.name} / ${type}: ${e.message}`)
      }
    }

    // ── 7 days before check-in ─────────────────────────────
    const sevenDaysBefore = new Date(checkinDate)
    sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7)
    sevenDaysBefore.setHours(10, 0, 0, 0) // Send at 10am

    if (now >= sevenDaysBefore && now < checkinDate && await shouldSend('pre_checkin_7d')) {
      await send('pre_checkin_7d', buildPreCheckin7d(guest, hotel, lang))
    }

    // ── 24h before check-in ────────────────────────────────
    const twentyFourBefore = new Date(checkinDate)
    twentyFourBefore.setDate(twentyFourBefore.getDate() - 1)
    twentyFourBefore.setHours(10, 0, 0, 0)

    if (now >= twentyFourBefore && now < checkinDate && await shouldSend('pre_checkin_24h')) {
      await send('pre_checkin_24h', buildPreCheckin24h(guest, hotel, lang))
    }

    // ── Day 1 upsell — morning after first night ───────────
    const day1Morning = new Date(checkinDate)
    day1Morning.setDate(day1Morning.getDate() + 1)
    day1Morning.setHours(9, 0, 0, 0)

    const day1End = new Date(day1Morning)
    day1End.setHours(12, 0, 0, 0)

    if (now >= day1Morning && now < day1End && now < checkoutDate && await shouldSend('day1_upsell')) {
      await send('day1_upsell', buildDay1Upsell(guest, hotel, partners || [], lang))
    }

    // ── Mid-stay upsell — only if stay >= 6 nights ─────────
    if (stayNights >= 6) {
      const midpoint    = new Date(checkinDate)
      const midDayIndex = Math.floor(stayNights / 2)
      midpoint.setDate(midpoint.getDate() + midDayIndex)
      midpoint.setHours(11, 0, 0, 0)

      const midEnd = new Date(midpoint)
      midEnd.setHours(14, 0, 0, 0)

      const nightsLeft = Math.round((checkoutDate - now) / (1000 * 60 * 60 * 24))

      if (now >= midpoint && now < midEnd && now < checkoutDate && nightsLeft >= 2 && await shouldSend('midstay_upsell')) {
        await send('midstay_upsell', buildMidstayUpsell(guest, hotel, partners || [], lang, nightsLeft))
      }
    } else {
      // Skip midstay for short stays
      await markSkipped('midstay_upsell')
    }

    // ── Day before checkout ────────────────────────────────
    const dayBeforeCheckout = new Date(checkoutDate)
    dayBeforeCheckout.setDate(dayBeforeCheckout.getDate() - 1)
    dayBeforeCheckout.setHours(17, 0, 0, 0) // 5pm the evening before

    const dayBeforeEnd = new Date(dayBeforeCheckout)
    dayBeforeEnd.setHours(20, 0, 0, 0)

    if (now >= dayBeforeCheckout && now < dayBeforeEnd && await shouldSend('pre_checkout')) {
      await send('pre_checkout', buildPreCheckout(guest, hotel, lang))
    }

    // ── Post-checkout feedback — 2h after checkout ─────────
    const postCheckout = new Date(checkoutDate)
    postCheckout.setHours(13, 0, 0, 0) // Assume 11am checkout + 2h = 1pm

    const postCheckoutEnd = new Date(postCheckout)
    postCheckoutEnd.setHours(18, 0, 0, 0) // Window closes at 6pm

    if (now >= postCheckout && now < postCheckoutEnd && now > checkoutDate && await shouldSend('post_checkout')) {
      await send('post_checkout', buildPostCheckout(guest, hotel, lang))
    }
  }

  return results
}

// ── HANDLE FEEDBACK REPLY ─────────────────────────────────────
export async function handleFeedbackReply(from, message, hotelId) {
  const supabase = getSupabase()
  const rating   = parseInt(message.trim())

  if (isNaN(rating) || rating < 1 || rating > 5) return false

  // Find guest
  const { data: guest } = await supabase
    .from('guests').select('*').eq('phone', from).eq('hotel_id', hotelId).single()
  if (!guest) return false

  // Check if we recently sent a feedback request
  const { data: scheduled } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('guest_id', guest.id)
    .eq('message_type', 'post_checkout')
    .eq('status', 'sent')
    .single()
  if (!scheduled) return false

  // Check no feedback exists yet
  const { data: existing } = await supabase
    .from('guest_feedback')
    .select('id')
    .eq('guest_id', guest.id)
    .single()
  if (existing) return false

  // Save feedback
  await supabase.from('guest_feedback').insert({
    hotel_id: hotelId,
    guest_id: guest.id,
    rating,
    language: guest.language || 'en',
  })

  // Load hotel for tripadvisor URL
  const { data: hotel } = await supabase
    .from('hotels').select('*').eq('id', hotelId).single()
  const tripadvisorUrl = hotel?.config?.tripadvisor_url

  // Send follow-up
  const followup = buildFeedbackFollowup(rating, hotel, guest.language || 'en', tripadvisorUrl)
  const client   = getTwilio()
  const toFmt    = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to:   toFmt,
    body: followup,
  })

  // Notify manager if rating <= 2
  if (rating <= 2) {
    await supabase.from('notifications').insert({
      hotel_id:  hotelId,
      type:      'guest_message',
      title:     `Low rating — ${guest.name || 'Guest'} gave ${rating}⭐`,
      body:      `Stay: Room ${guest.room} · ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`,
      link_type: 'conversation',
      link_id:   null,
    })
  }

  return true
}
