// lib/config.js
// ─────────────────────────────────────────────────────────────
// Centralised environment variable validation.
// Call validateConfig() at startup — throws if critical vars missing.
// Import getConfig() anywhere to access typed config values.
// ─────────────────────────────────────────────────────────────

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'ANTHROPIC_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_NUMBER',
  'NEXT_PUBLIC_APP_URL',
]

const RECOMMENDED = [
  { key: 'RAPIDAPI_KEY',          note: 'Flight lookup disabled without this' },
  { key: 'STRIPE_SECRET_KEY',     note: 'Payment links disabled without this' },
  { key: 'STRIPE_WEBHOOK_SECRET', note: 'Stripe webhook validation disabled' },
  { key: 'CRON_SECRET',           note: 'Cron jobs publicly callable without this' },
  { key: 'VAPID_PUBLIC_KEY',      note: 'Push notifications disabled' },
  { key: 'VAPID_PRIVATE_KEY',     note: 'Push notifications disabled' },
]

export function validateConfig() {
  const missing = REQUIRED.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  • ${k}`).join('\n')}\n` +
      `Add these to Vercel → Project Settings → Environment Variables`
    )
  }

  const warnings = RECOMMENDED.filter(({ key }) => !process.env[key])
  if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn(
      `[config] Optional env vars not set:\n${warnings.map(({ key, note }) => `  • ${key} — ${note}`).join('\n')}`
    )
  }
}

export function getConfig() {
  return {
    supabase: {
      url:        process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_KEY,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    twilio: {
      accountSid:      process.env.TWILIO_ACCOUNT_SID,
      authToken:       process.env.TWILIO_AUTH_TOKEN,
      whatsappNumber:  process.env.TWILIO_WHATSAPP_NUMBER,
    },
    stripe: {
      secretKey:     process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    },
    rapidapi: {
      key: process.env.RAPIDAPI_KEY,
    },
    app: {
      url:        process.env.NEXT_PUBLIC_APP_URL,
      baseUrl:    process.env.NEXT_PUBLIC_BASE_URL,
      cronSecret: process.env.CRON_SECRET,
    },
    vapid: {
      publicKey:  process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    },
  }
}
