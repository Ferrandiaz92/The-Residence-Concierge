// app/api/push/digest/route.js
// Called by Vercel cron at 09:00 every morning (per hotel timezone)
// Sends planned-priority tasks as a grouped notification to each dept
//
// Vercel cron config in vercel.json:
// { "crons": [{ "path": "/api/push/digest", "schedule": "0 7 * * *" }] }
// (7 UTC = 9am Cyprus time)

import { createClient }     from '@supabase/supabase-js'
import { sendPlannedDigest } from '../../../../src/lib/push.js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

const DEPT_ROLES = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk']

export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Verify it's from Vercel cron or an internal call
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabase()

    // Get all hotels with active push subscriptions
    const { data: hotels } = await supabase
      .from('push_subscriptions')
      .select('hotel_id')
      .then(r => ({
        data: [...new Set((r.data || []).map(s => s.hotel_id))].map(id => ({ id }))
      }))

    if (!hotels || hotels.length === 0) {
      return Response.json({ status: 'no hotels with subscriptions' })
    }

    const today     = new Date().toISOString().split('T')[0]
    const results   = []

    for (const hotel of hotels) {
      // Check we haven't already sent a digest today for this hotel
      const { data: alreadySent } = await supabase
        .from('push_digest_log')
        .select('id')
        .eq('hotel_id', hotel.id)
        .gte('sent_at', `${today}T00:00:00Z`)
        .limit(1)
        .single()

      if (alreadySent) continue

      // Get all planned tickets not yet resolved
      const { data: tickets } = await supabase
        .from('internal_tickets')
        .select('id, department, category, description, room, priority, guest_id')
        .eq('hotel_id', hotel.id)
        .eq('priority', 'planned')
        .not('status', 'in', '(resolved,cancelled)')
        .order('created_at', { ascending: true })

      if (!tickets || tickets.length === 0) continue

      // Group by department and send one digest per dept
      const byDept = {}
      tickets.forEach(t => {
        if (!byDept[t.department]) byDept[t.department] = []
        byDept[t.department].push(t)
      })

      for (const [dept, deptTickets] of Object.entries(byDept)) {
        if (!DEPT_ROLES.includes(dept)) continue
        const result = await sendPlannedDigest({
          hotelId:    hotel.id,
          department: dept,
          tickets:    deptTickets,
        })
        results.push({ hotel: hotel.id, dept, ...result })
      }
    }

    return Response.json({ status: 'ok', results })
  } catch (err) {
    console.error('Digest cron error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
