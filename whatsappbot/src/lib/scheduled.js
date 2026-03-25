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
  const name = guest.name || 'there'
  const h    = hotel.name
  return t({
    en: `Hi ${name}! 🌴 We're looking forward to welcoming you to ${h} in 7 days.\n\nA few tips:\n🌊 The Mediterranean is perfect for swimming\n🚗 Free underground parking — code 4521\n✈️ Arriving by air? We can arrange a transfer\n\nAny questions? Just reply!`,
    ru: `Привет, ${name}! 🌴 Через 7 дней ждём вас в ${h}.\n\n🌊 Средиземное море идеально\n🚗 Бесплатная подземная парковка — код 4521\n✈️ Нужен трансфер из аэропорта?\n\nЕсть вопросы? Пишите!`,
    he: `היי ${name}! 🌴 אנחנו מצפים לקבל אותך ב${h} בעוד 7 ימים.\n\n🌊 הים התיכון מושלם לשחייה\n🚗 חניה חינם במרתף — קוד 4521\n✈️ מגיע בטיסה? נוכל לסדר העברה\n\nשאלות? פשוט שלח!`,
    de: `Hallo ${name}! 🌴 Wir freuen uns, Sie in 7 Tagen in ${h} begrüßen zu dürfen.\n\n🌊 Das Mittelmeer ist perfekt\n🚗 Kostenlose Tiefgarage — Code 4521\n✈️ Flughafentransfer möglich\n\nFragen? Einfach antworten!`,
    fr: `Bonjour ${name}! 🌴 Nous avons hâte de vous accueillir au ${h} dans 7 jours.\n\n🌊 La Méditerranée est parfaite\n🚗 Parking souterrain gratuit — code 4521\n✈️ Transfer depuis l'aéroport possible\n\nDes questions? Répondez!`,
    zh: `您好 ${name}！🌴 我们期待7天后在${h}迎接您。\n\n🌊 地中海非常适合游泳\n🚗 免费地下停车场 — 密码4521\n✈️ 可安排机场接送\n\n有问题请随时回复！`,
    pl: `Cześć ${name}! 🌴 Nie możemy się doczekać, aby powitać Cię w ${h} za 7 dni.\n\n🌊 Morze Śródziemne idealne\n🚗 Bezpłatny parking podziemny — kod 4521\n✈️ Transfer z lotniska możliwy\n\nMasz pytania? Napisz!`,
    sv: `Hej ${name}! 🌴 Vi ser fram emot att välkomna dig till ${h} om 7 dagar.\n\n🌊 Medelhavet är perfekt\n🚗 Gratis underjordisk parkering — kod 4521\n✈️ Flygplatstransfer möjlig\n\nFrågor? Svara bara!`,
    fi: `Hei ${name}! 🌴 Odotamme innolla tervetuliaisi ${h}:iin 7 päivän päästä.\n\n🌊 Välimeri täydellinen\n🚗 Ilmainen maanalainen parkki — koodi 4521\n✈️ Lentokenttäkuljetus mahdollinen\n\nKysyttävää? Vastaa vain!`,
    uk: `Привіт, ${name}! 🌴 Чекаємо на вас у ${h} через 7 днів.\n\n🌊 Середземне море ідеальне\n🚗 Безкоштовна підземна парковка — код 4521\n✈️ Трансфер з аеропорту можливий\n\nЄ питання? Пишіть!`,
    ar: `مرحباً ${name}! 🌴 نتطلع لاستقبالك في ${h} بعد 7 أيام.\n\n🌊 البحر المتوسط مثالي\n🚗 موقف مجاني تحت الأرض — الكود 4521\n✈️ نقل من المطار متاح\n\nأي أسئلة؟ فقط رد!`,
    nl: `Hallo ${name}! 🌴 We kijken ernaar uit u over 7 dagen te verwelkomen in ${h}.\n\n🌊 De Middellandse Zee is perfect\n🚗 Gratis ondergrondse parkeerplaats — code 4521\n✈️ Luchthavenstransfer mogelijk\n\nVragen? Stuur gewoon een bericht!`,
    el: `Γεια σου ${name}! 🌴 Ανυπομονούμε να σε καλωσορίσουμε στο ${h} σε 7 μέρες.\n\n🌊 Η Μεσόγειος είναι τέλεια\n🚗 Δωρεάν υπόγεια στάθμευση — κωδικός 4521\n✈️ Μεταφορά από αεροδρόμιο διαθέσιμη\n\nΕρωτήσεις; Απλά απάντησε!`,
    es: `¡Hola ${name}! 🌴 Estamos deseando darte la bienvenida en ${h} en 7 días.\n\n🌊 El Mediterráneo es perfecto\n🚗 Parking subterráneo gratuito — código 4521\n✈️ Traslado desde el aeropuerto posible\n\n¿Tienes preguntas? ¡Solo responde!`,
    ca: `Hola ${name}! 🌴 Estem desitjant donar-te la benvinguda a ${h} d'aquí 7 dies.\n\n🌊 La Mediterrània és perfecta\n🚗 Aparcament subterrani gratuït — codi 4521\n✈️ Trasllat des de l'aeroport possible\n\nTens preguntes? Simplement respon!`,
    it: `Ciao ${name}! 🌴 Non vediamo l'ora di darti il benvenuto al ${h} tra 7 giorni.\n\n🌊 Il Mediterraneo è perfetto\n🚗 Parcheggio sotterraneo gratuito — codice 4521\n✈️ Transfer dall'aeroporto disponibile\n\nHai domande? Rispondi qui!`,
    pt: `Olá ${name}! 🌴 Estamos ansiosos para recebê-lo no ${h} daqui a 7 dias.\n\n🌊 O Mediterrâneo é perfeito\n🚗 Estacionamento subterrâneo gratuito — código 4521\n✈️ Transfer do aeroporto disponível\n\nTem perguntas? Responda aqui!`,
  }, lang)
}

function buildPreCheckin24h(guest, hotel, lang) {
  const name = guest.name || 'there'
  const room = guest.room ? `Room ${guest.room}` : 'your room'
  const h    = hotel.name
  return t({
    en: `${name}, your stay at ${h} starts tomorrow! 🎉\n\n📍 Check-in from 14:00 — ${room} will be ready\n🚗 Underground parking — code 4521\n📶 WiFi: FourSeasons_Guest | Password: Limassol2026\n☀️ Early check-in from 10:00 for €30\n\nNeed an airport transfer? Reply with your flight time!`,
    ru: `${name}, ваш отдых в ${h} начинается завтра! 🎉\n\n📍 Заезд с 14:00 — ${room} будет готов\n🚗 Подземная парковка — код 4521\n📶 WiFi: FourSeasons_Guest | Пароль: Limassol2026\n☀️ Ранний заезд с 10:00 за €30\n\nНужен трансфер? Напишите время прилёта!`,
    he: `${name}, השהות שלך ב${h} מתחילה מחר! 🎉\n\n📍 צ'ק-אין מ-14:00 — ${room} יהיה מוכן\n🚗 חניה תת-קרקעית — קוד 4521\n📶 WiFi: FourSeasons_Guest | סיסמה: Limassol2026\n☀️ צ'ק-אין מוקדם מ-10:00 ב-€30\n\nרוצה העברה? שלח שעת נחיתה!`,
    de: `${name}, Ihr Aufenthalt in ${h} beginnt morgen! 🎉\n\n📍 Check-in ab 14:00 — ${room} wird bereit sein\n🚗 Tiefgarage — Code 4521\n📶 WLAN: FourSeasons_Guest | Passwort: Limassol2026\n☀️ Früh-Check-in ab 10:00 für €30\n\nBrauchen Sie einen Transfer? Schreiben Sie Ihre Ankunftszeit!`,
    fr: `${name}, votre séjour au ${h} commence demain! 🎉\n\n📍 Check-in à partir de 14h — ${room} sera prêt\n🚗 Parking souterrain — code 4521\n📶 WiFi: FourSeasons_Guest | Mot de passe: Limassol2026\n☀️ Check-in anticipé dès 10h pour €30\n\nBesoin d'un transfert? Indiquez l'heure de votre vol!`,
    zh: `${name}，您在${h}的入住明天开始！🎉\n\n📍 入住从14:00起 — ${room}将准备好\n🚗 地下停车场 — 密码4521\n📶 WiFi: FourSeasons_Guest | 密码: Limassol2026\n☀️ 10:00起提前入住，费用€30\n\n需要机场接送？请告诉我航班到达时间！`,
    pl: `${name}, Twój pobyt w ${h} zaczyna się jutro! 🎉\n\n📍 Zameldowanie od 14:00 — ${room} będzie gotowy\n🚗 Parking podziemny — kod 4521\n📶 WiFi: FourSeasons_Guest | Hasło: Limassol2026\n☀️ Wczesne zameldowanie od 10:00 za €30\n\nPotrzebujesz transferu? Podaj godzinę przylotu!`,
    sv: `${name}, din vistelse på ${h} börjar imorgon! 🎉\n\n📍 Incheckning från 14:00 — ${room} kommer att vara redo\n🚗 Underjordisk parkering — kod 4521\n📶 WiFi: FourSeasons_Guest | Lösenord: Limassol2026\n☀️ Tidig incheckning från 10:00 för €30\n\nBehöver du transfer? Svara med din ankomsttid!`,
    fi: `${name}, vierailusi ${h}:ssa alkaa huomenna! 🎉\n\n📍 Sisäänkirjautuminen klo 14:00 alkaen — ${room} on valmis\n🚗 Maanalainen parkki — koodi 4521\n📶 WiFi: FourSeasons_Guest | Salasana: Limassol2026\n☀️ Aikainen sisäänkirjautuminen klo 10:00 alkaen €30\n\nTarvitsetko kuljetuksen? Lähetä saapumisaikasi!`,
    uk: `${name}, ваше перебування в ${h} починається завтра! 🎉\n\n📍 Заселення з 14:00 — ${room} буде готовий\n🚗 Підземна парковка — код 4521\n📶 WiFi: FourSeasons_Guest | Пароль: Limassol2026\n☀️ Ранній заїзд з 10:00 за €30\n\nПотрібен трансфер? Напишіть час прильоту!`,
    ar: `${name}، إقامتك في ${h} تبدأ غداً! 🎉\n\n📍 تسجيل الوصول من 14:00 — ${room} سيكون جاهزاً\n🚗 موقف تحت الأرض — الكود 4521\n📶 واي فاي: FourSeasons_Guest | كلمة المرور: Limassol2026\n☀️ وصول مبكر من 10:00 بـ €30\n\nتحتاج نقل؟ أرسل وقت وصول رحلتك!`,
    nl: `${name}, uw verblijf in ${h} begint morgen! 🎉\n\n📍 Inchecken vanaf 14:00 — ${room} zal klaar zijn\n🚗 Ondergrondse parkeerplaats — code 4521\n📶 WiFi: FourSeasons_Guest | Wachtwoord: Limassol2026\n☀️ Vroeg inchecken vanaf 10:00 voor €30\n\nHeeft u een transfer nodig? Stuur uw aankomsttijd!`,
    el: `${name}, η διαμονή σου στο ${h} αρχίζει αύριο! 🎉\n\n📍 Check-in από τις 14:00 — ${room} θα είναι έτοιμο\n🚗 Υπόγειο πάρκινγκ — κωδικός 4521\n📶 WiFi: FourSeasons_Guest | Κωδικός: Limassol2026\n☀️ Πρώιμο check-in από τις 10:00 για €30\n\nΧρειάζεσαι μεταφορά; Στείλε την ώρα άφιξης!`,
    es: `¡${name}, tu estancia en ${h} empieza mañana! 🎉\n\n📍 Check-in a partir de las 14:00 — ${room} estará listo\n🚗 Parking subterráneo — código 4521\n📶 WiFi: FourSeasons_Guest | Contraseña: Limassol2026\n☀️ Check-in anticipado desde las 10:00 por €30\n\n¿Necesitas traslado? ¡Dime tu hora de llegada!`,
    ca: `${name}, la teva estada a ${h} comença demà! 🎉\n\n📍 Check-in a partir de les 14:00 — ${room} estarà llest\n🚗 Aparcament subterrani — codi 4521\n📶 WiFi: FourSeasons_Guest | Contrasenya: Limassol2026\n☀️ Check-in anticipat des de les 10:00 per €30\n\nNecessites trasllat? Digues-me la teva hora d'arribada!`,
    it: `${name}, il tuo soggiorno al ${h} inizia domani! 🎉\n\n📍 Check-in dalle 14:00 — ${room} sarà pronto\n🚗 Parcheggio sotterraneo — codice 4521\n📶 WiFi: FourSeasons_Guest | Password: Limassol2026\n☀️ Check-in anticipato dalle 10:00 per €30\n\nHai bisogno di un transfer? Dimmi l'orario del tuo volo!`,
    pt: `${name}, a sua estadia no ${h} começa amanhã! 🎉\n\n📍 Check-in a partir das 14:00 — ${room} estará pronto\n🚗 Estacionamento subterrâneo — código 4521\n📶 WiFi: FourSeasons_Guest | Password: Limassol2026\n☀️ Check-in antecipado a partir das 10:00 por €30\n\nPrecisa de transfer? Diga-me a hora de chegada do seu voo!`,
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

function buildPostCheckout(guest, hotel, lang) {
  const name = guest.name || 'there'
  const h    = hotel.name
  return t({
    en: `${name}, thank you for staying at ${h}! 🌴\n\nHow would you rate your experience?\n\n5 ⭐ Excellent\n4 😊 Very good\n3 😐 Good\n2 😕 Could be better\n1 😞 Poor\n\nJust reply with a number!`,
    ru: `${name}, спасибо за пребывание в ${h}! 🌴\n\nКак оцените?\n\n5 ⭐ Отлично\n4 😊 Очень хорошо\n3 😐 Хорошо\n2 😕 Могло быть лучше\n1 😞 Плохо\n\nОтветьте цифрой!`,
    he: `${name}, תודה על השהות ב${h}! 🌴\n\nאיך היית מדרג?\n\n5 ⭐ מצוין\n4 😊 טוב מאוד\n3 😐 טוב\n2 😕 יכול להיות טוב יותר\n1 😞 גרוע\n\nענה במספר!`,
    de: `${name}, vielen Dank für Ihren Aufenthalt in ${h}! 🌴\n\nWie bewerten Sie Ihren Aufenthalt?\n\n5 ⭐ Ausgezeichnet\n4 😊 Sehr gut\n3 😐 Gut\n2 😕 Könnte besser sein\n1 😞 Schlecht\n\nAntworten Sie mit einer Zahl!`,
    fr: `${name}, merci d'avoir séjourné au ${h}! 🌴\n\nComment évaluez-vous votre séjour?\n\n5 ⭐ Excellent\n4 😊 Très bien\n3 😐 Bien\n2 😕 Peut mieux faire\n1 😞 Mauvais\n\nRépondez avec un chiffre!`,
    zh: `${name}，感谢您在${h}的入住！🌴\n\n您如何评价？\n\n5 ⭐ 非常好\n4 😊 很好\n3 😐 好\n2 😕 一般\n1 😞 差\n\n请回复一个数字！`,
    pl: `${name}, dziękujemy za pobyt w ${h}! 🌴\n\nJak oceniasz?\n\n5 ⭐ Doskonale\n4 😊 Bardzo dobrze\n3 😐 Dobrze\n2 😕 Mogło być lepiej\n1 😞 Źle\n\nOdpowiedz cyfrą!`,
    sv: `${name}, tack för din vistelse på ${h}! 🌴\n\nHur betygsätter du?\n\n5 ⭐ Utmärkt\n4 😊 Mycket bra\n3 😐 Bra\n2 😕 Kunde vara bättre\n1 😞 Dåligt\n\nSvara med en siffra!`,
    fi: `${name}, kiitos vierailustasi ${h}:ssa! 🌴\n\nMiten arvioisit?\n\n5 ⭐ Erinomainen\n4 😊 Erittäin hyvä\n3 😐 Hyvä\n2 😕 Voisi olla parempi\n1 😞 Huono\n\nVastaa numerolla!`,
    uk: `${name}, дякуємо за перебування в ${h}! 🌴\n\nЯк оцінюєте?\n\n5 ⭐ Відмінно\n4 😊 Дуже добре\n3 😐 Добре\n2 😕 Могло бути краще\n1 😞 Погано\n\nВідповідайте цифрою!`,
    ar: `${name}، شكراً لإقامتك في ${h}! 🌴\n\nكيف تقيّم تجربتك؟\n\n5 ⭐ ممتاز\n4 😊 جيد جداً\n3 😐 جيد\n2 😕 يمكن أن يكون أفضل\n1 😞 سيء\n\nأجب برقم!`,
    nl: `${name}, bedankt voor uw verblijf in ${h}! 🌴\n\nHoe beoordeelt u?\n\n5 ⭐ Uitstekend\n4 😊 Zeer goed\n3 😐 Goed\n2 😕 Kan beter\n1 😞 Slecht\n\nAntwoord met een cijfer!`,
    el: `${name}, ευχαριστούμε για τη διαμονή σου στο ${h}! 🌴\n\nΠώς θα αξιολογούσες;\n\n5 ⭐ Άριστα\n4 😊 Πολύ καλά\n3 😐 Καλά\n2 😕 Θα μπορούσε να είναι καλύτερα\n1 😞 Κακά\n\nΑπάντησε με αριθμό!`,
    es: `¡${name}, gracias por quedarte en ${h}! 🌴\n\n¿Cómo valorarías tu experiencia?\n\n5 ⭐ Excelente\n4 😊 Muy buena\n3 😐 Buena\n2 😕 Podría ser mejor\n1 😞 Mala\n\n¡Responde con un número!`,
    ca: `${name}, gràcies per allotjar-te a ${h}! 🌴\n\nCom valoraries l'experiència?\n\n5 ⭐ Excel·lent\n4 😊 Molt bona\n3 😐 Bona\n2 😕 Podria ser millor\n1 😞 Dolenta\n\nRespon amb un número!`,
    it: `${name}, grazie per il tuo soggiorno al ${h}! 🌴\n\nCome valuteresti la tua esperienza?\n\n5 ⭐ Eccellente\n4 😊 Molto buona\n3 😐 Buona\n2 😕 Potrebbe essere migliore\n1 😞 Scarsa\n\nRispondi con un numero!`,
    pt: `${name}, obrigado por se hospedar no ${h}! 🌴\n\nComo avaliaria a sua experiência?\n\n5 ⭐ Excelente\n4 😊 Muito boa\n3 😐 Boa\n2 😕 Podia ser melhor\n1 😞 Má\n\nResponda com um número!`,
  }, lang)
}

function buildFeedbackFollowup(rating, hotel, lang, tripadvisorUrl) {
  const url = tripadvisorUrl || 'https://tripadvisor.com'
  const high = {
    en: `Thank you so much! 🌟 We're thrilled you had a great experience.\n\nA review on TripAdvisor would mean the world to us:\n${url}\n\nHope to see you again! 🌴`,
    ru: `Большое спасибо! 🌟\n\nОтзыв на TripAdvisor очень важен:\n${url}\n\nБудем рады видеть вас снова! 🌴`,
    he: `תודה רבה! 🌟\n\nביקורת ב-TripAdvisor תעזור לנו מאוד:\n${url}\n\nנשמח לראותך שוב! 🌴`,
    de: `Vielen Dank! 🌟\n\nEine Bewertung auf TripAdvisor wäre wunderbar:\n${url}\n\nBis bald! 🌴`,
    fr: `Merci beaucoup! 🌟\n\nUn avis sur TripAdvisor nous aiderait:\n${url}\n\nÀ bientôt! 🌴`,
    zh: `非常感谢！🌟\n\n请在TripAdvisor上留下评价：\n${url}\n\n期待再次欢迎您！🌴`,
    pl: `Bardzo dziękujemy! 🌟\n\nOpinia na TripAdvisor bardzo nam pomoże:\n${url}\n\nDo zobaczenia! 🌴`,
    sv: `Tack så mycket! 🌟\n\nEn recension på TripAdvisor skulle betyda mycket:\n${url}\n\nVi hoppas se dig igen! 🌴`,
    fi: `Paljon kiitoksia! 🌟\n\nArvostelu TripAdvisorissa auttaisi:\n${url}\n\nToivottavasti näemme sinut pian! 🌴`,
    uk: `Велике дякую! 🌟\n\nВідгук на TripAdvisor буде дуже важливим:\n${url}\n\nЧекаємо знову! 🌴`,
    ar: `شكراً جزيلاً! 🌟\n\nمراجعة على TripAdvisor ستعني لنا الكثير:\n${url}\n\nنأمل رؤيتك مرة أخرى! 🌴`,
    nl: `Heel erg bedankt! 🌟\n\nEen review op TripAdvisor zou veel betekenen:\n${url}\n\nTot ziens! 🌴`,
    el: `Ευχαριστούμε πολύ! 🌟\n\nΜια αξιολόγηση στο TripAdvisor θα βοηθήσει:\n${url}\n\nΕλπίζουμε να σε δούμε ξανά! 🌴`,
    es: `¡Muchas gracias! 🌟\n\nUna reseña en TripAdvisor nos ayudaría mucho:\n${url}\n\n¡Hasta pronto! 🌴`,
    ca: `Moltes gràcies! 🌟\n\nUna ressenya a TripAdvisor ens ajudaria molt:\n${url}\n\nFins aviat! 🌴`,
    it: `Grazie mille! 🌟\n\nUna recensione su TripAdvisor significherebbe molto:\n${url}\n\nA presto! 🌴`,
    pt: `Muito obrigado! 🌟\n\nUma avaliação no TripAdvisor significaria muito:\n${url}\n\nAté breve! 🌴`,
  }
  const low = {
    en: `Thank you for your honest feedback. We're sorry your stay wasn't perfect.\n\nWhat could we have done better? Your feedback goes directly to our manager.`,
    ru: `Спасибо за честный отзыв. Жаль, что не всё было идеально.\n\nЧто мы могли бы улучшить? Ваш отзыв поступит менеджеру.`,
    he: `תודה על המשוב. מצטערים שהשהות לא הייתה מושלמת.\n\nמה יכולנו לעשות טוב יותר? המשוב יגיע למנהל.`,
    de: `Danke für Ihr ehrliches Feedback. Es tut uns leid.\n\nWas hätten wir besser machen können? Ihr Feedback geht an unseren Manager.`,
    fr: `Merci pour votre retour honnête. Nous sommes désolés.\n\nQue pouvions-nous faire mieux? Votre avis va à notre directeur.`,
    zh: `感谢您的反馈。我们非常抱歉。\n\n哪里可以做得更好？您的反馈将直接发给经理。`,
    pl: `Dziękujemy za szczerą opinię. Bardzo nam przykro.\n\nCo mogliśmy zrobić lepiej? Twoja opinia trafi do managera.`,
    sv: `Tack för din ärliga feedback. Vi beklagar.\n\nVad kunde vi ha gjort bättre? Din feedback går till vår chef.`,
    fi: `Kiitos palautteestasi. Olemme pahoillamme.\n\nMitä olisimme voineet tehdä paremmin? Palautteesi menee johtajallemme.`,
    uk: `Дякуємо за чесний відгук. Дуже шкода.\n\nЩо ми могли б зробити краще? Ваш відгук надійде менеджеру.`,
    ar: `شكراً على ملاحظاتك. نحن آسفون.\n\nما الذي كان يمكننا فعله بشكل أفضل؟ ستذهب ملاحظاتك إلى مديرنا.`,
    nl: `Bedankt voor uw feedback. Het spijt ons.\n\nWat hadden we beter kunnen doen? Uw feedback gaat naar onze manager.`,
    el: `Ευχαριστούμε για την γνώμη σου. Λυπόμαστε.\n\nΤι θα μπορούσαμε να κάναμε καλύτερα; Η γνώμη σου πηγαίνει στον διευθυντή.`,
    es: `Gracias por tu opinión sincera. Lo sentimos.\n\n¿Qué podríamos haber hecho mejor? Tu opinión llega al director.`,
    ca: `Gràcies per la teva opinió sincera. Ho sentim.\n\nQu'hauríem pogut fer millor? La teva opinió arribarà al director.`,
    it: `Grazie per il feedback onesto. Ci dispiace.\n\nCosa avremmo potuto fare meglio? Il tuo feedback va al direttore.`,
    pt: `Obrigado pelo feedback honesto. Lamentamos.\n\nO que poderíamos ter feito melhor? O seu feedback vai para o diretor.`,
  }
  return rating >= 4 ? t(high, lang) : t(low, lang)
}

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

    // ── Post-checkout feedback (afternoon 13:00-17:00) ────
    const isAfternoon = hour >= 13 && hour < 17
    if (localToday === checkoutDate && isAfternoon && await shouldSend('post_checkout'))
      await send('post_checkout', buildPostCheckout(guest, hotel, lang))
  }

  return results
}

// ── HANDLE FEEDBACK REPLY ─────────────────────────────────────
export async function handleFeedbackReply(from, message, hotelId) {
  const supabase = getSupabase()
  const rating   = parseInt(message.trim())
  if (isNaN(rating) || rating < 1 || rating > 5) return false

  const { data: guest } = await supabase.from('guests').select('*')
    .eq('phone', from).eq('hotel_id', hotelId).single()
  if (!guest) return false

  const { data: scheduled } = await supabase.from('scheduled_messages').select('*')
    .eq('guest_id', guest.id).eq('message_type', 'post_checkout').eq('status', 'sent').single()
  if (!scheduled) return false

  const { data: existing } = await supabase.from('guest_feedback').select('id')
    .eq('guest_id', guest.id).single()
  if (existing) return false

  await supabase.from('guest_feedback').insert({
    hotel_id: hotelId, guest_id: guest.id,
    rating, language: guest.language || 'en',
  })

  const { data: hotel } = await supabase.from('hotels').select('*').eq('id', hotelId).single()
  const followup = buildFeedbackFollowup(rating, hotel, guest.language || 'en', hotel?.config?.tripadvisor_url)

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to:   from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    body: followup,
  })

  if (rating <= 2) {
    await supabase.from('notifications').insert({
      hotel_id: hotelId, type: 'guest_message',
      title: `Low rating ${rating}⭐ — ${guest.name || 'Guest'} · Room ${guest.room}`,
      body:  `Check-out: ${new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`,
    })
  }

  return true
}
