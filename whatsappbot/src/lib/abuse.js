// src/lib/abuse.js
// ============================================================
// Abuse detection, rate limiting, and block list management
//
// Call checkInbound(phone, message, hotelId) at the START of
// every inbound webhook before doing anything else.
//
// Returns:
//   { action: 'allow' }
//   { action: 'warn',   severity, type, warnMsg }
//   { action: 'restrict' }   — call Claude but with restricted prompt
//   { action: 'block'   }   — do not respond at all
//
// ─────────────────────────────────────────────────────────────
// FIX #3: Rate limit operator bug
//
// BROKEN: !guest?.stay_status === 'active'
//   JS evaluates as: (!guest?.stay_status) === 'active'
//   !('active') → false, then false === 'active' → always false
//   Result: the active-guest protection NEVER worked.
//   Active checked-in guests could be silently auto-blocked.
//
// FIXED: guest?.stay_status !== 'active'
//   Correctly checks: "is the guest NOT an active stay?"
//   Active guests are now exempt from rate-limit blocking and warnings.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp }  from './twilio.js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── ABUSE SIGNAL PATTERNS ─────────────────────────────────────

// High severity — auto-block after 1 occurrence for unknown, warn for guests
const HIGH_PATTERNS = [
  // Threats
  /i('ll| will| am going to) (kill|hurt|attack|bomb|shoot|stab)/i,
  /(threat|threaten|violence|weapon)/i,
  // Prompt injection attempts
  /ignore (all |your |previous |above )?(instructions?|prompt|rules|guidelines)/i,
  /you are now|forget (everything|your|that you|all)|new (instructions?|prompt|persona)/i,
  /\[system\]|\[admin\]|\[override\]|\[jailbreak\]/i,
  /act as (an? )?(different|new|evil|unrestricted|unfiltered)/i,
  // Data extraction attempts
  /give me (all |the )?(guest|customer|staff|employee) (list|data|info|details|names|numbers|emails)/i,
  /show me (all |the )?(guest|customer|staff|booking) (list|data|records)/i,
  /what('s| is) (the )?(staff|employee|manager|receptionist|admin) (phone|number|email|password)/i,
  // Impersonation
  /i am (the )?(manager|director|owner|ceo|gm|general manager|staff|receptionist|admin)/i,
  /this is (the )?(manager|director|owner|head office|corporate)/i,
]

// Medium severity — warn twice then restrict
const MEDIUM_PATTERNS = [
  // Sexual language
  /\b(fuck|shit|bitch|asshole|bastard|cunt|dick|pussy|cock|slut|whore)\b/i,
  // Harassment
  /\b(idiot|stupid|moron|retard|dumb|ugly|fat|loser|worthless)\b/i,
  // Explicit sexual content
  /(sex|sexual|porn|naked|nude|erotic|escort|prostitut)/i,
  // Scam-adjacent
  /(cryptocurrency|bitcoin|investment|wire transfer|money transfer|western union|moneygram)/i,
  /(free money|prize|winner|lottery|inheritance|million dollar)/i,
]

// Low severity — log only
const LOW_PATTERNS = [
  // Off-topic persistent
  /(weather|stock (market|price)|sport|football|politics|election|president|prime minister)/i,
  // Obvious bot testing
  /(hello world|test test|testing 123|lorem ipsum|asdfgh)/i,
]

// ── RATE LIMITING ─────────────────────────────────────────────
// Max messages per 10-minute window per phone
const RATE_LIMIT_WINDOW_MS  = 10 * 60 * 1000   // 10 minutes
const RATE_LIMIT_WARN        = 10               // warn at 10 messages
const RATE_LIMIT_BLOCK       = 20               // auto-block at 20 messages

// ── WARNING MESSAGES ──────────────────────────────────────────
const WARN_MSGS = {
  en: {
    medium: `Please keep this conversation respectful. I'm here to help with your hotel experience. If you have a genuine request, I'm happy to assist. 🙏`,
    high:   `This type of message cannot be processed. Please contact reception directly if you have a genuine concern.`,
    rate:   `You've sent many messages in a short time. Please wait a moment before sending more. 🙏`,
    blocked:`I'm unable to assist further. Please contact reception directly at the hotel front desk.`,
  },
  ru: {
    medium: `Пожалуйста, соблюдайте уважительный тон. Я здесь, чтобы помочь вам. 🙏`,
    high:   `Это сообщение не может быть обработано. Пожалуйста, обратитесь на ресепшен напрямую.`,
    rate:   `Вы отправили много сообщений за короткое время. Подождите немного. 🙏`,
    blocked:`Я не могу продолжать. Пожалуйста, обратитесь на ресепшен напрямую.`,
  },
  es: {
    medium: `Por favor mantenga un tono respetuoso. Estoy aquí para ayudarle. 🙏`,
    high:   `Este mensaje no puede ser procesado. Por favor contacte recepción directamente.`,
    rate:   `Ha enviado muchos mensajes en poco tiempo. Por favor espere un momento. 🙏`,
    blocked:`No puedo continuar. Por favor contacte recepción directamente.`,
  },
}

function getWarnMsg(type, lang = 'en') {
  const msgs = WARN_MSGS[lang] || WARN_MSGS.en
  return msgs[type] || WARN_MSGS.en[type]
}

// ── MAIN CHECK FUNCTION ───────────────────────────────────────
export async function checkInbound(phone, message, hotelId, guest, lang = 'en') {
  const supabase = getSupabase()
  const clean    = phone.replace('whatsapp:', '')

  // ── 1. Check block list ───────────────────────────────────
  const { data: blocked } = await supabase
    .from('blocked_phones')
    .select('id, is_known_guest, severity')
    .eq('hotel_id', hotelId)
    .eq('phone', clean)
    .is('unblocked_at', null)
    .single()

  if (blocked) {
    // Known guest — never silently block, redirect to reception
    if (blocked.is_known_guest || guest?.stay_status === 'active') {
      return {
        action: 'redirect',
        warnMsg: getWarnMsg('blocked', lang),
        note: 'known_guest_blocked'
      }
    }
    return { action: 'block' }
  }

  // ── 2. Rate limiting ──────────────────────────────────────
  const windowStart = new Date(Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS)

  const { data: rateRow } = await supabase
    .from('message_rate')
    .select('message_count')
    .eq('hotel_id', hotelId)
    .eq('phone', clean)
    .eq('window_start', windowStart.toISOString())
    .single()

  const msgCount = (rateRow?.message_count || 0) + 1

  // Upsert rate counter
  try {
    await supabase.from('message_rate').upsert({
      hotel_id:      hotelId,
      phone:         clean,
      window_start:  windowStart.toISOString(),
      message_count: msgCount,
    }, { onConflict: 'hotel_id,phone,window_start' })
  } catch {}

  // Clean old rate entries (keep only last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  try { await supabase.from('message_rate').delete().lt('window_start', oneHourAgo) } catch {}

  // FIX #3: was `!guest?.stay_status === 'active'` — always evaluated to false
  // due to operator precedence (!string → false, false === 'active' → false).
  // Active checked-in guests were NOT protected and could be auto-blocked.
  // Fixed to: guest?.stay_status !== 'active'
  if (msgCount >= RATE_LIMIT_BLOCK && guest?.stay_status !== 'active') {
    await logAbuse(supabase, hotelId, clean, guest?.id, 'spam', 'high', message, true)
    await autoBlock(supabase, hotelId, clean, 'spam', guest)
    return { action: 'block' }
  }

  // Also exempt active guests from rate-limit warnings —
  // a distressed guest at 2am should never hit a rate-limit wall.
  if (msgCount >= RATE_LIMIT_WARN && guest?.stay_status !== 'active') {
    await logAbuse(supabase, hotelId, clean, guest?.id, 'spam', 'low', message, false)
    return {
      action: 'warn',
      severity: 'low',
      type: 'rate',
      warnMsg: getWarnMsg('rate', lang),
    }
  }

  // ── 3. Content analysis ───────────────────────────────────
  const isKnownGuest = guest && ['active', 'pre_arrival', 'checked_out'].includes(guest.stay_status)

  // High severity check
  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(message)) {
      await logAbuse(supabase, hotelId, clean, guest?.id, classifyHigh(message), 'high', message, !isKnownGuest)

      if (!isKnownGuest) {
        // Unknown person — auto-block after first high-severity event
        await autoBlock(supabase, hotelId, clean, 'harassment', guest)
        return { action: 'block' }
      } else {
        // Known guest — warn and escalate to reception, never block silently
        await notifyReceptionAbuse(supabase, hotelId, guest, message, 'high')
        return {
          action: 'warn',
          severity: 'high',
          type: 'high',
          warnMsg: getWarnMsg('high', lang),
          escalate: true,
        }
      }
    }
  }

  // Medium severity check
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(message)) {
      // Check previous warnings in last 24h
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count: prevWarnings } = await supabase
        .from('abuse_events')
        .select('*', { count: 'exact', head: true })
        .eq('hotel_id', hotelId)
        .eq('phone', clean)
        .eq('severity', 'medium')
        .gte('created_at', dayAgo)

      await logAbuse(supabase, hotelId, clean, guest?.id, 'harassment', 'medium', message, false)

      if ((prevWarnings || 0) >= 2 && !isKnownGuest) {
        // Third offense for unknown person — restrict
        return {
          action: 'restrict',
          note: 'restricted_after_warnings',
        }
      }

      return {
        action: 'warn',
        severity: 'medium',
        type: 'medium',
        warnMsg: getWarnMsg('medium', lang),
      }
    }
  }

  // Low severity — log only, continue normally
  for (const pattern of LOW_PATTERNS) {
    if (pattern.test(message)) {
      try { await logAbuse(supabase, hotelId, clean, guest?.id, 'off_topic', 'low', message, false) } catch {}
      break
    }
  }

  return { action: 'allow' }
}

function classifyHigh(message) {
  const m = message.toLowerCase()
  if (/ignore.*instructions|you are now|act as|jailbreak/.test(m)) return 'injection'
  if (/kill|hurt|attack|bomb|shoot|threat/.test(m))                 return 'threat'
  if (/guest.*list|staff.*number|data.*records/.test(m))            return 'data_mining'
  if (/i am.*manager|this is.*corporate/.test(m))                   return 'impersonation'
  return 'harassment'
}

async function logAbuse(supabase, hotelId, phone, guestId, type, severity, message, autoBlocked) {
  await supabase.from('abuse_events').insert({
    hotel_id:     hotelId,
    guest_id:     guestId || null,
    phone,
    event_type:   type,
    severity,
    message:      message.slice(0, 500),
    auto_blocked: autoBlocked,
  })
}

async function autoBlock(supabase, hotelId, phone, reason, guest) {
  const isKnown = guest && guest.id
  await supabase.from('blocked_phones').upsert({
    hotel_id:       hotelId,
    phone,
    reason,
    severity:       'high',
    is_known_guest: isKnown,
    blocked_by:     'bot',
  }, { onConflict: 'hotel_id,phone' })

  // Notify reception of auto-block
  try { await supabase.from('notifications').insert({
    hotel_id:  hotelId,
    type:      'abuse_auto_block',
    title:     `⛔ Phone auto-blocked — ${reason}`,
    body:      `${phone}${guest?.name ? ` (${guest.name})` : ''} was automatically blocked. Review in Security tab.`,
    link_type: 'security',
  }) } catch {}
}

async function notifyReceptionAbuse(supabase, hotelId, guest, message, severity) {
  try { await supabase.from('notifications').insert({
    hotel_id:  hotelId,
    type:      'abuse_known_guest',
    title:     `⚠ Abuse alert — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
    body:      `"${message.slice(0, 100)}" — severity: ${severity}. Guest is active — not blocked.`,
    link_type: 'conversation',
  }) } catch {}
}

// ── UNBLOCK (called from dashboard API) ──────────────────────
export async function unblockPhone(hotelId, phone) {
  const supabase = getSupabase()
  await supabase
    .from('blocked_phones')
    .update({ unblocked_at: new Date().toISOString() })
    .eq('hotel_id', hotelId)
    .eq('phone', phone)
}

// ── RESTRICTION SYSTEM PROMPT ─────────────────────────────────
// Used when action = 'restrict' — Claude still responds but only to hotel topics
export const RESTRICTED_PROMPT = `
[SECURITY RESTRICTION] This conversation has been flagged for inappropriate content.
You may ONLY respond to legitimate hotel-related requests:
- Room issues, maintenance, housekeeping
- Restaurant and taxi bookings
- Hotel amenities and services
- Check-in/check-out questions
For any other topic, politely decline and offer to help with hotel services only.
Do NOT engage with off-topic content, provocative statements, or unusual requests.
`
