// app/api/cron/update-local-guide/route.js
// ============================================================
// Weekly auto-update of local guide items via Google Places API.
// Updates: google_rating, review_count, business_status.
// Only runs for items that have a google_place_id set.
//
// Requires: GOOGLE_PLACES_API_KEY in Vercel env vars.
// Schedule in vercel.json: "0 3 * * 0" (Sunday 03:00)
// ============================================================

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

export async function GET(request) {
  const runId = Date.now()
  console.log(JSON.stringify({ level:'info', cron:'update-local-guide', runId, event:'cron_start', ts: new Date().toISOString() }))

  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('GOOGLE_PLACES_API_KEY not set — local guide auto-update skipped')
    return Response.json({ status: 'skipped', reason: 'GOOGLE_PLACES_API_KEY not configured' })
  }

  const supabase = getSupabase()

  // Get all items with a google_place_id
  const { data: items, error } = await supabase
    .from('local_guide_items')
    .select('id, name, google_place_id')
    .not('google_place_id', 'is', null)
    .eq('active', true)

  if (error || !items?.length) {
    return Response.json({ status: 'ok', updated: 0 })
  }

  let updated = 0, failed = 0

  for (const item of items) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${encodeURIComponent(item.google_place_id)}` +
        `&fields=rating,user_ratings_total,business_status,opening_hours` +
        `&key=${apiKey}`

      const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
      const data = await res.json()

      if (data.status !== 'OK' || !data.result) { failed++; continue }

      const r = data.result
      const updates = {
        last_auto_updated: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }

      if (r.rating !== undefined)              updates.google_rating  = r.rating
      if (r.user_ratings_total !== undefined)  updates.review_count   = r.user_ratings_total
      if (r.business_status === 'CLOSED_PERMANENTLY') updates.active = false
      if (r.opening_hours?.weekday_text) {
        // Convert Google's opening hours to our jsonb format
        const days = ['sun','mon','tue','wed','thu','fri','sat']
        const hours = {}
        r.opening_hours.weekday_text.forEach((text, i) => {
          hours[days[(i + 1) % 7]] = text.split(': ')[1] || 'Closed'
        })
        updates.opening_hours = hours
      }

      await supabase.from('local_guide_items').update(updates).eq('id', item.id)
      updated++

      // Small delay to respect API rate limits
      await new Promise(r => setTimeout(r, 200))

    } catch (e) {
      console.warn(`Failed to update ${item.name}:`, e.message)
      failed++
    }
  }

  console.log(JSON.stringify({ level:'info', cron:'update-local-guide', runId, event:'cron_done', updated, failed, ts: new Date().toISOString() }))
  return Response.json({ status: 'ok', updated, failed, total: items.length })
}
