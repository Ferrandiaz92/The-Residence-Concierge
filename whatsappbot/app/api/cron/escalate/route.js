// app/api/cron/escalate/route.js
// ============================================================
// ESCALATION CHECKER — runs every 2 minutes via Vercel Cron
//
// Setup in vercel.json:
// {
//   "crons": [{ "path": "/api/cron/escalate", "schedule": "*/2 * * * *" }]
// }
//
// This checks all open tickets with overdue escalation timers
// and sends the next alert in the chain automatically.
// ============================================================

import { checkEscalations } from '../../../../src/lib/ticketing.js'

export async function GET(request) {
  // Verify this is called by Vercel Cron (not a random visitor)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronName = request.url.split('/api/cron/')[1]?.split('?')[0] || 'unknown'
  const runId    = Date.now()
  console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_start', ts: new Date().toISOString() }))
  try {
    await checkEscalations()
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Escalation check completed'
    })
  } catch (err) {
    console.error('Escalation check failed:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
