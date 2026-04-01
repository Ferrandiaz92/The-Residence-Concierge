// app/api/status/route.js
// Health check + config validation — requires auth in production

import { cookies } from 'next/headers'

const REQUIRED = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
  'NEXT_PUBLIC_APP_URL', 'CRON_SECRET',
]
const OPTIONAL = [
  'RAPIDAPI_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'VAPID_PUBLIC_KEY', 'SENTRY_DSN',
]

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    try {
      const c = cookies().get('session')
      const session = c ? JSON.parse(c.value) : null
      if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const missing  = REQUIRED.filter(k => !process.env[k])
  const optional = OPTIONAL.filter(k => !process.env[k])
  const ok       = missing.length === 0

  return Response.json({
    status:      ok ? 'ok' : 'misconfigured',
    configValid: ok,
    timestamp:   new Date().toISOString(),
    version:     process.env.npm_package_version || '0.1.5',
    env:         process.env.NODE_ENV,
    ...(missing.length  > 0 && { missingRequired: missing }),
    ...(optional.length > 0 && { missingOptional: optional }),
  }, { status: ok ? 200 : 503 })
}
