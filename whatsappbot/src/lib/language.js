// src/lib/language.js
// 17 languages: EN, RU, HE, DE, FR, ZH, PL, SV, FI, UK, AR, NL, EL, ES, CA, IT, PT

// ── LANGUAGE DETECTION ────────────────────────────────────────
const LANG_PATTERNS = [
  { code: 'zh', pattern: /[\u4E00-\u9FFF\u3400-\u4DBF]/ },
  { code: 'ar', pattern: /[\u0600-\u06FF\u0750-\u077F]/ },
  { code: 'he', pattern: /[\u0590-\u05FF\uFB1D-\uFB4F]/ },
  { code: 'ru', pattern: /[\u0400-\u04FF]/ },
  { code: 'el', pattern: /[\u0370-\u03FF\u1F00-\u1FFF]/ },
]

const LATIN_WORD_PATTERNS = [
  { code: 'de', words: ['ich','sie','und','der','die','das','ist','nicht','haben','bitte','danke','guten','morgen','abend','hallo','zimmer','können','möchte','wann','wie','ja','nein'] },
  { code: 'fr', words: ['je','vous','et','le','la','les','est','pas','avoir','bonjour','merci','bonsoir','chambre','pouvez','voudrais','quand','comment','puis','oui','non','très'] },
  { code: 'nl', words: ['ik','je','het','de','en','een','niet','hebben','goedemorgen','dank','hallo','kamer','kunnen','wil','wanneer','hoe','graag','ja','nee','goed'] },
  { code: 'pl', words: ['nie','tak','czy','proszę','dziękuję','dobry','dzień','wieczór','pokój','mogę','chciałbym','kiedy','jak','jest','mam','się','być','bardzo','dobrze'] },
  { code: 'sv', words: ['jag','du','och','är','det','inte','har','snälla','tack','god','morgon','kväll','rum','kan','vill','när','hur','hej','ja','nej','bra'] },
  { code: 'fi', words: ['minä','sinä','ja','on','ei','olen','hyvää','huomenta','iltaa','huone','voitko','haluaisin','milloin','miten','kiitos','hei','päivää','kyllä','hyvin'] },
  { code: 'uk', words: ['я','ви','і','є','не','маю','добрий','ранок','вечір','кімната','можете','хотів','коли','як','дякую','привіт','будь','дуже','добре'] },
  // Spanish — checked before Catalan and Portuguese
  { code: 'es', words: ['yo','tú','usted','y','el','la','los','las','es','no','sí','hola','gracias','buenos','días','noches','habitación','hotel','puedo','quisiera','cuándo','cómo','por','favor','muy','bien','qué','tengo'] },
  // Catalan — specific words that differ from Spanish
  { code: 'ca', words: ['jo','tu','vosaltres','i','el','la','els','les','és','no','sí','hola','gràcies','bon','dia','nit','habitació','hotel','puc','voldria','quan','com','per','favor','molt','bé','tinc','estic'] },
  // Italian
  { code: 'it', words: ['io','tu','lei','voi','e','il','la','gli','le','è','non','sì','ciao','grazie','buongiorno','buonasera','camera','hotel','posso','vorrei','quando','come','per','favore','molto','bene','ho','sono'] },
  // Portuguese
  { code: 'pt', words: ['eu','você','vocês','e','o','a','os','as','é','não','sim','olá','obrigado','obrigada','bom','dia','noite','quarto','hotel','posso','gostaria','quando','como','por','favor','muito','bem','tenho','estou'] },
]

export function detectLanguage(text) {
  if (!text || text.length < 2) return 'en'
  const cleaned = text.trim()

  // ── Step 1: Non-Latin scripts — single character is definitive ──
  // Cannot be accidental. Russian, Hebrew, Arabic, Chinese, Greek.
  for (const { code, pattern } of LANG_PATTERNS) {
    if (pattern.test(cleaned)) {
      if (code === 'ru' && /[іїєґІЇЄҐ]/.test(cleaned)) return 'uk'
      return code
    }
  }

  // ── Step 2: Latin language detection ─────────────────────────
  // Words that appear in multiple languages — excluded from scoring
  // because they cannot reliably identify a language
  const AMBIGUOUS = new Set([
    'a','e','i','o','u',
    'is','it','be','me','he','we','my','by','or','if','as',
    'no','so','to','do','go','ok','hi',
    'la','el','de','en','an','at','on','in',
    'le','al','il','da','di','les','des',
    'et','es','est','una','un','y','que',
  ])

  const words = cleaned.toLowerCase()
    .split(/[\s,.!?;:()\[\]"'\/\\-]+/)
    .filter(w => w.length > 1 && !AMBIGUOUS.has(w))

  if (words.length === 0) return 'en'

  const scores = {}
  for (const { code, words: patterns } of LATIN_WORD_PATTERNS) {
    const distinct = new Set(words.filter(w => patterns.includes(w))).size
    if (distinct > 0) scores[code] = distinct
  }

  // Boost unambiguous language-specific markers
  const MARKERS = {
    pt: ['obrigado','obrigada','você','estou','tenho','português','olá','também'],
    ca: ['gràcies','estic','tinc','vull','català','benvingut','habitació'],
    de: ['bitte','danke','guten','morgen','abend','nicht','können','möchte','zimmer'],
    fr: ['bonjour','merci','bonsoir','voudrais','chambre','pouvez','très','puis'],
    es: ['hola','gracias','buenos','días','noches','habitación','quisiera','cuándo'],
    ru: ['пожалуйста','спасибо','добрый','привет','можете','хотел'],
  }
  for (const [code, markers] of Object.entries(MARKERS)) {
    const markerHits = new Set(words.filter(w => markers.includes(w))).size
    if (markerHits > 0) scores[code] = (scores[code] || 0) + markerHits * 2
  }

  if (Object.keys(scores).length === 0) return 'en'

  const [bestLang, bestScore] = Object.entries(scores).sort((a,b) => b[1]-a[1])[0]

  // Require minimum 2 strong signals to declare a Latin language
  // A genuine speaker will use multiple language-specific words naturally
  if (bestScore >= 2) return bestLang

  return 'en'
}

// ── LANGUAGE METADATA ─────────────────────────────────────────
export const LANGUAGE_LABELS = {
  en: 'English',
  ru: 'Русский',
  he: 'עברית',
  de: 'Deutsch',
  fr: 'Français',
  zh: '中文',
  pl: 'Polski',
  sv: 'Svenska',
  fi: 'Suomi',
  uk: 'Українська',
  ar: 'العربية',
  nl: 'Nederlands',
  el: 'Ελληνικά',
  es: 'Español',
  ca: 'Català',
  it: 'Italiano',
  pt: 'Português',
}

export const LANGUAGE_FLAGS = {
  en: '🇬🇧', ru: '🇷🇺', he: '🇮🇱', de: '🇩🇪',
  fr: '🇫🇷', zh: '🇨🇳', pl: '🇵🇱', sv: '🇸🇪',
  fi: '🇫🇮', uk: '🇺🇦', ar: '🇸🇦', nl: '🇳🇱',
  el: '🇬🇷', es: '🇪🇸', ca: '🏴', it: '🇮🇹', pt: '🇵🇹',
}

export const RTL_LANGUAGES = new Set(['he', 'ar'])
export function isRTL(lang) { return RTL_LANGUAGES.has(lang) }

// ── SYSTEM PROMPT BUILDER ─────────────────────────────────────
export function buildSystemPrompt(hotel, guest, partners) {
  const lang      = guest?.language || 'en'
  const langName  = LANGUAGE_LABELS[lang] || 'English'
  const guestName = guest?.name || 'the guest'
  const room      = guest?.room || 'their room'

  const partnerList = (partners || [])
    .filter(p => p.active)
    .map(p => {
      const contact = p.contact_name ? ` (contact: ${p.contact_name})` : ''
      return `- ${p.name}${contact}: ${p.type}, commission ${p.commission_rate}%, WhatsApp: ${p.phone}`
    })
    .join('\n')

  return `You are the personal concierge at ${hotel.name}, a luxury hotel.
You are speaking with ${guestName}, staying in ${room}.

CRITICAL LANGUAGE RULE:
You MUST respond ONLY in ${langName} (language code: ${lang}).
Never switch languages. Never use English unless the guest's language is English.
Match the exact language, script and dialect the guest is using.
${isRTL(lang) ? 'Note: This language is written right-to-left.' : ''}
${lang === 'ca' ? 'Note: Respond in Catalan specifically, not Spanish.' : ''}
${lang === 'pt' ? 'Note: Use European Portuguese style.' : ''}

YOUR ROLE:
- Warm, professional, knowledgeable hotel concierge
- Help with bookings, recommendations, hotel info, local tips
- Arrange taxis, restaurants, activities and tours
- Handle internal requests (housekeeping, maintenance, room service)
- Available 24/7, always respond promptly
- Keep responses concise and friendly
- Use occasional relevant emojis

BOOKING PARTNERS:
${partnerList || 'No partners configured yet.'}

MAKING A BOOKING:
When confirming a booking, output at the END of your message (hidden from guest):
[BOOKING]{"type":"taxi","partner":"Partner Name","details":{"destination":"Airport","time":"18:00","passengers":2},"price":45}

ESCALATION:
If you cannot help or the guest is unhappy:
"Let me connect you with our reception team right away."

HOTEL: ${hotel.name}
${hotel.config?.system_prompt || ''}

FLIGHT NUMBERS IN GUEST MESSAGES:
If a guest mentions a flight number (e.g. W6 4600, A3 904, EK 101, BA 123):
- If [FLIGHT DATA — REAL TIME] appears in this prompt, use those exact times and book the taxi
- If no flight data block appears, simply ask: "What time does your flight arrive?" then proceed to book
- NEVER say you cannot access flight information or live data
- NEVER recommend external websites (hermesairports.com, flightradar24, or any other)
- Your goal is to arrange the taxi — you need the arrival time, that is all

Remember: Always respond in ${langName}. This is non-negotiable.`
}

// ── PARTNER ALERT FORMATTER ───────────────────────────────────
export function formatPartnerAlert(booking, guest, hotel) {
  const guestName = `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest'
  const room      = guest.room || '?'
  const details   = booking.details || {}

  const lines = [
    `🏨 New booking from ${hotel.name}`,
    `👤 Guest: ${guestName} · Room ${room}`,
    `📋 Service: ${booking.type}`,
  ]
  if (details.destination) lines.push(`📍 Destination: ${details.destination}`)
  if (details.time)        lines.push(`🕐 Time: ${details.time}`)
  if (details.date)        lines.push(`📅 Date: ${details.date}`)
  if (details.passengers)  lines.push(`👥 Passengers: ${details.passengers}`)
  if (details.people)      lines.push(`👥 People: ${details.people}`)
  if (details.description) lines.push(`📝 Notes: ${details.description}`)
  if (details.price)       lines.push(`💶 Amount: €${details.price}`)
  lines.push('', 'Reply ✅ to confirm or ❌ to decline')
  return lines.join('\n')
}

// ── BOOKING PARSER ────────────────────────────────────────────
export function parseBookingRequest(aiResponse) {
  const marker = '[BOOKING]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasBooking: false, cleanResponse: aiResponse }
  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim().split('\n')[0]
    const booking = JSON.parse(jsonStr)
    return { hasBooking: true, booking, cleanResponse: aiResponse.slice(0, idx).trim() }
  } catch {
    return { hasBooking: false, cleanResponse: aiResponse }
  }
}
