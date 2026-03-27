// src/lib/scheduled.js (timezone-aware version)
// Key change: all time checks use hotel's local timezone
// Messages only sent between 09:00 and 20:00 local hotel time

import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

async function sendWhatsApp(to, body) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const fmt    = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER, to: fmt, body })
}

function t(msgs, lang) { return msgs[lang] || msgs.en }

// ── TIMEZONE HELPERS ──────────────────────────────────────────

// Get current time in hotel's local timezone
function getLocalTime(timezone) {
  try {
    const now       = new Date()
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'Europe/Nicosia',
      hour:     'numeric',
      minute:   'numeric',
      hour12:   false,
    })
    const parts  = formatter.formatToParts(now)
    const hour   = parseInt(parts.find(p => p.type === 'hour')?.value || '12')
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
    return { hour, minute, localNow: now }
  } catch {
    const now = new Date()
    return { hour: now.getUTCHours() + 2, minute: now.getUTCMinutes(), localNow: now }
  }
}

// Get local date string in hotel timezone
function getLocalDate(date, timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Europe/Nicosia',
      year:     'numeric',
      month:    '2-digit',
      day:      '2-digit',
    }).format(date) // returns YYYY-MM-DD
  } catch {
    return date.toISOString().split('T')[0]
  }
}

// Check if it's a good time to send messages (09:00-20:00 local)
function isGoodSendingTime(timezone) {
  const { hour } = getLocalTime(timezone)
  return hour >= 9 && hour < 20
}

// Check if local date matches target date
function isLocalDate(targetDateStr, timezone) {
  const localToday = getLocalDate(new Date(), timezone)
  return localToday === targetDateStr
}

// Get target date string offset by days
function getDateOffset(baseDateStr, offsetDays) {
  const d = new Date(baseDateStr)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

// ── MESSAGE BUILDERS (same as before) ────────────────────────

function buildPreCheckin7d(guest, hotel, lang) {
  const name        = guest.name || 'there'
  const h           = hotel.name
  const parkingCode = hotel.config?.parking_code || null
  const parkingLine = parkingCode
    ? { en:`🚗 Free underground parking — code ${parkingCode}`, ru:`🚗 Бесплатная подземная парковка — код ${parkingCode}`, he:`🚗 חניה חינם במרתף — קוד ${parkingCode}`, de:`🚗 Kostenlose Tiefgarage — Code ${parkingCode}`, fr:`🚗 Parking souterrain gratuit — code ${parkingCode}`, zh:`🚗 免费地下停车场 — 密码${parkingCode}`, pl:`🚗 Bezpłatny parking podziemny — kod ${parkingCode}`, sv:`🚗 Gratis underjordisk parkering — kod ${parkingCode}`, fi:`🚗 Ilmainen maanalainen parkki — koodi ${parkingCode}`, uk:`🚗 Безкоштовна підземна парковка — код ${parkingCode}`, ar:`🚗 موقف مجاني تحت الأرض — الكود ${parkingCode}`, nl:`🚗 Gratis ondergrondse parkeerplaats — code ${parkingCode}`, el:`🚗 Δωρεάν υπόγεια στάθμευση — κωδικός ${parkingCode}`, es:`🚗 Parking subterráneo gratuito — código ${parkingCode}`, ca:`🚗 Aparcament subterrani gratuït — codi ${parkingCode}`, it:`🚗 Parcheggio sotterraneo gratuito — codice ${parkingCode}`, pt:`🚗 Estacionamento subterrâneo gratuito — código ${parkingCode}` }
    : { en:`🚗 Free underground parking available`, ru:`🚗 Бесплатная подземная парковка`, he:`🚗 חניה חינם זמינה`, de:`🚗 Kostenlose Tiefgarage vorhanden`, fr:`🚗 Parking souterrain gratuit disponible`, zh:`🚗 免费地下停车场`, pl:`🚗 Bezpłatny parking podziemny`, sv:`🚗 Gratis underjordisk parkering`, fi:`🚗 Ilmainen maanalainen parkki`, uk:`🚗 Безкоштовна підземна парковка`, ar:`🚗 موقف مجاني تحت الأرض`, nl:`🚗 Gratis ondergrondse parkeerplaats`, el:`🚗 Δωρεάν υπόγεια στάθμευση`, es:`🚗 Parking subterráneo gratuito`, ca:`🚗 Aparcament subterrani gratuït`, it:`🚗 Parcheggio sotterraneo gratuito`, pt:`🚗 Estacionamento subterrâneo gratuito` }
  const p = parkingLine[lang] || parkingLine.en
  return t({
    en: `Hi ${name}! 🌴 We're looking forward to welcoming you to ${h} in 7 days.\n\nA few tips:\n🌊 The Mediterranean is perfect for swimming\n${p}\n✈️ Arriving by air? We can arrange a transfer\n\nAny questions? Just reply!`,
    ru: `Привет, ${name}! 🌴 Через 7 дней ждём вас в ${h}.\n\n🌊 Средиземное море идеально\n${p}\n✈️ Нужен трансфер из аэропорта?\n\nЕсть вопросы? Пишите!`,
    he: `היי ${name}! 🌴 אנחנו מצפים לקבל אותך ב${h} בעוד 7 ימים.\n\n🌊 הים התיכון מושלם לשחייה\n${p}\n✈️ מגיע בטיסה? נוכל לסדר העברה\n\nשאלות? פשוט שלח!`,
    de: `Hallo ${name}! 🌴 Wir freuen uns, Sie in 7 Tagen in ${h} begrüßen zu dürfen.\n\n🌊 Das Mittelmeer ist perfekt\n${p}\n✈️ Flughafentransfer möglich\n\nFragen? Einfach antworten!`,
    fr: `Bonjour ${name}! 🌴 Nous avons hâte de vous accueillir au ${h} dans 7 jours.\n\n🌊 La Méditerranée est parfaite\n${p}\n✈️ Transfer depuis l'aéroport possible\n\nDes questions? Répondez!`,
    zh: `您好 ${name}！🌴 我们期待7天后在${h}迎接您。\n\n🌊 地中海非常适合游泳\n${p}\n✈️ 可安排机场接送\n\n有问题请随时回复！`,
    pl: `Cześć ${name}! 🌴 Nie możemy się doczekać, aby powitać Cię w ${h} za 7 dni.\n\n🌊 Morze Śródziemne idealne\n${p}\n✈️ Transfer z lotniska możliwy\n\nMasz pytania? Napisz!`,
    sv: `Hej ${name}! 🌴 Vi ser fram emot att välkomna dig till ${h} om 7 dagar.\n\n🌊 Medelhavet är perfekt\n${p}\n✈️ Flygplatstransfer möjlig\n\nFrågor? Svara bara!`,
    fi: `Hei ${name}! 🌴 Odotamme innolla tervetuliaisi ${h}:iin 7 päivän päästä.\n\n🌊 Välimeri täydellinen\n${p}\n✈️ Lentokenttäkuljetus mahdollinen\n\nKysyttävää? Vastaa vain!`,
    uk: `Привіт, ${name}! 🌴 Чекаємо на вас у ${h} через 7 днів.\n\n🌊 Середземне море ідеальне\n${p}\n✈️ Трансфер з аеропорту можливий\n\nЄ питання? Пишіть!`,
    ar: `مرحباً ${name}! 🌴 نتطلع لاستقبالك في ${h} بعد 7 أيام.\n\n🌊 البحر المتوسط مثالي\n${p}\n✈️ نقل من المطار متاح\n\nأي أسئلة؟ فقط رد!`,
    nl: `Hallo ${name}! 🌴 We kijken ernaar uit u over 7 dagen te verwelkomen in ${h}.\n\n🌊 De Middellandse Zee is perfect\n${p}\n✈️ Luchthavenstransfer mogelijk\n\nVragen? Stuur gewoon een bericht!`,
    el: `Γεια σου ${name}! 🌴 Ανυπομονούμε να σε καλωσορίσουμε στο ${h} σε 7 μέρες.\n\n🌊 Η Μεσόγειος είναι τέλεια\n${p}\n✈️ Μεταφορά από αεροδρόμιο διαθέσιμη\n\nΕρωτήσεις; Απλά απάντησε!`,
    es: `¡Hola ${name}! 🌴 Estamos deseando darte la bienvenida en ${h} en 7 días.\n\n🌊 El Mediterráneo es perfecto\n${p}\n✈️ Traslado desde el aeropuerto posible\n\n¿Tienes preguntas? ¡Solo responde!`,
    ca: `Hola ${name}! 🌴 Estem desitjant donar-te la benvinguda a ${h} d'aquí 7 dies.\n\n🌊 La Mediterrània és perfecta\n${p}\n✈️ Trasllat des de l'aeroport possible\n\nTens preguntes? Simplement respon!`,
    it: `Ciao ${name}! 🌴 Non vediamo l'ora di darti il benvenuto al ${h} tra 7 giorni.\n\n🌊 Il Mediterraneo è perfetto\n${p}\n✈️ Transfer dall'aeroporto disponibile\n\nHai domande? Rispondi qui!`,
    pt: `Olá ${name}! 🌴 Estamos ansiosos para recebê-lo no ${h} daqui a 7 dias.\n\n🌊 O Mediterrâneo é perfeito\n${p}\n✈️ Transfer do aeroporto disponível\n\nTem perguntas? Responda aqui!`,
  }, lang)
}

function buildPreCheckin24h(guest, hotel, lang) {
  const name = guest.name || 'there'
  const room = guest.room ? `Room ${guest.room}` : 'your room'
  const h    = hotel.name

  // Pull from hotel.config — all optional, lines omitted if not configured
  const checkinTime      = hotel.config?.checkin_time      || '14:00'
  const earlyCheckinTime = hotel.config?.early_checkin_time|| '10:00'
  const earlyCheckinFee  = hotel.config?.early_checkin_fee || null
  const parkingCode      = hotel.config?.parking_code      || null
  const wifiName         = hotel.config?.wifi_name         || null
  const wifiPassword     = hotel.config?.wifi_password     || null

  // Build the optional lines dynamically
  function lines(lang) {
    const result = []

    // Parking line
    if (parkingCode) {
      const parkingLabels = { en:`🚗 Underground parking — code ${parkingCode}`, ru:`🚗 Подземная парковка — код ${parkingCode}`, he:`🚗 חניה תת-קרקעית — קוד ${parkingCode}`, de:`🚗 Tiefgarage — Code ${parkingCode}`, fr:`🚗 Parking souterrain — code ${parkingCode}`, zh:`🚗 地下停车场 — 密码${parkingCode}`, pl:`🚗 Parking podziemny — kod ${parkingCode}`, sv:`🚗 Underjordisk parkering — kod ${parkingCode}`, fi:`🚗 Maanalainen parkki — koodi ${parkingCode}`, uk:`🚗 Підземна парковка — код ${parkingCode}`, ar:`🚗 موقف تحت الأرض — الكود ${parkingCode}`, nl:`🚗 Ondergrondse parkeerplaats — code ${parkingCode}`, el:`🚗 Υπόγειο πάρκινγκ — κωδικός ${parkingCode}`, es:`🚗 Parking subterráneo — código ${parkingCode}`, ca:`🚗 Aparcament subterrani — codi ${parkingCode}`, it:`🚗 Parcheggio sotterraneo — codice ${parkingCode}`, pt:`🚗 Estacionamento subterrâneo — código ${parkingCode}` }
      result.push(parkingLabels[lang] || parkingLabels.en)
    }

    // WiFi line — only show if both name and password are configured
    if (wifiName && wifiPassword) {
      const wifiLabels = { en:`📶 WiFi: ${wifiName} | Password: ${wifiPassword}`, ru:`📶 WiFi: ${wifiName} | Пароль: ${wifiPassword}`, he:`📶 WiFi: ${wifiName} | סיסמה: ${wifiPassword}`, de:`📶 WLAN: ${wifiName} | Passwort: ${wifiPassword}`, fr:`📶 WiFi: ${wifiName} | Mot de passe: ${wifiPassword}`, zh:`📶 WiFi: ${wifiName} | 密码: ${wifiPassword}`, pl:`📶 WiFi: ${wifiName} | Hasło: ${wifiPassword}`, sv:`📶 WiFi: ${wifiName} | Lösenord: ${wifiPassword}`, fi:`📶 WiFi: ${wifiName} | Salasana: ${wifiPassword}`, uk:`📶 WiFi: ${wifiName} | Пароль: ${wifiPassword}`, ar:`📶 واي فاي: ${wifiName} | كلمة المرور: ${wifiPassword}`, nl:`📶 WiFi: ${wifiName} | Wachtwoord: ${wifiPassword}`, el:`📶 WiFi: ${wifiName} | Κωδικός: ${wifiPassword}`, es:`📶 WiFi: ${wifiName} | Contraseña: ${wifiPassword}`, ca:`📶 WiFi: ${wifiName} | Contrasenya: ${wifiPassword}`, it:`📶 WiFi: ${wifiName} | Password: ${wifiPassword}`, pt:`📶 WiFi: ${wifiName} | Password: ${wifiPassword}` }
      result.push(wifiLabels[lang] || wifiLabels.en)
    }

    // Early check-in line
    if (earlyCheckinFee) {
      const earlyLabels = { en:`☀️ Early check-in from ${earlyCheckinTime} for €${earlyCheckinFee}`, ru:`☀️ Ранний заезд с ${earlyCheckinTime} за €${earlyCheckinFee}`, he:`☀️ צ'ק-אין מוקדם מ-${earlyCheckinTime} ב-€${earlyCheckinFee}`, de:`☀️ Früh-Check-in ab ${earlyCheckinTime} für €${earlyCheckinFee}`, fr:`☀️ Check-in anticipé dès ${earlyCheckinTime} pour €${earlyCheckinFee}`, zh:`☀️ ${earlyCheckinTime}起提前入住，费用€${earlyCheckinFee}`, pl:`☀️ Wczesne zameldowanie od ${earlyCheckinTime} za €${earlyCheckinFee}`, sv:`☀️ Tidig incheckning från ${earlyCheckinTime} för €${earlyCheckinFee}`, fi:`☀️ Aikainen sisäänkirjautuminen klo ${earlyCheckinTime} alkaen €${earlyCheckinFee}`, uk:`☀️ Ранній заїзд з ${earlyCheckinTime} за €${earlyCheckinFee}`, ar:`☀️ وصول مبكر من ${earlyCheckinTime} بـ €${earlyCheckinFee}`, nl:`☀️ Vroeg inchecken vanaf ${earlyCheckinTime} voor €${earlyCheckinFee}`, el:`☀️ Πρώιμο check-in από τις ${earlyCheckinTime} για €${earlyCheckinFee}`, es:`☀️ Check-in anticipado desde las ${earlyCheckinTime} por €${earlyCheckinFee}`, ca:`☀️ Check-in anticipat des de les ${earlyCheckinTime} per €${earlyCheckinFee}`, it:`☀️ Check-in anticipato dalle ${earlyCheckinTime} per €${earlyCheckinFee}`, pt:`☀️ Check-in antecipado a partir das ${earlyCheckinTime} por €${earlyCheckinFee}` }
      result.push(earlyLabels[lang] || earlyLabels.en)
    }

    return result.join('\n')
  }

  const optionalLines = lines(lang)
  const sep = optionalLines ? '\n' + optionalLines + '\n' : '\n'

  return t({
    en: `${name}, your stay at ${h} starts tomorrow! 🎉\n\n📍 Check-in from ${checkinTime} — ${room} will be ready${sep}\nNeed an airport transfer? Reply with your flight time!`,
    ru: `${name}, ваш отдых в ${h} начинается завтра! 🎉\n\n📍 Заезд с ${checkinTime} — ${room} будет готов${sep}\nНужен трансфер? Напишите время прилёта!`,
    he: `${name}, השהות שלך ב${h} מתחילה מחר! 🎉\n\n📍 צ'ק-אין מ-${checkinTime} — ${room} יהיה מוכן${sep}\nרוצה העברה? שלח שעת נחיתה!`,
    de: `${name}, Ihr Aufenthalt in ${h} beginnt morgen! 🎉\n\n📍 Check-in ab ${checkinTime} — ${room} wird bereit sein${sep}\nBrauchen Sie einen Transfer? Schreiben Sie Ihre Ankunftszeit!`,
    fr: `${name}, votre séjour au ${h} commence demain! 🎉\n\n📍 Check-in à partir de ${checkinTime} — ${room} sera prêt${sep}\nBesoin d'un transfert? Indiquez l'heure de votre vol!`,
    zh: `${name}，您在${h}的入住明天开始！🎉\n\n📍 入住从${checkinTime}起 — ${room}将准备好${sep}\n需要机场接送？请告诉我航班到达时间！`,
    pl: `${name}, Twój pobyt w ${h} zaczyna się jutro! 🎉\n\n📍 Zameldowanie od ${checkinTime} — ${room} będzie gotowy${sep}\nPotrzebujesz transferu? Podaj godzinę przylotu!`,
    sv: `${name}, din vistelse på ${h} börjar imorgon! 🎉\n\n📍 Incheckning från ${checkinTime} — ${room} kommer att vara redo${sep}\nBehöver du transfer? Svara med din ankomsttid!`,
    fi: `${name}, vierailusi ${h}:ssa alkaa huomenna! 🎉\n\n📍 Sisäänkirjautuminen klo ${checkinTime} alkaen — ${room} on valmis${sep}\nTarvitsetko kuljetuksen? Lähetä saapumisaikasi!`,
    uk: `${name}, ваше перебування в ${h} починається завтра! 🎉\n\n📍 Заселення з ${checkinTime} — ${room} буде готовий${sep}\nПотрібен трансфер? Напишіть час прильоту!`,
    ar: `${name}، إقامتك في ${h} تبدأ غداً! 🎉\n\n📍 تسجيل الوصول من ${checkinTime} — ${room} سيكون جاهزاً${sep}\nتحتاج نقل؟ أرسل وقت وصول رحلتك!`,
    nl: `${name}, uw verblijf in ${h} begint morgen! 🎉\n\n📍 Inchecken vanaf ${checkinTime} — ${room} zal klaar zijn${sep}\nHeeft u een transfer nodig? Stuur uw aankomsttijd!`,
    el: `${name}, η διαμονή σου στο ${h} αρχίζει αύριο! 🎉\n\n📍 Check-in από τις ${checkinTime} — ${room} θα είναι έτοιμο${sep}\nΧρειάζεσαι μεταφορά; Στείλε την ώρα άφιξης!`,
    es: `¡${name}, tu estancia en ${h} empieza mañana! 🎉\n\n📍 Check-in a partir de las ${checkinTime} — ${room} estará listo${sep}\n¿Necesitas traslado? ¡Dime tu hora de llegada!`,
    ca: `${name}, la teva estada a ${h} comença demà! 🎉\n\n📍 Check-in a partir de les ${checkinTime} — ${room} estarà llest${sep}\nNecessites trasllat? Digues-me la teva hora d'arribada!`,
    it: `${name}, il tuo soggiorno al ${h} inizia domani! 🎉\n\n📍 Check-in dalle ${checkinTime} — ${room} sarà pronto${sep}\nHai bisogno di un transfer? Dimmi l'orario del tuo volo!`,
    pt: `${name}, a sua estadia no ${h} começa amanhã! 🎉\n\n📍 Check-in a partir das ${checkinTime} — ${room} estará pronto${sep}\nPrecisa de transfer? Diga-me a hora de chegada do seu voo!`,
  }, lang)
}

function buildDay1Upsell(guest, hotel, partners, lang) {
  const name       = guest.name || 'there'
  const activities = partners.filter(p => ['activity','boat tour','wine tour','golf'].includes(p.type)).slice(0,2)
  const restaurants= partners.filter(p => p.type === 'restaurant').slice(0,1)
  let sugg = ''
  if (activities.length > 0) sugg += activities.map(p => `🌟 ${p.name}`).join('\n') + '\n'
  if (restaurants.length > 0) sugg += `🍽️ ${restaurants[0].name}\n`
  if (!sugg) sugg = '🚢 Boat tour along the coastline\n🍷 Wine tasting tour\n'
  return t({
    en: `Good morning ${name}! ☀️ Hope you slept well.\n\nHere's what our guests love:\n\n${sugg}\n🎾 Tennis court — available mornings\n🏊 Rooftop pool lane\n\nWhat sounds good? Just reply! 🌴`,
    ru: `Доброе утро, ${name}! ☀️\n\nЧто нравится нашим гостям:\n\n${sugg}\n🎾 Теннисный корт — утром\n🏊 Бассейн на крыше\n\nЧто заинтересовало? 🌴`,
    he: `בוקר טוב ${name}! ☀️\n\nדברים שהאורחים שלנו אוהבים:\n\n${sugg}\n🎾 מגרש טניס — בבקרים\n🏊 נתיב פרטי בבריכה\n\nמה מתאים? 🌴`,
    de: `Guten Morgen ${name}! ☀️\n\nDas lieben unsere Gäste:\n\n${sugg}\n🎾 Tennisplatz — morgens\n🏊 Dachpool\n\nWas klingt gut? 🌴`,
    fr: `Bonjour ${name}! ☀️\n\nCe que nos clients adorent:\n\n${sugg}\n🎾 Court de tennis — le matin\n🏊 Piscine sur le toit\n\nQu'est-ce qui vous tente? 🌴`,
    zh: `早上好 ${name}！☀️\n\n我们的客人最喜欢：\n\n${sugg}\n🎾 网球场 — 上午\n🏊 屋顶泳池\n\n感兴趣请回复！🌴`,
    pl: `Dzień dobry ${name}! ☀️\n\nCo lubią nasi goście:\n\n${sugg}\n🎾 Kort tenisowy — rano\n🏊 Basen na dachu\n\nCo brzmi dobrze? 🌴`,
    sv: `God morgon ${name}! ☀️\n\nVad våra gäster älskar:\n\n${sugg}\n🎾 Tennisbana — morgnar\n🏊 Takpool\n\nVad låter bra? 🌴`,
    fi: `Hyvää huomenta ${name}! ☀️\n\nMitä vieraamme rakastavat:\n\n${sugg}\n🎾 Tenniskenttä — aamulla\n🏊 Kattoallas\n\nMikä kuulostaa hyvältä? 🌴`,
    uk: `Доброго ранку, ${name}! ☀️\n\nЩо люблять наші гості:\n\n${sugg}\n🎾 Тенісний корт — вранці\n🏊 Басейн на даху\n\nЩо цікавить? 🌴`,
    ar: `صباح الخير ${name}! ☀️\n\nما يحبه ضيوفنا:\n\n${sugg}\n🎾 ملعب التنس — صباحاً\n🏊 حمام السباحة\n\nماذا يعجبك؟ 🌴`,
    nl: `Goedemorgen ${name}! ☀️\n\nWat onze gasten graag doen:\n\n${sugg}\n🎾 Tennisbaan — ochtend\n🏊 Dakzwembad\n\nWat klinkt goed? 🌴`,
    el: `Καλημέρα ${name}! ☀️\n\nΑυτό που αγαπούν οι επισκέπτες:\n\n${sugg}\n🎾 Γήπεδο τένις — πρωί\n🏊 Πισίνα ταράτσα\n\nΤι σου φαίνεται; 🌴`,
    es: `¡Buenos días ${name}! ☀️\n\nLo que más les gusta a nuestros huéspedes:\n\n${sugg}\n🎾 Pista de tenis — mañanas\n🏊 Piscina en la azotea\n\n¿Qué te apetece? 🌴`,
    ca: `Bon dia ${name}! ☀️\n\nEl que agraden als nostres hostes:\n\n${sugg}\n🎾 Pista de tennis — matins\n🏊 Piscina a la terrassa\n\nQu'et sembla? 🌴`,
    it: `Buongiorno ${name}! ☀️\n\nCiò che i nostri ospiti amano:\n\n${sugg}\n🎾 Campo da tennis — mattino\n🏊 Piscina sul tetto\n\nCosa ti piace? 🌴`,
    pt: `Bom dia ${name}! ☀️\n\nO que os nossos hóspedes adoram:\n\n${sugg}\n🎾 Campo de ténis — manhã\n🏊 Piscina na cobertura\n\nO que lhe parece? 🌴`,
  }, lang)
}

function buildMidstayUpsell(guest, hotel, partners, lang, nightsLeft) {
  const name = guest.name || 'there'
  const activities = partners.filter(p => ['activity','boat tour','wine tour'].includes(p.type)).slice(0,3)
  const sugg = activities.length > 0
    ? activities.map(p => `✨ ${p.name}`).join('\n')
    : '✨ Sunset boat tour\n✨ Wine tasting tour\n✨ Day trip to Paphos'
  return t({
    en: `Hi ${name}! 👋 You still have ${nightsLeft} nights left — time to make memories!\n\n${sugg}\n\nInterested? I'll book it right away 🌴`,
    ru: `Привет, ${name}! 👋 У вас ещё ${nightsLeft} ночей!\n\n${sugg}\n\nЧто-то понравилось? Забронирую сразу 🌴`,
    he: `היי ${name}! 👋 נשארו לך עוד ${nightsLeft} לילות!\n\n${sugg}\n\nמשהו מעניין? אזמין מיד 🌴`,
    de: `Hallo ${name}! 👋 Noch ${nightsLeft} Nächte!\n\n${sugg}\n\nInteresse? Buche sofort! 🌴`,
    fr: `Bonjour ${name}! 👋 Il vous reste ${nightsLeft} nuits!\n\n${sugg}\n\nIntéressé? Je réserve! 🌴`,
    zh: `您好 ${name}！👋 还有 ${nightsLeft} 晚！\n\n${sugg}\n\n感兴趣？马上预订！🌴`,
    pl: `Cześć ${name}! 👋 Jeszcze ${nightsLeft} nocy!\n\n${sugg}\n\nCoś interesuje? Zarezerwuję! 🌴`,
    sv: `Hej ${name}! 👋 Fortfarande ${nightsLeft} nätter!\n\n${sugg}\n\nIntresserad? Bokar direkt! 🌴`,
    fi: `Hei ${name}! 👋 Vielä ${nightsLeft} yötä!\n\n${sugg}\n\nKiinnostaa? Varaan heti! 🌴`,
    uk: `Привіт, ${name}! 👋 Ще ${nightsLeft} ночей!\n\n${sugg}\n\nЗацікавило? Забронюю! 🌴`,
    ar: `مرحباً ${name}! 👋 لا يزال لديك ${nightsLeft} ليالٍ!\n\n${sugg}\n\nمهتم؟ سأحجز فوراً! 🌴`,
    nl: `Hallo ${name}! 👋 Nog ${nightsLeft} nachten!\n\n${sugg}\n\nGeïnteresseerd? Ik boek meteen! 🌴`,
    el: `Γεια ${name}! 👋 Ακόμη ${nightsLeft} βράδια!\n\n${sugg}\n\nΕνδιαφέρεσαι; Κάνω κράτηση! 🌴`,
    es: `¡Hola ${name}! 👋 ¡Aún te quedan ${nightsLeft} noches!\n\n${sugg}\n\n¿Te interesa? ¡Lo reservo ahora! 🌴`,
    ca: `Hola ${name}! 👋 Encara tens ${nightsLeft} nits!\n\n${sugg}\n\nT'interessa? Ho reservo ara! 🌴`,
    it: `Ciao ${name}! 👋 Ancora ${nightsLeft} notti!\n\n${sugg}\n\nTi interessa? Lo prenoto subito! 🌴`,
    pt: `Olá ${name}! 👋 Ainda tem ${nightsLeft} noites!\n\n${sugg}\n\nInteressa? Reservo agora! 🌴`,
  }, lang)
}

function buildPreCheckout(guest, hotel, lang) {
  const name     = guest.name || 'there'
  const checkout = guest.check_out
    ? new Date(guest.check_out).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})
    : 'tomorrow'
  return t({
    en: `Hi ${name}! Reminder — checkout is ${checkout} at 11:00.\n\n🕒 Late checkout until 16:00 — €50\n🚗 Airport transfer available\n🧳 Luggage storage after checkout\n\nAnything I can help with? 🌴`,
    ru: `Привет, ${name}! Выезд ${checkout} в 11:00.\n\n🕒 Поздний выезд до 16:00 — €50\n🚗 Трансфер в аэропорт\n🧳 Хранение багажа\n\nЧем могу помочь? 🌴`,
    he: `היי ${name}! צ'ק-אאוט ${checkout} ב-11:00.\n\n🕒 צ'ק-אאוט מאוחר עד 16:00 — €50\n🚗 העברה לשדה תעופה\n🧳 אחסון מטען\n\nיש משהו שאוכל לעזור? 🌴`,
    de: `Hallo ${name}! Checkout ${checkout} um 11:00.\n\n🕒 Später Checkout bis 16:00 — €50\n🚗 Flughafentransfer\n🧳 Gepäckaufbewahrung\n\nKann ich noch helfen? 🌴`,
    fr: `Bonjour ${name}! Checkout ${checkout} à 11h.\n\n🕒 Checkout tardif jusqu'à 16h — €50\n🚗 Transfert aéroport\n🧳 Consigne à bagages\n\nJe peux encore vous aider? 🌴`,
    zh: `您好 ${name}！退房时间 ${checkout} 11:00。\n\n🕒 延迟退房至16:00 — €50\n🚗 机场接送\n🧳 行李寄存\n\n还需要帮助吗？🌴`,
    pl: `Cześć ${name}! Wymeldowanie ${checkout} o 11:00.\n\n🕒 Późne wymeldowanie do 16:00 — €50\n🚗 Transfer lotniskowy\n🧳 Przechowalnia bagażu\n\nW czym mogę pomóc? 🌴`,
    sv: `Hej ${name}! Utcheckning ${checkout} kl 11:00.\n\n🕒 Sen utcheckning till 16:00 — €50\n🚗 Flygplatstransfer\n🧳 Bagageförvaring\n\nKan jag hjälpa? 🌴`,
    fi: `Hei ${name}! Uloskirjautuminen ${checkout} klo 11:00.\n\n🕒 Myöhäinen uloskirjautuminen klo 16:00 — €50\n🚗 Lentokenttäkuljetus\n🧳 Matkatavarasäilytys\n\nVoinko auttaa? 🌴`,
    uk: `Привіт, ${name}! Виїзд ${checkout} о 11:00.\n\n🕒 Пізній виїзд до 16:00 — €50\n🚗 Трансфер в аеропорт\n🧳 Зберігання багажу\n\nЧим можу допомогти? 🌴`,
    ar: `مرحباً ${name}! تسجيل المغادرة ${checkout} الساعة 11:00.\n\n🕒 مغادرة متأخرة حتى 16:00 — €50\n🚗 نقل إلى المطار\n🧳 تخزين الأمتعة\n\nهل يمكنني المساعدة؟ 🌴`,
    nl: `Hallo ${name}! Uitchecken ${checkout} om 11:00.\n\n🕒 Laat uitchecken tot 16:00 — €50\n🚗 Luchthavenstransfer\n🧳 Bagageopslag\n\nKan ik nog helpen? 🌴`,
    el: `Γεια ${name}! Αναχώρηση ${checkout} στις 11:00.\n\n🕒 Αργή αναχώρηση έως 16:00 — €50\n🚗 Μεταφορά αεροδρόμιο\n🧳 Αποθήκευση αποσκευών\n\nΜπορώ να βοηθήσω; 🌴`,
    es: `¡Hola ${name}! Checkout ${checkout} a las 11:00.\n\n🕒 Checkout tardío hasta las 16:00 — €50\n🚗 Traslado al aeropuerto\n🧳 Consigna de equipaje\n\n¿Puedo ayudarte? 🌴`,
    ca: `Hola ${name}! Check-out ${checkout} a les 11:00.\n\n🕒 Check-out tardà fins les 16:00 — €50\n🚗 Trasllat a l'aeroport\n🧳 Consigna d'equipatge\n\nEt puc ajudar? 🌴`,
    it: `Ciao ${name}! Check-out ${checkout} alle 11:00.\n\n🕒 Check-out tardivo fino alle 16:00 — €50\n🚗 Transfer aeroporto\n🧳 Deposito bagagli\n\nPosso aiutarti? 🌴`,
    pt: `Olá ${name}! Check-out ${checkout} às 11:00.\n\n🕒 Check-out tardio até às 16:00 — €50\n🚗 Transfer para o aeroporto\n🧳 Depósito de bagagem\n\nPosso ajudar? 🌴`,
  }, lang)
}

// ── STEP 1: Overall impression (replaces old 1-5 number prompt) ──
// Guest replies: 😊  😐  😞  (or "good" / "ok" / "bad" as fallback)
function buildPostCheckout(guest, hotel, lang) {
  const name = guest.name || 'there'
  const h    = hotel.name
  return t({
    en: `${name}, thank you for staying at ${h}! 🌴\n\nHow was your overall experience?\n\nReply:  😊 Great  ·  😐 OK  ·  😞 Poor`,
    ru: `${name}, спасибо за пребывание в ${h}! 🌴\n\nКак вам в целом?\n\nОтветьте:  😊 Отлично  ·  😐 Нормально  ·  😞 Плохо`,
    he: `${name}, תודה על השהות ב${h}! 🌴\n\nאיך הייתה החוויה בכלל?\n\nענה:  😊 מצוין  ·  😐 בסדר  ·  😞 גרוע`,
    de: `${name}, vielen Dank für Ihren Aufenthalt in ${h}! 🌴\n\nWie war Ihr Aufenthalt insgesamt?\n\nAntworten Sie:  😊 Super  ·  😐 OK  ·  😞 Schlecht`,
    fr: `${name}, merci d'avoir séjourné au ${h}! 🌴\n\nComment s'est passé votre séjour?\n\nRépondez:  😊 Super  ·  😐 Correct  ·  😞 Décevant`,
    es: `¡${name}, gracias por tu estancia en ${h}! 🌴\n\n¿Cómo fue tu experiencia?\n\nResponde:  😊 Genial  ·  😐 Regular  ·  😞 Mala`,
    it: `${name}, grazie per il soggiorno al ${h}! 🌴\n\nCom'è stata la tua esperienza?\n\nRispondi:  😊 Ottima  ·  😐 OK  ·  😞 Scarsa`,
    pt: `${name}, obrigado pela sua estadia no ${h}! 🌴\n\nComo foi a sua experiência?\n\nResponda:  😊 Ótima  ·  😐 OK  ·  😞 Má`,
    zh: `${name}，感谢您在${h}的入住！🌴\n\n您对整体体验的评价如何？\n\n请回复:  😊 很好  ·  😐 一般  ·  😞 差`,
    ar: `${name}، شكراً لإقامتك في ${h}! 🌴\n\nكيف كانت تجربتك بشكل عام؟\n\nأجب:  😊 رائع  ·  😐 مقبول  ·  😞 سيء`,
    nl: `${name}, bedankt voor uw verblijf in ${h}! 🌴\n\nHoe was uw ervaring?\n\nAntwoord:  😊 Geweldig  ·  😐 Oké  ·  😞 Slecht`,
    el: `${name}, ευχαριστούμε για τη διαμονή σου στο ${h}! 🌴\n\nΠώς ήταν η συνολική σου εμπειρία;\n\nΑπάντησε:  😊 Υπέροχα  ·  😐 Εντάξει  ·  😞 Κακά`,
    pl: `${name}, dziękujemy za pobyt w ${h}! 🌴\n\nJak oceniasz swój pobyt?\n\nOdpowiedz:  😊 Super  ·  😐 OK  ·  😞 Słabo`,
    uk: `${name}, дякуємо за перебування в ${h}! 🌴\n\nЯк вам загалом?\n\nВідповідайте:  😊 Чудово  ·  😐 Нормально  ·  😞 Погано`,
    sv: `${name}, tack för din vistelse på ${h}! 🌴\n\nHur var din upplevelse?\n\nSvara:  😊 Toppen  ·  😐 OK  ·  😞 Dålig`,
    fi: `${name}, kiitos vierailustasi ${h}:ssa! 🌴\n\nMiten kuvailisit kokemustasi?\n\nVastaa:  😊 Loistava  ·  😐 OK  ·  😞 Huono`,
    ca: `${name}, gràcies per allotjar-te a ${h}! 🌴\n\nCom ha anat la teva estada?\n\nRespon:  😊 Genial  ·  😐 Regular  ·  😞 Dolenta`,
  }, lang)
}

// ── STEP 2: Highlight prompt (sent after a positive reply) ───
function buildHighlightPrompt(lang) {
  return t({
    en: `Wonderful! What was the highlight of your stay?\n\nReply:  🏊 Pool & facilities  ·  🍽 Food  ·  💆 Spa  ·  👋 Staff  ·  📍 Location`,
    ru: `Замечательно! Что понравилось больше всего?\n\nОтветьте:  🏊 Бассейн  ·  🍽 Еда  ·  💆 СПА  ·  👋 Персонал  ·  📍 Расположение`,
    he: `נפלא! מה היה הדבר הכי מוצלח בשהות שלך?\n\nענה:  🏊 בריכה  ·  🍽 אוכל  ·  💆 ספא  ·  👋 צוות  ·  📍 מיקום`,
    de: `Wunderbar! Was hat Ihnen am besten gefallen?\n\nAntworten Sie:  🏊 Pool  ·  🍽 Essen  ·  💆 Spa  ·  👋 Personal  ·  📍 Lage`,
    fr: `Parfait! Qu'est-ce qui vous a le plus marqué?\n\nRépondez:  🏊 Piscine  ·  🍽 Cuisine  ·  💆 Spa  ·  👋 Équipe  ·  📍 Emplacement`,
    es: `¡Genial! ¿Qué fue lo más destacado?\n\nResponde:  🏊 Piscina  ·  🍽 Comida  ·  💆 Spa  ·  👋 Personal  ·  📍 Ubicación`,
    it: `Meraviglioso! Qual è stato il punto forte?\n\nRispondi:  🏊 Piscina  ·  🍽 Cucina  ·  💆 Spa  ·  👋 Staff  ·  📍 Posizione`,
    pt: `Que bom! O que mais o impressionou?\n\nResponda:  🏊 Piscina  ·  🍽 Comida  ·  💆 Spa  ·  👋 Equipa  ·  📍 Localização`,
    zh: `太好了！您最满意哪方面？\n\n请回复:  🏊 泳池  ·  🍽 餐饮  ·  💆 水疗  ·  👋 员工  ·  📍 位置`,
    ar: `رائع! ما كان أبرز ما أعجبك؟\n\nأجب:  🏊 المسبح  ·  🍽 الطعام  ·  💆 السبا  ·  👋 الموظفون  ·  📍 الموقع`,
    nl: `Geweldig! Wat was het hoogtepunt?\n\nAntwoord:  🏊 Zwembad  ·  🍽 Eten  ·  💆 Spa  ·  👋 Personeel  ·  📍 Locatie`,
    el: `Υπέροχα! Τι σου άρεσε περισσότερο;\n\nΑπάντησε:  🏊 Πισίνα  ·  🍽 Φαγητό  ·  💆 Spa  ·  👋 Προσωπικό  ·  📍 Τοποθεσία`,
    pl: `Wspaniale! Co najbardziej Ci się podobało?\n\nOdpowiedz:  🏊 Basen  ·  🍽 Jedzenie  ·  💆 Spa  ·  👋 Personel  ·  📍 Lokalizacja`,
    uk: `Чудово! Що сподобалось найбільше?\n\nВідповідайте:  🏊 Басейн  ·  🍽 Їжа  ·  💆 Спа  ·  👋 Персонал  ·  📍 Розташування`,
    sv: `Underbart! Vad var höjdpunkten?\n\nSvara:  🏊 Pool  ·  🍽 Mat  ·  💆 Spa  ·  👋 Personal  ·  📍 Läge`,
    fi: `Hienoa! Mikä oli parasta?\n\nVastaa:  🏊 Uima-allas  ·  🍽 Ruoka  ·  💆 Kylpylä  ·  👋 Henkilökunta  ·  📍 Sijainti`,
    ca: `Fantàstic! Què va ser el millor?\n\nRespon:  🏊 Piscina  ·  🍽 Menjar  ·  💆 Spa  ·  👋 Personal  ·  📍 Ubicació`,
  }, lang)
}

// ── STEP 3: Review links (sent after highlight reply) ─────────
// Multi-platform: Google first (higher SEO value), then TripAdvisor, Booking.com
function buildReviewLinks(lang, hotel) {
  const name   = hotel.name
  const google = hotel.config?.google_review_url
  const ta     = hotel.config?.tripadvisor_url
  const bk     = hotel.config?.booking_com_url

  // Build only the links that are configured
  const links = []
  if (google) links.push(`→ Google: ${google}`)
  if (ta)     links.push(`→ TripAdvisor: ${ta}`)
  if (bk)     links.push(`→ Booking.com: ${bk}`)

  // If no review URLs configured at all, skip the review ask
  if (!links.length) {
    return t({
      en: `Thank you for sharing that! 🌟 We hope to welcome you back to ${name} soon.`,
      ru: `Спасибо, что поделились! 🌟 Ждём вас снова в ${name}.`,
      he: `תודה שסיפרת! 🌟 נשמח לראותך שוב ב${name}.`,
      de: `Danke fürs Teilen! 🌟 Wir freuen uns, Sie bald wieder in ${name} zu sehen.`,
      fr: `Merci pour ce retour! 🌟 Nous espérons vous revoir bientôt au ${name}.`,
      es: `¡Gracias por compartir! 🌟 Esperamos verte pronto de nuevo en ${name}.`,
      it: `Grazie per aver condiviso! 🌟 Speriamo di rivederti presto al ${name}.`,
      pt: `Obrigado por partilhar! 🌟 Esperamos vê-lo em breve no ${name}.`,
      zh: `感谢您的分享！🌟 期待在${name}再次迎接您。`,
      ar: `شكراً لمشاركتك! 🌟 نأمل رؤيتك قريباً في ${name}.`,
      nl: `Bedankt voor het delen! 🌟 We hopen u snel terug te zien in ${name}.`,
      el: `Ευχαριστώ για το σχόλιο! 🌟 Ελπίζουμε να σας δούμε σύντομα ξανά στο ${name}.`,
      pl: `Dziękujemy za podzielenie się! 🌟 Mamy nadzieję wkrótce zobaczyć Cię w ${name}.`,
      uk: `Дякуємо, що поділились! 🌟 Сподіваємось знову побачити вас у ${name}.`,
      sv: `Tack för att du delade! 🌟 Vi hoppas se dig snart igen på ${name}.`,
      fi: `Kiitos jakamisesta! 🌟 Toivottavasti näemme sinut pian uudelleen ${name}:ssa.`,
      ca: `Gràcies per compartir-ho! 🌟 Esperem veure't aviat de nou a ${name}.`,
    }, lang)
  }

  const linkBlock = links.join('\n')

  return t({
    en: `So glad to hear that! 🌟\n\nOne small favour — a quick review helps future guests find us. It only takes 2 minutes:\n\n${linkBlock}\n\nThank you, and hope to see you again soon! 🌴`,
    ru: `Очень рады! 🌟\n\nНебольшая просьба — отзыв помогает другим гостям найти нас. Это займёт 2 минуты:\n\n${linkBlock}\n\nСпасибо! Ждём вас снова! 🌴`,
    he: `כל כך שמחים לשמוע! 🌟\n\nבקשה קטנה — ביקורת עוזרת לאורחים למצוא אותנו. זה לוקח 2 דקות:\n\n${linkBlock}\n\nתודה! נשמח לראותך שוב! 🌴`,
    de: `Das freut uns sehr! 🌟\n\nEine kleine Bitte — eine Bewertung hilft anderen Gästen. Dauert nur 2 Minuten:\n\n${linkBlock}\n\nDanke und bis bald! 🌴`,
    fr: `Nous en sommes ravis! 🌟\n\nUn petit service — un avis aide les futurs voyageurs. Ça prend 2 minutes:\n\n${linkBlock}\n\nMerci et à bientôt! 🌴`,
    es: `¡Nos alegra mucho! 🌟\n\nUn pequeño favor — una reseña ayuda a futuros huéspedes. Solo toma 2 minutos:\n\n${linkBlock}\n\n¡Gracias y hasta pronto! 🌴`,
    it: `Siamo davvero contenti! 🌟\n\nUn piccolo favore — una recensione aiuta gli ospiti futuri. Ci vogliono solo 2 minuti:\n\n${linkBlock}\n\nGrazie e a presto! 🌴`,
    pt: `Fico muito contente! 🌟\n\nUm pequeno favor — uma avaliação ajuda futuros hóspedes. Leva só 2 minutos:\n\n${linkBlock}\n\nObrigado e até breve! 🌴`,
    zh: `太高兴了！🌟\n\n一个小小的请求 — 您的评价能帮助未来的客人找到我们。只需2分钟：\n\n${linkBlock}\n\n谢谢，期待再次相见！🌴`,
    ar: `يسعدنا سماع ذلك! 🌟\n\nطلب صغير — تقييمك يساعد الضيوف القادمين. يستغرق دقيقتين فقط:\n\n${linkBlock}\n\nشكراً ونأمل رؤيتك قريباً! 🌴`,
    nl: `Geweldig om te horen! 🌟\n\nEen kleine gunst — een review helpt toekomstige gasten. Het duurt maar 2 minuten:\n\n${linkBlock}\n\nBedankt en tot ziens! 🌴`,
    el: `Χαρήκαμε πολύ! 🌟\n\nΜια μικρή χάρη — μια αξιολόγηση βοηθά μελλοντικούς επισκέπτες. Διαρκεί μόνο 2 λεπτά:\n\n${linkBlock}\n\nΕυχαριστούμε και ελπίζουμε να σε δούμε ξανά! 🌴`,
    pl: `Bardzo się cieszymy! 🌟\n\nMała prośba — opinia pomaga przyszłym gościom. Zajmuje tylko 2 minuty:\n\n${linkBlock}\n\nDziękujemy i do zobaczenia! 🌴`,
    uk: `Дуже раді це чути! 🌟\n\nМале прохання — відгук допомагає майбутнім гостям. Це займе 2 хвилини:\n\n${linkBlock}\n\nДякуємо і до зустрічі! 🌴`,
    sv: `Så roligt att höra! 🌟\n\nEn liten tjänst — en recension hjälper framtida gäster. Det tar bara 2 minuter:\n\n${linkBlock}\n\nTack och välkommen åter! 🌴`,
    fi: `Hieno kuulla! 🌟\n\nPieni pyyntö — arvostelu auttaa tulevia vieraita. Kestää vain 2 minuuttia:\n\n${linkBlock}\n\nKiitos ja tervetuloa uudelleen! 🌴`,
    ca: `Ens alegra molt sentir-ho! 🌟\n\nUn petit favor — una ressenya ajuda futurs hostes. Només triga 2 minuts:\n\n${linkBlock}\n\nGràcies i fins aviat! 🌴`,
  }, lang)
}

// ── LOW RATING: ask what went wrong ──────────────────────────
function buildLowRatingFollowup(lang) {
  return t({
    en: `Thank you for your honest feedback. We're sorry your stay wasn't perfect.\n\nWhat could we have done better? Your feedback goes directly to our manager.`,
    ru: `Спасибо за честный отзыв. Жаль, что не всё было идеально.\n\nЧто мы могли бы улучшить? Ваш отзыв поступит менеджеру.`,
    he: `תודה על המשוב הכנה. מצטערים שהשהות לא הייתה מושלמת.\n\nמה יכולנו לעשות טוב יותר? המשוב יגיע למנהל.`,
    de: `Danke für Ihr ehrliches Feedback. Es tut uns leid.\n\nWas hätten wir besser machen können? Ihr Feedback geht direkt an unseren Manager.`,
    fr: `Merci pour votre retour honnête. Nous sommes désolés.\n\nQue pouvions-nous faire mieux? Votre avis va directement à notre directeur.`,
    es: `Gracias por tu opinión sincera. Lo sentimos mucho.\n\n¿Qué podríamos haber hecho mejor? Tu opinión llega directamente al director.`,
    it: `Grazie per il feedback onesto. Ci dispiace.\n\nCosa avremmo potuto fare meglio? Il tuo feedback va direttamente al direttore.`,
    pt: `Obrigado pelo feedback honesto. Lamentamos.\n\nO que poderíamos ter feito melhor? O seu feedback vai diretamente para o diretor.`,
    zh: `感谢您的诚实反馈。非常抱歉。\n\n哪里可以做得更好？您的反馈将直接发给经理。`,
    ar: `شكراً على ملاحظاتك الصريحة. نأسف لذلك.\n\nما الذي كان يمكننا فعله بشكل أفضل؟ ستذهب ملاحظاتك مباشرةً إلى مديرنا.`,
    nl: `Bedankt voor uw eerlijke feedback. Het spijt ons.\n\nWat hadden we beter kunnen doen? Uw feedback gaat rechtstreeks naar onze manager.`,
    el: `Ευχαριστούμε για την ειλικρινή γνώμη σου. Λυπόμαστε πολύ.\n\nΤι θα μπορούσαμε να κάναμε καλύτερα; Η γνώμη σου πηγαίνει κατευθείαν στον διευθυντή.`,
    pl: `Dziękujemy za szczerą opinię. Przykro nam.\n\nCo mogliśmy zrobić lepiej? Twoja opinia trafi bezpośrednio do managera.`,
    uk: `Дякуємо за чесний відгук. Дуже шкода.\n\nЩо ми могли б зробити краще? Ваш відгук надійде безпосередньо менеджеру.`,
    sv: `Tack för din ärliga feedback. Vi beklagar.\n\nVad kunde vi ha gjort bättre? Din feedback går direkt till vår chef.`,
    fi: `Kiitos rehellisestä palautteestasi. Olemme pahoillamme.\n\nMitä olisimme voineet tehdä paremmin? Palautteesi menee suoraan johtajallemme.`,
    ca: `Gràcies per la teva opinió sincera. Ho sentim molt.\n\nQu'hauríem pogut fer millor? La teva opinió arribarà directament al director.`,
  }, lang)
}

// buildFeedbackFollowup removed — replaced by buildHighlightPrompt,
// buildReviewLinks, and buildLowRatingFollowup above.

// ── MAIN SCHEDULER ────────────────────────────────────────────
export async function processScheduledMessages(hotelId) {
  const supabase = getSupabase()
  const results  = { sent: 0, skipped: 0, failed: 0, errors: [] }

  // Load hotel with timezone
  const { data: hotel }    = await supabase.from('hotels').select('*').eq('id', hotelId).single()
  const timezone           = hotel?.timezone || 'Europe/Nicosia'

  // ── TIMEZONE GUARD ────────────────────────────────────────
  // Only send messages between 09:00 and 20:00 local hotel time
  if (!isGoodSendingTime(timezone)) {
    console.log(`Skipping ${hotel?.name} — outside sending hours (09:00-20:00 ${timezone})`)
    return { ...results, skipped: -1, reason: 'outside_hours' }
  }

  const { data: partners } = await supabase.from('partners').select('*').eq('hotel_id', hotelId).eq('active', true)
  const { data: guests }   = await supabase.from('guests').select('*').eq('hotel_id', hotelId).not('phone', 'is', null)

  // Get today's date in hotel's local timezone
  const localToday = getLocalDate(new Date(), timezone)

  for (const guest of (guests || [])) {
    if (!guest.check_in || !guest.check_out || !guest.phone) continue

    const checkinDate  = guest.check_in   // YYYY-MM-DD string
    const checkoutDate = guest.check_out  // YYYY-MM-DD string
    const stayNights   = Math.round(
      (new Date(checkoutDate) - new Date(checkinDate)) / (1000 * 60 * 60 * 24)
    )
    const lang = guest.language || 'en'

    async function shouldSend(type) {
      const { data } = await supabase.from('scheduled_messages')
        .select('id,status').eq('guest_id', guest.id).eq('message_type', type).single()
      return !(data?.status === 'sent' || data?.status === 'skipped')
    }

    async function markSent(type) {
      await supabase.from('scheduled_messages').upsert({
        hotel_id: hotelId, guest_id: guest.id,
        message_type: type, status: 'sent',
        sent_at: new Date().toISOString(),
      }, { onConflict: 'guest_id,message_type' })
    }

    async function markSkipped(type) {
      await supabase.from('scheduled_messages').upsert({
        hotel_id: hotelId, guest_id: guest.id,
        message_type: type, status: 'skipped',
        sent_at: new Date().toISOString(),
      }, { onConflict: 'guest_id,message_type' })
    }

    async function send(type, message) {
      try {
        await sendWhatsApp(guest.phone, message)
        await markSent(type)
        // Save to conversation
        const { data: conv } = await supabase.from('conversations')
          .select('id,messages').eq('guest_id', guest.id)
          .in('status',['active','escalated'])
          .order('created_at',{ascending:false}).limit(1).single()
        if (conv) {
          const messages = [...(conv.messages||[]), {
            role:'assistant', content:message,
            ts: new Date().toISOString(), sent_by:'scheduled',
          }]
          await supabase.from('conversations')
            .update({ messages, last_message_at: new Date().toISOString() })
            .eq('id', conv.id)
        }
        results.sent++
      } catch(e) {
        await supabase.from('scheduled_messages').upsert({
          hotel_id: hotelId, guest_id: guest.id,
          message_type: type, status: 'failed', error: e.message,
        }, { onConflict: 'guest_id,message_type' })
        results.failed++
        results.errors.push(`${guest.name}/${type}: ${e.message}`)
      }
    }

    // ── 7 days before check-in ────────────────────────────
    // Target date = check_in minus 7 days
    const target7d = getDateOffset(checkinDate, -7)
    if (localToday === target7d && localToday < checkinDate && await shouldSend('pre_checkin_7d'))
      await send('pre_checkin_7d', buildPreCheckin7d(guest, hotel, lang))

    // If we missed the 7d window (guest added late), skip it
    if (localToday > target7d && localToday < checkinDate)
      await markSkipped('pre_checkin_7d')

    // ── 24h before check-in ───────────────────────────────
    const target24h = getDateOffset(checkinDate, -1)
    if (localToday === target24h && localToday < checkinDate && await shouldSend('pre_checkin_24h'))
      await send('pre_checkin_24h', buildPreCheckin24h(guest, hotel, lang))

    // ── Day 1 upsell (morning after first night) ──────────
    // Only send in morning window (09:00-12:00 local)
    const { hour } = getLocalTime(timezone)
    const day1Target = getDateOffset(checkinDate, 1)
    const isMorning  = hour >= 9 && hour < 12
    if (localToday === day1Target && isMorning && localToday < checkoutDate && await shouldSend('day1_upsell'))
      await send('day1_upsell', buildDay1Upsell(guest, hotel, partners||[], lang))

    // ── Mid-stay upsell (only if 6+ nights) ──────────────
    if (stayNights >= 6) {
      const midDayIndex  = Math.floor(stayNights / 2)
      const midTarget    = getDateOffset(checkinDate, midDayIndex)
      const nightsLeft   = Math.round(
        (new Date(checkoutDate) - new Date(localToday)) / (1000 * 60 * 60 * 24)
      )
      if (localToday === midTarget && nightsLeft >= 2 && localToday < checkoutDate && await shouldSend('midstay_upsell'))
        await send('midstay_upsell', buildMidstayUpsell(guest, hotel, partners||[], lang, nightsLeft))
    } else {
      await markSkipped('midstay_upsell')
    }

    // ── Day before checkout (evening 17:00-20:00) ─────────
    const preCheckoutTarget = getDateOffset(checkoutDate, -1)
    const isEvening         = hour >= 17 && hour < 20
    if (localToday === preCheckoutTarget && isEvening && await shouldSend('pre_checkout'))
      await send('pre_checkout', buildPreCheckout(guest, hotel, lang))

    // ── Post-checkout feedback (day after checkout, 10:00-14:00) ────
    // Sent the day AFTER checkout so guest is home and relaxed, not at the airport.
    const postCheckoutTarget = getDateOffset(checkoutDate, 1)
    const isMidMorning       = hour >= 10 && hour < 14
    if (localToday === postCheckoutTarget && isMidMorning && await shouldSend('post_checkout'))
      await send('post_checkout', buildPostCheckout(guest, hotel, lang))
  }

  return results
}

// ── HANDLE FEEDBACK REPLY ─────────────────────────────────────
// Two-step flow:
//   Step 1 — guest replies to post_checkout survey (😊 / 😐 / 😞)
//             → positive: ask highlight question (step 2)
//             → negative: ask what went wrong + alert manager
//   Step 2 — guest replies to highlight question (🏊 / 🍽 / etc.)
//             → send review links
//
// State is tracked via feedback_step column in guest_feedback:
//   null / missing = no survey sent yet
//   'awaiting_impression' = step 1 sent, waiting for 😊/😐/😞
//   'awaiting_highlight'  = step 2 sent (positive only), waiting for highlight
//   'complete'            = done

export async function handleFeedbackReply(from, message, hotelId) {
  const supabase = getSupabase()
  const msg      = message.trim()

  // Load guest
  const { data: guest } = await supabase
    .from('guests')
    .select('*')
    .eq('phone', from)
    .eq('hotel_id', hotelId)
    .single()
  if (!guest) return false

  // Check a post_checkout message was actually sent to this guest
  const { data: scheduled } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('guest_id', guest.id)
    .eq('message_type', 'post_checkout')
    .eq('status', 'sent')
    .single()
  if (!scheduled) return false

  const { data: hotel } = await supabase
    .from('hotels')
    .select('*')
    .eq('id', hotelId)
    .single()

  const lang = guest.language || 'en'

  // Load existing feedback record if any
  const { data: existing } = await supabase
    .from('guest_feedback')
    .select('*')
    .eq('guest_id', guest.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const feedbackStep = existing?.feedback_step || 'awaiting_impression'

  // Helper to send a WhatsApp reply
  async function reply(body) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to:   from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      body,
    })
  }

  // ── STEP 1: Parse overall impression ─────────────────────────
  if (feedbackStep === 'awaiting_impression') {
    const positive = ['😊','great','good','excellent','amazing','wonderful','super','genial','ottima','bien','gut','super','super','super','ممتاز','отлично','чудово','מצוין','geweldig','υπέροχα','loistava','toppen','świetnie'].some(k => msg.toLowerCase().includes(k.toLowerCase()))
    const negative = ['😞','poor','bad','terrible','awful','disappointing','schlecht','malo','scarso','mal','slecht','κακά','плохо','погано','גרוע','سيء','huono','dålig','słabo'].some(k => msg.toLowerCase().includes(k.toLowerCase()))
    const neutral  = ['😐','ok','okay','fine','correct','gut','bra','bene','bien','goed','εντάξει','нормально','нормально','בסדר','مقبول'].some(k => msg.toLowerCase().includes(k.toLowerCase()))

    // Also treat a plain number rating as before (backward compat)
    const numRating = parseInt(msg)
    const isPositiveNum = !isNaN(numRating) && numRating >= 4
    const isNegativeNum = !isNaN(numRating) && numRating <= 2

    const isPositive = positive || isPositiveNum
    const isNegative = negative || isNegativeNum
    const isNeutral  = neutral  || (!isNaN(numRating) && numRating === 3)

    // Not a recognisable impression reply — don't consume the message
    if (!isPositive && !isNegative && !isNeutral) return false

    // Determine numeric score for storage (positive=5, neutral=3, negative=1)
    const rating = isPositive ? 5 : isNeutral ? 3 : 1

    if (existing) {
      // Update existing record
      await supabase.from('guest_feedback')
        .update({ rating, feedback_step: isPositive ? 'awaiting_highlight' : 'complete' })
        .eq('id', existing.id)
    } else {
      // Create new record
      await supabase.from('guest_feedback').insert({
        hotel_id:      hotelId,
        guest_id:      guest.id,
        rating,
        language:      lang,
        feedback_step: isPositive ? 'awaiting_highlight' : 'complete',
      })
    }

    if (isPositive) {
      // Step 2: ask what they loved most
      await reply(buildHighlightPrompt(lang))
    } else {
      // Negative or neutral: ask what went wrong, alert manager
      await reply(buildLowRatingFollowup(lang))

      if (rating <= 2) {
        await supabase.from('notifications').insert({
          hotel_id: hotelId,
          type:     'guest_message',
          title:    `⚠️ Low rating — ${guest.name || 'Guest'} · Room ${guest.room}`,
          body:     `Checked out: ${new Date(guest.check_out).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`,
        })
      }
    }

    return true
  }

  // ── STEP 2: Parse highlight + send review links ───────────────
  if (feedbackStep === 'awaiting_highlight') {
    // Accept any reply here — guest may type freely or pick an emoji
    const highlight = msg.length > 0 ? msg : null

    // Save highlight and mark complete
    await supabase.from('guest_feedback')
      .update({
        highlight,
        feedback_step: 'complete',
      })
      .eq('id', existing.id)

    // Send review links
    await reply(buildReviewLinks(lang, hotel))

    return true
  }

  // Survey already complete — don't intercept
  return false
}
