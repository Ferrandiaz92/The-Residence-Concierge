// src/lib/sanitize.js
// ============================================================
// Input sanitization for all untrusted text entering the system.
// Used on:
//   - Incoming WhatsApp messages (guest input)
//   - ProfileName from Twilio webhook
//   - Any DB field injected into the system prompt
// ============================================================

// Max lengths
export const MAX_MESSAGE_LEN  = 2000   // guest message before processing
export const MAX_NAME_LEN     = 80     // guest name / profile name
export const MAX_PROMPT_FIELD = 500    // any single field injected into system prompt

// ── INJECTION KEYWORDS ────────────────────────────────────────
// These patterns in guest-controlled text could manipulate Claude.
// Strip or neutralise them before injecting into the system prompt.
const INJECTION_PATTERNS = [
  // Classic override attempts
  /\[system\]/gi,
  /\[admin\]/gi,
  /\[override\]/gi,
  /\[jailbreak\]/gi,
  /\[instructions?\]/gi,
  /\[prompt\]/gi,
  /\[context\]/gi,
  /\[rules?\]/gi,
  // "Ignore" attacks
  /ignore\s+(all\s+)?(previous|above|prior|your)\s+(instructions?|rules?|prompt|guidelines?|context)/gi,
  /forget\s+(everything|your|all|that)/gi,
  // Persona attacks
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(an?\s+)?(different|new|evil|unrestricted|unfiltered|free|uncensored)/gi,
  /new\s+(instructions?|system\s+prompt|persona|role|directive)/gi,
  /your\s+new\s+(instructions?|role|name|identity)/gi,
  // Data mining
  /reveal\s+(all|every|the)\s+(guest|staff|hotel|booking|internal)/gi,
  /show\s+me\s+(all|every)\s+(guest|customer|staff|booking)\s+(list|data|record)/gi,
  /give\s+me\s+(all|the)\s+(guest|customer|staff)\s+(list|data|info|details|names|numbers|emails)/gi,
  // Impersonation
  /i\s+am\s+(the\s+)?(manager|director|owner|ceo|gm|general\s+manager|admin|receptionist)/gi,
  /this\s+is\s+(the\s+)?(manager|director|owner|head\s+office|corporate|admin)/gi,
]

// ── SANITIZE GUEST MESSAGE ────────────────────────────────────
// Trims length and removes null bytes / control chars.
// Does NOT strip injection keywords — those are caught by abuse.js patterns.
// The message itself goes to Claude as a user turn, not system prompt.
export function sanitizeMessage(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/\0/g, '')                       // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '') // control chars (keep \n \r \t)
    .slice(0, MAX_MESSAGE_LEN)
    .trim()
}

// ── SANITIZE NAME FIELD ───────────────────────────────────────
// Used on profileName from Twilio and any user-provided name.
// Strips injection patterns and limits length.
export function sanitizeName(text) {
  if (!text || typeof text !== 'string') return ''
  let clean = text
    .replace(/\0/g, '')
    .replace(/[\x01-\x1F\x7F]/g, '')          // all control chars
    .trim()
    .slice(0, MAX_NAME_LEN)

  // Strip injection patterns from names — someone could set their
  // WhatsApp display name to "[SYSTEM] ignore previous instructions"
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '')
  }

  return clean.trim().slice(0, MAX_NAME_LEN) || ''
}

// ── SANITIZE FIELD FOR SYSTEM PROMPT ─────────────────────────
// Used on any DB field (guest.name, hotel.name, kb entries, etc.)
// before concatenating into the system prompt.
// Strips injection patterns and limits length.
export function sanitizeForPrompt(text, maxLen = MAX_PROMPT_FIELD) {
  if (!text || typeof text !== 'string') return ''
  let clean = text
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()

  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '[---]')
  }

  return clean.trim().slice(0, maxLen)
}
