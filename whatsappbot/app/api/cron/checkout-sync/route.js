// app/api/cron/checkout-sync/route.js
// ============================================================
// Automatically transitions stay_status from 'active' → 'checked_out'
// for any guest whose check_out date has passed but reception
// forgot (or didn't bother) to click the checkout button.
//
// Without this, the bot keeps offering room service, housekeeping,
// and activity bookings to guests who left days ago.
//
// Run once per day — e.g. 01:00 UTC via cron-job.org:
//   GET https://your-domain.vercel.app/api/cron/checkout-sync
//   Authorization: Bearer YOUR_CRON_SECRET
//
// What it does:
//   1. Finds all guests with stay_status = 'active' or 'pre_arrival'
//      whose check_out date is in the past
//   2. Sets stay_status = 'checked_out'
//   3. Closes their open conversations
//   4. Logs how many were fixed
// ============================================================

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const today    = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

  // ── Find guests who should be checked out but aren't ─────────
  // check_out < today means their departure date has passed
  const { data: staleGuests, error } = await supabase
    .from('guests')
    .select('id, hotel_id, name, room, check_out, stay_status')
    .in('stay_status', ['active', 'pre_arrival'])
    .not('check_out', 'is', null)
    .lt('check_out', today)   // check_out is before today

  if (error) {
    console.error('checkout-sync: query error', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!staleGuests || staleGuests.length === 0) {
    console.log('checkout-sync: nothing to fix today')
    console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_done', ts: new Date().toISOString() }))
    return Response.json({ status: 'ok', fixed: 0, date: today })
  }

  console.log(`checkout-sync: fixing ${staleGuests.length} guests whose checkout was missed`)

  let fixed   = 0
  let failed  = 0
  const errors = []

  for (const guest of staleGuests) {
    const cronName = request.url.split('/api/cron/')[1]?.split('?')[0] || 'unknown'
  const runId    = Date.now()
  console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_start', ts: new Date().toISOString() }))
  try {
      // 1. Update stay_status
      await supabase
        .from('guests')
        .update({
          stay_status:    'checked_out',
          checked_out_at: guest.check_out + 'T12:00:00.000Z', // assume noon checkout
        })
        .eq('id', guest.id)

      // 2. Close any open conversations so they don't show as active
      await supabase
        .from('conversations')
        .update({ status: 'resolved' })
        .eq('guest_id', guest.id)
        .in('status', ['active', 'escalated'])

      fixed++
      console.log(
        `checkout-sync: fixed ${guest.name || 'Guest'} · Room ${guest.room || '?'} · ` +
        `was ${guest.stay_status} · checkout was ${guest.check_out}`
      )
    } catch (err) {
      failed++
      errors.push(`${guest.id}: ${err.message}`)
      console.error(`checkout-sync: failed to fix guest ${guest.id}:`, err.message)
    }
  }

  return Response.json({
    status: 'ok',
    date:   today,
    fixed,
    failed,
    errors: errors.length ? errors : undefined,
  })
}
