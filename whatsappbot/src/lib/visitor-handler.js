// src/lib/visitor-handler.js
// Handles day visitor specific bot logic
// Different greeting, no room language, booking-focused

export function buildDayVisitorPrompt(hotel, guest, partners, memory) {
  const lang     = guest?.language || 'en'
  const name     = guest?.name || 'there'
  const services = (guest?.preferred_services || []).join(', ')
  const isReturn = (guest?.visit_count_day || 0) > 0

  const partnerList = (partners || [])
    .filter(p => p.active)
    .map(p => {
      const contact = p.contact_name ? ` (contact: ${p.contact_name})` : ''
      return `- ${p.name}${contact}: ${p.type}, commission ${p.commission_rate}%`
    })
    .join('\n')

  // Build visit history context
  let visitorContext = ''
  if (isReturn && memory) {
    visitorContext = `\nVISITOR MEMORY:
${name} has visited ${guest.visit_count_day} times before.
${guest.last_visit_at ? `Last visit: ${new Date(guest.last_visit_at).toLocaleDateString('en-GB',{day:'numeric',month:'long'})}` : ''}
${services ? `Favourite services: ${services}` : ''}
Greet them warmly as a familiar face. Reference their favourite service naturally.
Example: "Welcome back ${name}! Great to see you again 🌴 Shall I book your usual tennis court?"`
  }

  const { LANGUAGE_LABELS, isRTL } = require('./language.js')
  const langName = LANGUAGE_LABELS[lang] || 'English'

  return `You are the personal concierge at ${hotel.name}.

You are speaking with ${name}, a day visitor — they do NOT have a room or overnight stay.

CRITICAL LANGUAGE RULE:
Respond ONLY in ${langName}. Never switch languages.
${isRTL(lang) ? 'This language is written right-to-left.' : ''}

YOUR ROLE FOR DAY VISITORS:
- Help them book hotel facilities: tennis, spa, restaurant, conference room, pool
- Arrange services and activities from our partners
- Be warm and personal — treat them like a valued regular
- NEVER mention room numbers, check-in, check-out, or stay-related things
- Use language like "our facilities", "when you visit", not "your room" or "your stay"

AVAILABLE FACILITIES:
- Tennis Court — book morning slots
- Spa Treatment Room — massages, facials
- Restaurant — lunch, dinner, private dining
- Conference Room — meetings, events
- Rooftop Pool — private lane bookings

BOOKING PARTNERS:
${partnerList || 'No external partners configured.'}

MAKING A BOOKING:
[BOOKING]{"type":"tennis","partner":"","details":{"date":"2026-03-25","time":"10:00","people":2}}

${visitorContext}

${hotel.config?.system_prompt || ''}

Remember: Always respond in ${langName}. Day visitor — no room, no overnight stay.`
}

// Day visitor greeting in all 17 languages
export function buildDayVisitorWelcome(guest, hotel, lang, isReturning) {
  const name     = guest.name || 'there'
  const h        = hotel.name
  const services = guest.preferred_services?.[0]

  const serviceHints = {
    tennis:     { en:'Shall I book a court?', es:'¿Reservo una pista?', fr:'Puis-je réserver un court?', de:'Soll ich einen Platz buchen?', it:'Prenoto un campo?', pt:'Reservo um court?', ru:'Забронировать корт?', zh:'需要预订球场吗？', ar:'هل أحجز ملعباً؟', nl:'Zal ik een baan boeken?', pl:'Zarezerwować kort?', sv:'Ska jag boka en bana?', fi:'Varataanko kenttä?', el:'Να κλείσω γήπεδο;', uk:'Забронювати корт?', he:'אזמין מגרש?', ca:'Reservo una pista?' },
    spa:        { en:'Want to book a treatment?', es:'¿Te apetece un tratamiento?', fr:'Voulez-vous réserver un soin?', de:'Möchten Sie eine Behandlung buchen?', it:'Vuoi prenotare un trattamento?', pt:'Quer marcar um tratamento?', ru:'Забронировать процедуру?', zh:'需要预订护理服务吗？', ar:'هل تريد حجز علاج؟', nl:'Wilt u een behandeling boeken?', pl:'Zarezerwować zabieg?', sv:'Vill du boka en behandling?', fi:'Haluatko varata hoidon?', el:'Να κλείσω μια θεραπεία;', uk:'Забронювати процедуру?', he:'אזמין טיפול?', ca:'Vols reservar un tractament?' },
    restaurant: { en:'Shall I reserve a table?', es:'¿Reservo una mesa?', fr:'Puis-je réserver une table?', de:'Soll ich einen Tisch reservieren?', it:'Prenoto un tavolo?', pt:'Reservo uma mesa?', ru:'Забронировать столик?', zh:'需要预订餐桌吗？', ar:'هل أحجز طاولة؟', nl:'Zal ik een tafel reserveren?', pl:'Zarezerwować stolik?', sv:'Ska jag boka ett bord?', fi:'Varataanko pöytä?', el:'Να κλείσω τραπέζι;', uk:'Забронювати столик?', he:'אזמין שולחן?', ca:'Reservo una taula?' },
  }

  const hint = services && serviceHints[services]
    ? (serviceHints[services][lang] || serviceHints[services].en)
    : null

  if (isReturning) {
    const msgs = {
      en: `Welcome back ${name}! 🌴 Lovely to see you again at ${h}.\n${hint ? hint : 'What can I arrange for you today?'}`,
      ru: `С возвращением, ${name}! 🌴 Рады видеть вас снова в ${h}.\n${hint || 'Что могу организовать сегодня?'}`,
      he: `ברוך שובך ${name}! 🌴 כיף לראות אותך שוב ב${h}.\n${hint || 'במה אוכל לעזור היום?'}`,
      de: `Willkommen zurück, ${name}! 🌴 Schön, Sie wieder in ${h} zu sehen.\n${hint || 'Was kann ich heute für Sie arrangieren?'}`,
      fr: `Bon retour, ${name}! 🌴 Ravi de vous revoir au ${h}.\n${hint || 'Que puis-je arranger pour vous aujourd\'hui?'}`,
      zh: `欢迎回来，${name}！🌴 很高兴再次在${h}见到您。\n${hint || '今天我能为您安排什么？'}`,
      pl: `Witamy z powrotem, ${name}! 🌴 Miło znów Cię widzieć w ${h}.\n${hint || 'Co mogę dziś dla Ciebie zorganizować?'}`,
      sv: `Välkommen tillbaka, ${name}! 🌴 Kul att se dig igen på ${h}.\n${hint || 'Vad kan jag ordna för dig idag?'}`,
      fi: `Tervetuloa takaisin, ${name}! 🌴 Hauska nähdä sinut taas ${h}:ssa.\n${hint || 'Mitä voin järjestää sinulle tänään?'}`,
      uk: `З поверненням, ${name}! 🌴 Раді бачити вас знову в ${h}.\n${hint || 'Що можу організувати сьогодні?'}`,
      ar: `مرحباً بعودتك ${name}! 🌴 يسعدنا رؤيتك مرة أخرى في ${h}.\n${hint || 'ماذا يمكنني أن أرتب لك اليوم؟'}`,
      nl: `Welkom terug, ${name}! 🌴 Fijn u weer te zien in ${h}.\n${hint || 'Wat kan ik vandaag voor u regelen?'}`,
      el: `Καλωσόρισες πάλι, ${name}! 🌴 Χαρούμενοι να σε ξαναδούμε στο ${h}.\n${hint || 'Τι μπορώ να κανονίσω για σένα σήμερα;'}`,
      es: `¡Bienvenido de nuevo, ${name}! 🌴 Qué alegría verte de nuevo en ${h}.\n${hint || '¿Qué puedo organizar para ti hoy?'}`,
      ca: `Benvingut de nou, ${name}! 🌴 Quin plaer tornar-te a veure a ${h}.\n${hint || 'Qu'et puc organitzar avui?'}`,
      it: `Bentornato, ${name}! 🌴 Che piacere rivederti al ${h}.\n${hint || 'Cosa posso organizzare per te oggi?'}`,
      pt: `Bem-vindo de volta, ${name}! 🌴 Que bom vê-lo novamente no ${h}.\n${hint || 'O que posso organizar para si hoje?'}`,
    }
    return msgs[lang] || msgs.en
  } else {
    const msgs = {
      en: `Hi ${name}! Welcome to ${h}. 🌴\n\nI can help you book our facilities — tennis, spa, restaurant, conference room, pool, and more.\n\nWhat would you like today?`,
      ru: `Привет, ${name}! Добро пожаловать в ${h}. 🌴\n\nМогу помочь с бронированием — теннис, спа, ресторан, конференц-зал, бассейн.\n\nЧто вас интересует?`,
      he: `היי ${name}! ברוך הבא ל${h}. 🌴\n\nאוכל לעזור לך להזמין את המתקנים שלנו — טניס, ספא, מסעדה, חדר ישיבות, בריכה.\n\nמה תרצה היום?`,
      de: `Hallo ${name}! Willkommen in ${h}. 🌴\n\nIch helfe Ihnen bei der Buchung unserer Einrichtungen — Tennis, Spa, Restaurant, Konferenzraum, Pool.\n\nWas möchten Sie heute?`,
      fr: `Bonjour ${name}! Bienvenue au ${h}. 🌴\n\nJe peux vous aider à réserver nos installations — tennis, spa, restaurant, salle de conférence, piscine.\n\nQue souhaitez-vous aujourd'hui?`,
      zh: `您好 ${name}！欢迎来到${h}。🌴\n\n我可以帮您预订我们的设施 — 网球、水疗、餐厅、会议室、游泳池。\n\n今天您想要什么？`,
      pl: `Cześć ${name}! Witamy w ${h}. 🌴\n\nMogę pomóc zarezerwować nasze udogodnienia — tenis, spa, restauracja, sala konferencyjna, basen.\n\nCzego chcesz dziś?`,
      sv: `Hej ${name}! Välkommen till ${h}. 🌴\n\nJag kan hjälpa dig att boka våra anläggningar — tennis, spa, restaurang, konferensrum, pool.\n\nVad vill du ha idag?`,
      fi: `Hei ${name}! Tervetuloa ${h}:aan. 🌴\n\nVoin auttaa varaamaan tilojamme — tennis, kylpylä, ravintola, kokoushuone, uima-allas.\n\nMitä haluaisit tänään?`,
      uk: `Привіт, ${name}! Ласкаво просимо до ${h}. 🌴\n\nМожу допомогти забронювати наші послуги — теніс, спа, ресторан, конференц-зал, басейн.\n\nЩо вас цікавить?`,
      ar: `مرحباً ${name}! أهلاً بك في ${h}. 🌴\n\nيمكنني مساعدتك في حجز مرافقنا — التنس، السبا، المطعم، قاعة الاجتماعات، حمام السباحة.\n\nماذا تريد اليوم؟`,
      nl: `Hallo ${name}! Welkom bij ${h}. 🌴\n\nIk kan u helpen bij het boeken van onze faciliteiten — tennis, spa, restaurant, vergaderzaal, zwembad.\n\nWat wilt u vandaag?`,
      el: `Γεια σου ${name}! Καλωσόρισες στο ${h}. 🌴\n\nΜπορώ να σε βοηθήσω να κλείσεις τις εγκαταστάσεις μας — τένις, σπα, εστιατόριο, αίθουσα συνεδριάσεων, πισίνα.\n\nΤι θα ήθελες σήμερα;`,
      es: `¡Hola ${name}! Bienvenido a ${h}. 🌴\n\nPuedo ayudarte a reservar nuestras instalaciones — tenis, spa, restaurante, sala de reuniones, piscina.\n\n¿Qué te gustaría hoy?`,
      ca: `Hola ${name}! Benvingut a ${h}. 🌴\n\nEt puc ajudar a reservar les nostres instal·lacions — tennis, spa, restaurant, sala de reunions, piscina.\n\nQu'et agradaria avui?`,
      it: `Ciao ${name}! Benvenuto al ${h}. 🌴\n\nPosso aiutarti a prenotare le nostre strutture — tennis, spa, ristorante, sala conferenze, piscina.\n\nCosa vorresti oggi?`,
      pt: `Olá ${name}! Bem-vindo ao ${h}. 🌴\n\nPosso ajudá-lo a reservar as nossas instalações — ténis, spa, restaurante, sala de reuniões, piscina.\n\nO que gostaria hoje?`,
    }
    return msgs[lang] || msgs.en
  }
}

// Check if a number reply is a visit feedback (1-5) from a day visitor
export function isDayVisitorFeedback(message, guest) {
  if (guest?.guest_type !== 'day_visitor') return false
  const num = parseInt(message.trim())
  return !isNaN(num) && num >= 1 && num <= 5
}
