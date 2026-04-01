// app/api/cron/partner-retries/route.js
// ─────────────────────────────────────────────────────────────
// FIX #1: Partner alert retry cron
//
// Runs every 5 minutes. Picks up any failed partner WhatsApp alerts
// and retries them with exponential backoff (2min → 10min → 30min).
// After 3 failures, reception is notified to contact the partner manually.
//
// Add to vercel.json crons:
//   { "path": "/api/cron/partner-retries", "schedule": "*/5 * * * *" }
// ─────────────────────────────────────────────────────────────

import { processPendingRetries } from '../../../../src/lib/partner-retries.js'
import log from '../../../../lib/logger.js'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronName = request.url.split('/api/cron/')[1]?.split('?')[0] || 'unknown'
  const runId    = Date.now()
  console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_start', ts: new Date().toISOString() }))
  try {
    const results = await processPendingRetries()
    log.info('Partner retry cron complete', results)
    console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_done', ts: new Date().toISOString() }))
    return Response.json({ status: 'ok', ...results })
  } catch (err) {
    await log.error('Partner retry cron failed', err, {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}
