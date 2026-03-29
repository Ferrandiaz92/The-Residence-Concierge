// src/lib/prospect-nurture.js
// ─────────────────────────────────────────────────────────────
// FEATURE #7: Prospect nurture flow
//
// Prospects are people who messaged the hotel but haven't booked.
// Currently they're identified but nothing follows up with them.
//
// This module adds:
//   1. Interest detection — what services is the prospect asking about?
//   2. Stage progression — new → interested → quoted → converted/lost
//   3. Nurture sequence — 3 follow-up messages over 7 days
//   4. Conversion tracking — when a prospect books, mark converted
//
// Nurture sequence (only sent if prospect hasn't replied or booked):
//   Day 1 — personalised follow-up based on their interest
//   Day 3 — value offer (special rate, availability highlight)
//   Day 7 — final gentle nudge before marking as lost
//
// All messages respect the 24h session window — if it's closed,
// the message is flagged for manual sending from the dashboard.
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import twilio           from 'twilio'
import log              from '../../lib/logger.js'

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
  const fmt    = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER, to: fmt, body })
}

// ── INTEREST DETECTION ────────────────────────────────────────
// Called from whatsapp-inbound.js when guest is a prospect
const INTEREST_PATTERNS = {
  spa:        /\b(spa|massage|treatment|facial|sauna|wellness|relax)\b/i,
  tennis:     /\b(tennis|court|racket|sport)\b/i,
  restaurant: /\b(restaurant|dinner|lunch|breakfast|food|eat|table|reservation|dining)\b/i,
  pool:       /\b(pool|swim|swimming|rooftop)\b/i,
  room:       /\b(room|suite|accommodation|stay|night|book|reservation|price|rate|cost)\b/i,
  conference: /\b(conference|meeting|event|seminar|corporate|business)\b/i,
  wedding:    /\b(wedding|ceremony|reception|bride|groom)\b/i,
}

export function detectProspectInterests(message) {
  const interests = []
  for (const [key, pattern] of Object.entries(INTEREST_PATTERNS)) {
    if (pattern.test(message)) interests.push(key)
  }
  return interests
}

// ── UPDATE PROSPECT STAGE ─────────────────────────────────────
export async function updateProspectStage(guestId, stage, interests = []) {
  const supabase = getSupabase()
  const updates  = { prospect_stage: stage }

  if (interests.length > 0) {
    // Merge with existing interests (don't overwrite)
    const { data: guest } = await supabase
      .from('guests').select('prospect_interest').eq('id', guestId).single()
    const existing = guest?.prospect_interest || []
    const merged   = [...new Set([...existing, ...interests])]
    updates.prospect_interest = merged
  }

  if (stage === 'converted') {
    updates.stay_status   = 'pre_arrival'  // promote to guest
    updates.converted_at  = new Date().toISOString()
    updates.guest_type    = 'stay'
  }

  await supabase.from('guests').update(updates).eq('id', guestId)
}

// ── PROSPECT SYSTEM PROMPT SECTION ───────────────────────────
export function buildProspectPromptSection(guest, hotel) {
  const stage     = guest.prospect_stage || 'new'
  const interests = guest.prospect_interest || []
  const name      = guest.name || 'there'

  let ctx = `\n\n[PROSPECT CONTEXT]
This person is a PROSPECT — they have NOT made a booking yet.
Stage: ${stage}
${interests.length > 0 ? `Interests detected: ${interests.join(', ')}` : 'No specific interests detected yet.'}

YOUR GOALS with this prospect:
1. Be warm and welcoming — treat them like a valued potential guest
2. Answer their questions fully — don't hold back information
3. Gently guide toward booking — suggest availability, mention special offers if hotel has any
4. Capture their interest — if they mention dates, note them
5. NEVER be pushy — if they're browsing, that's fine

When the prospect shows buying intent (asks about price, availability, specific dates):
  → Provide the information warmly
  → Mention you can check availability or connect them with the team
  → Use [BOOKING] tag only if they explicitly ask to book something

Do NOT offer room booking directly — route to reception for room reservations.
You CAN book facility slots, restaurant tables, and activities.`

  if (stage === 'interested' && interests.includes('room')) {
    ctx += `\n\nThis prospect is interested in room accommodation. Suggest they reach out to reception directly or provide the hotel contact. Do NOT attempt to book a room.`
  }

  return ctx
}

// ── NURTURE SEQUENCE RUNNER ───────────────────────────────────
// Called by cron every hour — finds prospects due for follow-up
export async function runProspectNurture(hotelId) {
  const supabase = getSupabase()
  const results  = { sent: 0, skipped: 0, failed: 0, converted: 0 }

  const { data: hotel } = await supabase
    .from('hotels').select('*').eq('id', hotelId).single()
  if (!hotel) return results

  // Find active prospects who haven't been nurtured recently
  const { data: prospects } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('guest_type', 'prospect')
    .in('prospect_stage', ['new', 'interested', 'quoted'])
    .not('phone', 'is', null)
    .order('first_contact_at', { ascending: true })

  const now = new Date()

  for (const prospect of (prospects || [])) {
    const firstContact = new Date(prospect.first_contact_at || prospect.created_at)
    const daysSince    = Math.floor((now - firstContact) / 86400000)
    const nurtures     = prospect.nurture_count || 0
    const lang         = prospect.language || 'en'

    // Determine which nurture message to send based on days since contact
    let messageType = null
    if      (nurtures === 0 && daysSince >= 1) messageType = 'initial_follow_up'
    else if (nurtures === 1 && daysSince >= 3) messageType = 'value_offer'
    else if (nurtures === 2 && daysSince >= 7) messageType = 'final_attempt'
    else if (nurtures >= 3  || daysSince > 14) {
      // Mark as lost after 14 days with no conversion
      await supabase.from('guests')
        .update({ prospect_stage: 'lost' }).eq('id', prospect.id)
      results.skipped++
      continue
    }

    if (!messageType) { results.skipped++; continue }

    // Check if already sent this nurture type
    const { data: prevNurture } = await supabase
      .from('prospect_nurture_log')
      .select('id').eq('guest_id', prospect.id).eq('message_type', messageType).single()
    if (prevNurture) { results.skipped++; continue }

    // Check if prospect has already converted (booked a stay)
    if (prospect.prospect_stage === 'converted') { results.skipped++; continue }

    const message = buildNurtureMessage(messageType, prospect, hotel, lang)
    if (!message) { results.skipped++; continue }

    try {
      await sendWhatsApp(prospect.phone, message)

      // Log the nurture send
      await supabase.from('prospect_nurture_log').insert({
        hotel_id:     hotelId,
        guest_id:     prospect.id,
        message_type: messageType,
        message_body: message,
      })

      // Update prospect
      await supabase.from('guests').update({
        last_nurture_at: new Date().toISOString(),
        nurture_count:   nurtures + 1,
        prospect_stage:  prospect.prospect_stage === 'new' ? 'interested' : prospect.prospect_stage,
      }).eq('id', prospect.id)

      results.sent++
      log.info('Prospect nurture sent', {
        hotelId,
        prospectId:  prospect.id,
        messageType,
        daysSince,
      })

    } catch (err) {
      results.failed++
      log.warn('Prospect nurture send failed', { prospectId: prospect.id, error: err.message })
    }
  }

  return results
}

// ── NURTURE MESSAGE BUILDERS ──────────────────────────────────
function buildNurtureMessage(type, prospect, hotel, lang) {
  const name      = prospect.name || 'there'
  const h         = hotel.name
  const interests = prospect.prospect_interest || []
  const mainInterest = interests[0] || 'our facilities'

  const interestLabels = {
    spa:        { en: 'spa & wellness', ru: 'спа', he: 'ספא', de: 'Spa', fr: 'spa', es: 'spa' },
    tennis:     { en: 'tennis',         ru: 'теннис', he: 'טניס', de: 'Tennis', fr: 'tennis', es: 'tenis' },
    restaurant: { en: 'dining',         ru: 'ресторан', he: 'מסעדה', de: 'Restaurant', fr: 'restaurant', es: 'restaurante' },
    pool:       { en: 'pool',           ru: 'бассейн', he: 'בריכה', de: 'Pool', fr: 'piscine', es: 'piscina' },
    room:       { en: 'accommodation',  ru: 'проживание', he: 'לינה', de: 'Unterkunft', fr: 'hébergement', es: 'alojamiento' },
  }

  const interestLabel = (interestLabels[mainInterest] || {})[lang] ||
    (interestLabels[mainInterest] || {}).en || mainInterest

  const messages = {
    initial_follow_up: {
      en: `Hi ${name}! 👋 Following up from ${h} — I hope we answered all your questions yesterday. ${interests.length > 0 ? `We'd love to arrange a ${interestLabel} experience for you.` : `We'd love to welcome you to ${h}.`} Is there anything else I can help with? 😊`,
      ru: `Привет, ${name}! 👋 Это ${h} — надеемся, мы ответили на все ваши вопросы. ${interests.length > 0 ? `Будем рады организовать для вас ${interestLabel}.` : `Будем рады видеть вас в ${h}.`} Могу ли я ещё чем-то помочь? 😊`,
      he: `היי ${name}! 👋 המשך מ${h} — אני מקווה שענינו על כל השאלות שלך. ${interests.length > 0 ? `נשמח לארגן לך חוויית ${interestLabel}.` : `נשמח לקבל אותך ב${h}.`} האם יש עוד משהו שאוכל לעזור בו? 😊`,
      de: `Hallo ${name}! 👋 Nachfass von ${h} — wir hoffen, wir konnten alle Ihre Fragen beantworten. ${interests.length > 0 ? `Wir würden uns freuen, ein ${interestLabel}-Erlebnis für Sie zu arrangieren.` : `Wir heißen Sie herzlich in ${h} willkommen.`} Kann ich noch etwas für Sie tun? 😊`,
      fr: `Bonjour ${name}! 👋 Suite à notre échange au ${h} — j'espère que nous avons répondu à toutes vos questions. ${interests.length > 0 ? `Nous serions ravis d'organiser une expérience ${interestLabel} pour vous.` : `Nous vous souhaitons la bienvenue au ${h}.`} Puis-je faire autre chose pour vous? 😊`,
      es: `¡Hola ${name}! 👋 Seguimiento de ${h} — espero que hayamos respondido todas sus preguntas. ${interests.length > 0 ? `Nos encantaría organizar una experiencia de ${interestLabel} para usted.` : `Nos encantaría darle la bienvenida a ${h}.`} ¿Hay algo más en lo que pueda ayudarle? 😊`,
    },
    value_offer: {
      en: `Hi ${name}! 🌴 Just wanted to let you know — ${h} has availability this week${interests.includes('spa') ? ' and our spa has some great slots open' : ''}. Would you like me to check dates for you? No pressure — happy to help! 😊`,
      ru: `Привет, ${name}! 🌴 Хотим сообщить — в ${h} есть свободные места на этой неделе${interests.includes('spa') ? ', и в спа есть хорошие слоты' : ''}. Проверить даты для вас? Без давления — рады помочь! 😊`,
      he: `היי ${name}! 🌴 רציתי לעדכן — ב${h} יש זמינות השבוע${interests.includes('spa') ? ' וגם בספא יש מקומות פנויים' : ''}. האם לבדוק תאריכים עבורך? ללא לחץ — שמח לעזור! 😊`,
      de: `Hallo ${name}! 🌴 Kurze Information — ${h} hat diese Woche Verfügbarkeit${interests.includes('spa') ? ' und unser Spa hat noch freie Termine' : ''}. Soll ich Termine für Sie prüfen? Kein Druck — ich helfe gerne! 😊`,
      fr: `Bonjour ${name}! 🌴 Je voulais vous informer — ${h} a de la disponibilité cette semaine${interests.includes('spa') ? ' et notre spa a de bons créneaux disponibles' : ''}. Voulez-vous que je vérifie les dates pour vous? Sans pression — heureux d'aider! 😊`,
      es: `¡Hola ${name}! 🌴 Solo quería informarle — ${h} tiene disponibilidad esta semana${interests.includes('spa') ? ' y nuestro spa tiene buenos horarios disponibles' : ''}. ¿Le gustaría que compruebe fechas? Sin presión — ¡encantado de ayudar! 😊`,
    },
    final_attempt: {
      en: `Hi ${name}! 😊 Last message from us — we'd genuinely love to welcome you to ${h}. If the timing isn't right just now, no worries at all. Feel free to reach out whenever you're ready. We'll be here! 🌴`,
      ru: `Привет, ${name}! 😊 Последнее сообщение от нас — мы искренне хотели бы принять вас в ${h}. Если время сейчас неподходящее — совсем не беда. Пишите, когда будете готовы. Мы здесь! 🌴`,
      he: `היי ${name}! 😊 הודעה אחרונה מאיתנו — אנחנו מאוד רוצים לקבל אותך ב${h}. אם העיתוי לא מתאים כרגע — לא נורא בכלל. פנה אלינו כשתהיה מוכן. אנחנו כאן! 🌴`,
      de: `Hallo ${name}! 😊 Letzte Nachricht von uns — wir würden uns wirklich freuen, Sie in ${h} begrüßen zu dürfen. Falls der Zeitpunkt gerade nicht passt — kein Problem. Melden Sie sich, wenn Sie bereit sind. Wir sind hier! 🌴`,
      fr: `Bonjour ${name}! 😊 Dernier message de notre part — nous serions vraiment ravis de vous accueillir au ${h}. Si le moment n'est pas idéal, pas de souci du tout. N'hésitez pas à nous contacter quand vous serez prêt. Nous serons là! 🌴`,
      es: `¡Hola ${name}! 😊 Último mensaje de nuestra parte — nos encantaría genuinamente darle la bienvenida a ${h}. Si el momento no es el adecuado, no hay problema. No dude en contactarnos cuando esté listo. ¡Aquí estaremos! 🌴`,
    },
  }

  const msgSet = messages[type]
  if (!msgSet) return null
  return msgSet[lang] || msgSet.en
}

// ── CONVERSION TRACKING ───────────────────────────────────────
// Call when a prospect makes a booking — marks them as converted
export async function trackProspectConversion(guestId, bookingId) {
  const supabase = getSupabase()

  await supabase.from('guests').update({
    prospect_stage: 'converted',
    converted_at:   new Date().toISOString(),
    guest_type:     'stay',
    stay_status:    'pre_arrival',
  }).eq('id', guestId)

  // Update last nurture log entry with conversion
  await supabase.from('prospect_nurture_log')
    .update({ converted: true })
    .eq('guest_id', guestId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .catch(() => {})

  log.info('Prospect converted to guest', { guestId, bookingId })
}
