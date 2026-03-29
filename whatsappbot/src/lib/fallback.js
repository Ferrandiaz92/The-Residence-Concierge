// src/lib/fallback.js
// ─────────────────────────────────────────────────────────────
// FEATURE #12: Offline / rule-based fallback
//
// When Claude API is down, times out, or rate-limits, the bot
// currently sends a generic "brief issue" error message and stops.
// Guests are left without help at the worst possible time.
//
// This module adds a rule-based fallback that handles the 10 most
// common guest requests without Claude — using pattern matching
// and hotel config data.
//
// Handled without Claude:
//   1. WiFi password
//   2. Check-out time
//   3. Check-in time
//   4. Restaurant hours
//   5. Pool hours
//   6. Taxi / transfer request
//   7. Room service request
//   8. Housekeeping request
//   9. Reception / emergency contact
//  10. Parking code / info
//
// If nothing matches, sends a polite "we'll be right with you"
// and creates an escalation ticket so staff can follow up.
// ─────────────────────────────────────────────────────────────

import { supabase }     from './supabase.js'
import log              from '../../lib/logger.js'

// ── PATTERN MATCHING ──────────────────────────────────────────
const RULES = [
  {
    id:       'wifi',
    patterns: [/\b(wifi|wi-fi|wireless|internet|password|network|connect)\b/i],
    handler:  (hotel, guest) => {
      const name = hotel.config?.wifi_name
      const pass = hotel.config?.wifi_password
      if (name && pass) {
        return FALLBACK_MSGS.wifi(name, pass, guest.language)
      }
      return FALLBACK_MSGS.generic_staff(guest.language)
    },
  },
  {
    id:       'checkout_time',
    patterns: [/\b(check.?out|checkout)\b.*\btime\b|\bwhat time.*check.?out\b|\bcheck.?out.*when\b/i],
    handler:  (hotel, guest) => {
      const time = hotel.config?.checkout_time || '12:00'
      return FALLBACK_MSGS.checkout(time, guest.language)
    },
  },
  {
    id:       'checkin_time',
    patterns: [/\b(check.?in|checkin)\b.*\btime\b|\bwhat time.*check.?in\b|\bcheck.?in.*when\b/i],
    handler:  (hotel, guest) => {
      const time = hotel.config?.checkin_time || '15:00'
      return FALLBACK_MSGS.checkin(time, guest.language)
    },
  },
  {
    id:       'restaurant_hours',
    patterns: [/\b(restaurant|dining|breakfast|lunch|dinner)\b.*\b(open|hours|time|when)\b|\bwhen.*\b(restaurant|breakfast|lunch|dinner)\b/i],
    handler:  (hotel, guest) => {
      const r   = hotel.config?.restaurant
      const hrs = r?.hours || r?.breakfast ? `Breakfast: ${r?.breakfast}, Dinner: ${r?.dinner}` : null
      return FALLBACK_MSGS.restaurant(hrs, guest.language)
    },
  },
  {
    id:       'pool_hours',
    patterns: [/\b(pool|swimming)\b.*\b(open|hours|time|when)\b|\bwhen.*\bpool\b/i],
    handler:  (hotel, guest) => {
      const hours = hotel.config?.pool?.hours
      return FALLBACK_MSGS.pool(hours, guest.language)
    },
  },
  {
    id:       'taxi',
    patterns: [/\b(taxi|cab|transfer|car|ride|airport|pick.?up|transport)\b/i],
    handler:  (hotel, guest) => FALLBACK_MSGS.taxi(guest.language),
  },
  {
    id:       'room_service',
    patterns: [/\b(room service|in.room|food.*room|order.*room|send.*room)\b/i],
    handler:  (hotel, guest) => FALLBACK_MSGS.room_service(guest.language),
  },
  {
    id:       'housekeeping',
    patterns: [/\b(housekeeping|clean|towel|linen|toilet.*paper|minibar|pillow|blanket)\b/i],
    handler:  (hotel, guest) => FALLBACK_MSGS.housekeeping(guest.language),
  },
  {
    id:       'emergency_reception',
    patterns: [/\b(emergency|urgent|reception|manager|help|assist|problem)\b/i,
               /i need help|something wrong|not working|broken/i],
    handler:  (hotel, guest) => {
      const phone = hotel.config?.reception_phone || hotel.config?.emergency_phone
      return FALLBACK_MSGS.reception(phone, guest.language)
    },
  },
  {
    id:       'parking',
    patterns: [/\b(park|parking|car park|garage|vehicle)\b/i],
    handler:  (hotel, guest) => {
      const code = hotel.config?.parking_code
      return FALLBACK_MSGS.parking(code, guest.language)
    },
  },
]

// ── MAIN FALLBACK FUNCTION ────────────────────────────────────
export async function handleFallback(message, hotel, guest, conv, triggerReason = 'claude_error') {
  const lang = guest?.language || 'en'

  // Try each rule in order
  for (const rule of RULES) {
    const matched = rule.patterns.some(pattern => pattern.test(message))
    if (matched) {
      const reply = rule.handler(hotel, guest)

      // Log fallback usage for monitoring
      await supabase.from('fallback_events').insert({
        hotel_id: hotel.id,
        guest_id: guest?.id || null,
        trigger:  triggerReason,
        matched:  rule.id,
      }).catch(() => {})

      log.info('Fallback rule matched', {
        hotelId:  hotel.id,
        ruleId:   rule.id,
        trigger:  triggerReason,
        guestId:  guest?.id,
      })

      return { matched: true, reply, ruleId: rule.id }
    }
  }

  // No rule matched — send holding message + create escalation ticket
  await createFallbackEscalation(hotel, guest, conv, message)

  const holdingMsg = FALLBACK_MSGS.holding(lang)

  await supabase.from('fallback_events').insert({
    hotel_id: hotel.id,
    guest_id: guest?.id || null,
    trigger:  triggerReason,
    matched:  'holding_escalation',
  }).catch(() => {})

  log.warn('Fallback: no rule matched — escalated', {
    hotelId:  hotel.id,
    guestId:  guest?.id,
    trigger:  triggerReason,
    preview:  message.slice(0, 60),
  })

  return { matched: false, reply: holdingMsg, ruleId: 'holding' }
}

// ── CREATE ESCALATION WHEN FALLBACK FAILS ─────────────────────
async function createFallbackEscalation(hotel, guest, conv, message) {
  try {
    // Mark conversation as escalated
    if (conv?.id) {
      await supabase.from('conversations')
        .update({ status: 'escalated' }).eq('id', conv.id)
    }

    // Notify reception
    await supabase.from('notifications').insert({
      hotel_id:  hotel.id,
      type:      'bot_handoff',
      title:     `⚡ Bot offline — ${guest?.name || 'Guest'}${guest?.room ? ` · Room ${guest.room}` : ''} needs help`,
      body:      `"${message.slice(0, 100)}" — Bot is temporarily unavailable. Please respond manually.`,
      link_type: conv?.id ? 'conversation' : null,
      link_id:   conv?.id || null,
    }).catch(() => {})
  } catch (err) {
    log.warn('createFallbackEscalation failed', { error: err.message })
  }
}

// ── FALLBACK MESSAGE TEMPLATES ─────────────────────────────────
const FALLBACK_MSGS = {
  wifi: (name, pass, lang) => ({
    en: `📶 WiFi Details:\nNetwork: ${name}\nPassword: ${pass}\n\nConnect via Settings → WiFi on your device. Enjoy! 😊`,
    ru: `📶 WiFi:\nСеть: ${name}\nПароль: ${pass}`,
    he: `📶 WiFi:\nרשת: ${name}\nסיסמה: ${pass}`,
    de: `📶 WLAN:\nNetzwerk: ${name}\nPasswort: ${pass}`,
    fr: `📶 WiFi:\nRéseau: ${name}\nMot de passe: ${pass}`,
    es: `📶 WiFi:\nRed: ${name}\nContraseña: ${pass}`,
    it: `📶 WiFi:\nRete: ${name}\nPassword: ${pass}`,
    pt: `📶 WiFi:\nRede: ${name}\nSenha: ${pass}`,
    zh: `📶 WiFi:\n网络: ${name}\n密码: ${pass}`,
    ar: `📶 واي فاي:\nالشبكة: ${name}\nكلمة المرور: ${pass}`,
    nl: `📶 WiFi:\nNetwerk: ${name}\nWachtwoord: ${pass}`,
    el: `📶 WiFi:\nΔίκτυο: ${name}\nΚωδικός: ${pass}`,
    pl: `📶 WiFi:\nSieć: ${name}\nHasło: ${pass}`,
  }[lang] || `📶 WiFi: ${name} | Password: ${pass}`),

  checkout: (time, lang) => ({
    en: `Check-out time is ${time}. Late check-out may be available — just ask at reception! 🕐`,
    ru: `Выезд в ${time}. Поздний выезд возможен — уточните на ресепшене! 🕐`,
    he: `שעת הצ'ק-אאוט היא ${time}. יציאה מאוחרת אפשרית — שאל בקבלה! 🕐`,
    de: `Check-out ist um ${time}. Später Check-out eventuell möglich — fragen Sie an der Rezeption! 🕐`,
    fr: `Le check-out est à ${time}. Départ tardif possible — demandez à la réception! 🕐`,
    es: `El check-out es a las ${time}. El check-out tardío puede estar disponible — ¡consulte en recepción! 🕐`,
  }[lang] || `Check-out time: ${time} 🕐`),

  checkin: (time, lang) => ({
    en: `Check-in time is from ${time}. Early check-in may be available — let us know your arrival time! 🏨`,
    ru: `Заезд с ${time}. Ранний заезд возможен — сообщите время прилёта! 🏨`,
    he: `הצ'ק-אין מ-${time}. כניסה מוקדמת אפשרית — הודע לנו! 🏨`,
    de: `Check-in ab ${time}. Früher Check-in eventuell möglich — teilen Sie uns Ihre Ankunftszeit mit! 🏨`,
    fr: `Check-in à partir de ${time}. Arrivée anticipée possible — dites-nous votre heure d'arrivée! 🏨`,
    es: `Check-in desde las ${time}. Check-in anticipado disponible — ¡díganos su hora de llegada! 🏨`,
  }[lang] || `Check-in from ${time} 🏨`),

  restaurant: (hours, lang) => ({
    en: hours ? `🍽️ Restaurant hours:\n${hours}\n\nFor reservations or special requests, I'll connect you with the team shortly!`
               : `🍽️ Our restaurant is open for breakfast, lunch and dinner. I'll get you the exact hours shortly!`,
    ru: hours ? `🍽️ Часы работы ресторана:\n${hours}` : `🍽️ Ресторан работает на завтрак, обед и ужин. Уточню точное время!`,
    he: hours ? `🍽️ שעות המסעדה:\n${hours}` : `🍽️ המסעדה פתוחה לארוחת בוקר, צהריים וערב. אעדכן בקרוב!`,
  }[lang] || (hours ? `🍽️ Restaurant: ${hours}` : `🍽️ Restaurant open for all meals — I'll confirm hours shortly!`)),

  pool: (hours, lang) => ({
    en: hours ? `🏊 Pool hours: ${hours}` : `🏊 The pool is available for guests — I'll confirm the exact hours shortly!`,
    ru: hours ? `🏊 Бассейн: ${hours}` : `🏊 Бассейн доступен — уточню часы!`,
    he: hours ? `🏊 שעות הבריכה: ${hours}` : `🏊 הבריכה פתוחה — אעדכן בקרוב!`,
  }[lang] || (hours ? `🏊 Pool hours: ${hours}` : `🏊 Pool available — hours coming shortly!`)),

  taxi: (lang) => ({
    en: `🚗 I'll arrange a taxi for you! Our systems are briefly unavailable — a team member will contact you within a few minutes to confirm your transfer details. 🙏`,
    ru: `🚗 Организую такси! Система временно недоступна — сотрудник свяжется с вами в ближайшие минуты. 🙏`,
    he: `🚗 אדאג למונית! המערכת זמנית לא זמינה — איש צוות יצור איתך קשר תוך דקות. 🙏`,
    de: `🚗 Ich arrangiere ein Taxi! Unser System ist kurz nicht verfügbar — ein Teammitglied kontaktiert Sie in wenigen Minuten. 🙏`,
    fr: `🚗 Je vous arrange un taxi! Notre système est brièvement indisponible — un membre de l'équipe vous contactera dans quelques minutes. 🙏`,
    es: `🚗 ¡Le organizo un taxi! Nuestro sistema no está disponible brevemente — un miembro del equipo le contactará en unos minutos. 🙏`,
  }[lang] || `🚗 Arranging your taxi — team will confirm shortly! 🙏`),

  room_service: (lang) => ({
    en: `🍽️ Room service request received! Our system is briefly unavailable — a team member will contact you within a few minutes to take your order. 🙏`,
    ru: `🍽️ Заявка на обслуживание номера принята! Система временно недоступна — сотрудник свяжется с вами. 🙏`,
    he: `🍽️ בקשת שירות לחדר התקבלה! המערכת זמנית לא זמינה — איש צוות יצור קשר. 🙏`,
  }[lang] || `🍽️ Room service request noted — team will contact you shortly! 🙏`),

  housekeeping: (lang) => ({
    en: `🛎️ Housekeeping request received! Our system is briefly unavailable — we'll send someone to your room within a few minutes. 🙏`,
    ru: `🛎️ Запрос горничной принят! Система временно недоступна — пришлём сотрудника в ближайшие минуты. 🙏`,
    he: `🛎️ בקשת מלצרות התקבלה! אנחנו נשלח מישהו לחדרך בקרוב. 🙏`,
  }[lang] || `🛎️ Housekeeping on their way! 🙏`),

  reception: (phone, lang) => ({
    en: phone ? `For immediate assistance, please call reception directly: ${phone} 📞\n\nOur team will also respond to this chat shortly. 🙏`
               : `Our team will respond to this chat within a few minutes. For urgent matters, please visit the front desk. 🙏`,
    ru: phone ? `Для срочной помощи позвоните на ресепшен: ${phone} 📞\n\nМы также ответим в чате. 🙏`
               : `Наша команда ответит в ближайшие минуты. По срочным вопросам обратитесь на стойку регистрации. 🙏`,
    he: phone ? `לסיוע מיידי, אנא התקשר לקבלה: ${phone} 📞\n\nנענה גם בצ'אט בקרוב. 🙏`
               : `הצוות שלנו יענה תוך מספר דקות. לעניינים דחופים, אנא פנה לדלפק הקבלה. 🙏`,
  }[lang] || (phone ? `Reception: ${phone} 📞 — Team responding shortly 🙏` : `Team responding shortly 🙏`)),

  parking: (code, lang) => ({
    en: code ? `🚗 Underground parking — access code: *${code}*\n\nThe entrance is on the left side of the hotel. If you need help, reception can assist.`
              : `🚗 Parking is available at the hotel. Reception can provide the access details. 🙏`,
    ru: code ? `🚗 Подземная парковка — код доступа: *${code}*`
              : `🚗 Парковка доступна. За деталями обратитесь на ресепшен.`,
    he: code ? `🚗 חניה תת-קרקעית — קוד גישה: *${code}*`
              : `🚗 חניה זמינה. פנה לקבלה לפרטים.`,
  }[lang] || (code ? `🚗 Parking code: ${code}` : `🚗 Parking available — see reception for details`)),

  holding: (lang) => ({
    en: `We've received your message and a team member will be with you very shortly. Thank you for your patience! 🙏`,
    ru: `Мы получили ваше сообщение, сотрудник свяжется с вами в ближайшее время. Спасибо за терпение! 🙏`,
    he: `קיבלנו את הודעתך ואיש צוות יצור איתך קשר בקרוב. תודה על הסבלנות! 🙏`,
    de: `Wir haben Ihre Nachricht erhalten und ein Teammitglied wird sich in Kürze bei Ihnen melden. Vielen Dank für Ihre Geduld! 🙏`,
    fr: `Nous avons bien reçu votre message et un membre de notre équipe vous contactera très prochainement. Merci pour votre patience! 🙏`,
    es: `Hemos recibido su mensaje y un miembro del equipo se pondrá en contacto con usted en breve. ¡Gracias por su paciencia! 🙏`,
    it: `Abbiamo ricevuto il suo messaggio e un membro del team la contatterà a breve. Grazie per la pazienza! 🙏`,
    pt: `Recebemos a sua mensagem e um membro da equipa entrará em contacto em breve. Obrigado pela paciência! 🙏`,
    zh: `我们已收到您的消息，工作人员将很快与您联系。感谢您的耐心！🙏`,
    ar: `لقد استلمنا رسالتك وسيتواصل معك أحد أعضاء الفريق قريباً. شكراً لصبرك! 🙏`,
    nl: `We hebben uw bericht ontvangen en een teamlid zal spoedig contact met u opnemen. Bedankt voor uw geduld! 🙏`,
    el: `Λάβαμε το μήνυμά σας και ένα μέλος της ομάδας θα επικοινωνήσει μαζί σας σύντομα. Ευχαριστώ για την υπομονή σας! 🙏`,
    pl: `Otrzymaliśmy Twoją wiadomość i członek zespołu skontaktuje się z Tobą wkrótce. Dziękujemy za cierpliwość! 🙏`,
    uk: `Ми отримали ваше повідомлення, і незабаром з вами зв'яжеться член команди. Дякуємо за терпіння! 🙏`,
    sv: `Vi har tagit emot ditt meddelande och en teammedlem kommer att kontakta dig inom kort. Tack för ditt tålamod! 🙏`,
    fi: `Olemme vastaanottaneet viestisi ja tiimin jäsen ottaa sinuun yhteyttä pian. Kiitos kärsivällisyydestäsi! 🙏`,
  }[lang] || `Message received — team responding shortly! 🙏`),

  generic_staff: (lang) => ({
    en: `Our team will assist you with this shortly. Thank you for your patience! 🙏`,
    ru: `Наш сотрудник поможет вам в ближайшее время. Спасибо за терпение! 🙏`,
    he: `הצוות שלנו יסייע לך בקרוב. תודה על הסבלנות! 🙏`,
  }[lang] || `Team will assist shortly! 🙏`),
}
