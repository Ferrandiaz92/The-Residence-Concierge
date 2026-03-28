// app/api/security/route.js
// ============================================================
// Security management — block list and abuse events
// Manager + supervisor only
// ============================================================

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

const ALLOWED = ['manager', 'admin', 'supervisor', 'receptionist']

// GET — abuse events queue + block list
export async function GET(request) {
  try {
    const session = getSession()
    if (!session || !ALLOWED.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId') || session.hotelId
    const supabase = getSupabase()

    const [{ data: events }, { data: blocked }] = await Promise.all([
      supabase
        .from('abuse_events')
        .select('*, guests(name, surname, room, stay_status)')
        .eq('hotel_id', hotelId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('blocked_phones')
        .select('*')
        .eq('hotel_id', hotelId)
        .is('unblocked_at', null)
        .order('created_at', { ascending: false }),
    ])

    return Response.json({ events: events || [], blocked: blocked || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// POST — manually block a phone
export async function POST(request) {
  try {
    const session = getSession()
    if (!session || !['manager','admin','supervisor'].includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { hotelId, phone, reason, notes } = await request.json()
    if (!hotelId || !phone) {
      return Response.json({ error: 'hotelId and phone required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Check if known guest
    const { data: guest } = await supabase
      .from('guests').select('id, stay_status')
      .eq('hotel_id', hotelId).eq('phone', phone).single()

    const { data } = await supabase
      .from('blocked_phones')
      .upsert({
        hotel_id:       hotelId,
        phone,
        reason:         reason || 'manual',
        severity:       'medium',
        is_known_guest: !!guest,
        blocked_by:     `staff:${session.name}`,
        notes:          notes || null,
        unblocked_at:   null,
      }, { onConflict: 'hotel_id,phone' })
      .select().single()

    return Response.json({ status: 'blocked', record: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — unblock a phone or mark abuse event reviewed
export async function PATCH(request) {
  try {
    const session = getSession()
    if (!session || !ALLOWED.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { action, hotelId, phone, eventId } = await request.json()
    const supabase = getSupabase()

    if (action === 'unblock' && phone) {
      await supabase
        .from('blocked_phones')
        .update({ unblocked_at: new Date().toISOString() })
        .eq('hotel_id', hotelId || session.hotelId)
        .eq('phone', phone)
      return Response.json({ status: 'unblocked' })
    }

    if (action === 'review' && eventId) {
      await supabase
        .from('abuse_events')
        .update({ reviewed: true })
        .eq('id', eventId)
      return Response.json({ status: 'reviewed' })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
