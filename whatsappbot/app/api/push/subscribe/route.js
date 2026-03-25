// app/api/push/subscribe/route.js
// Saves or updates a Web Push subscription for the logged-in staff member

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

function getSession() {
  try {
    const c = cookies().get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

// POST — register or update a push subscription
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { subscription } = await request.json()
    if (!subscription?.endpoint) {
      return Response.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    const supabase   = getSupabase()
    const userAgent  = request.headers.get('user-agent') || ''

    // Upsert — if this endpoint already exists for this staff member, update it
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        staff_id:     session.staffId,
        hotel_id:     session.hotelId,
        role:         session.role,
        department:   getDepartment(session.role),
        subscription: subscription,
        user_agent:   userAgent,
        updated_at:   new Date().toISOString(),
      }, {
        onConflict: 'staff_id, subscription->endpoint',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error('Push subscribe error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ status: 'subscribed' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — unsubscribe (e.g. on logout)
export async function DELETE(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { endpoint } = await request.json().catch(() => ({}))
    const supabase = getSupabase()

    let query = supabase
      .from('push_subscriptions')
      .delete()
      .eq('staff_id', session.staffId)

    if (endpoint) {
      query = query.eq('subscription->>endpoint', endpoint)
    }

    await query
    return Response.json({ status: 'unsubscribed' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// Map role → department key for dept staff
function getDepartment(role) {
  const DEPT_ROLES = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk']
  return DEPT_ROLES.includes(role) ? role : null
}
