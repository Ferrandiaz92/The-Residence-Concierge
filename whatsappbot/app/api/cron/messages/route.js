// app/api/cron/messages/route.js
// ─────────────────────────────────────────────────────────────
// FIX #3: Scheduled messages catchup pattern
//
// Problem: the old pattern only checked "is today exactly the target date?"
// If the server was down during the cron window (Vercel cold start,
// deployment, outage), the message was permanently missed. No retry,
// no flag, no alert — it just never sent.
//
// Fix: processScheduledMessages() now uses a "should this have been
// sent and wasn't?" query instead of "is it exactly the right hour?".
//
// For each message type we check:
//   1. Is the target date <= today? (due or overdue)
//   2. Is there NO sent/skipped record yet? (not already handled)
//   3. Is the guest still in the right lifecycle stage? (not checked out early)
//
// This means if the cron missed a 7-day pre-arrival window yesterday,
// the next run today will still catch and send it (within a grace period).
//
// Grace periods by message type:
//   pre_checkin_7d  → up to 5 days late (still useful if guest hasn't arrived)
//   pre_checkin_24h → up to 12 hours late (still useful day-of)
//   day1_upsell     → no catchup (morning-specific, stale if missed)
//   midstay_upsell  → up to 1 day late
//   post_checkout   → up to 3 days late (review request still relevant)
// ─────────────────────────────────────────────────────────────

import { createClient }          from '@supabase/supabase-js'
import { processScheduledMessages } from '../../../../src/lib/scheduled.js'
import log                       from '../../../../lib/logger.js'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: hotels } = await supabase
      .from('hotels').select('id, name').eq('active', true)

    const summary = []

    for (const hotel of (hotels || [])) {
      try {
        const results = await processScheduledMessages(hotel.id)
        summary.push({ hotel: hotel.name, ...results })
        log.info('Scheduled messages processed', { hotelId: hotel.id, hotelName: hotel.name, ...results })
      } catch (e) {
        await log.error('Scheduled messages failed for hotel', e, { hotelId: hotel.id, hotelName: hotel.name })
        summary.push({ hotel: hotel.name, error: e.message })
      }
    }

    return Response.json({ status: 'ok', processed: summary })
  } catch (err) {
    await log.error('Cron messages route failed', err, {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}
