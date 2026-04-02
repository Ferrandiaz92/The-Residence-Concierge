// app/api/partners/route.js
// Role guards:
//   GET    → manager | communications | receptionist (read)
//   POST   → manager | communications
//   PATCH  → manager | communications
//   DELETE → manager only

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

const CAN_READ   = ['manager', 'admin', 'communications', 'receptionist', 'supervisor']
const CAN_WRITE  = ['manager', 'admin', 'communications']
const CAN_DELETE = ['manager', 'admin']

// GET — list all partners
export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_READ.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId = session.hotelId  // always from session
    if (!hotelId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabase()
    const { data } = await supabase
      .from('partners').select('*').eq('hotel_id', hotelId).order('type').order('name')
    return Response.json({ partners: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// POST — create partner
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { hotelId, name, type, phone, commission_rate, details, contact_name } = await request.json()
  if (hotelId && session.hotelId && hotelId !== session.hotelId) return Response.json({ error: 'Access denied' }, { status: 403 })
    if (!hotelId || !name || !type || !phone) {
      return Response.json({ error: 'hotelId, name, type and phone required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('partners')
      .insert({
        hotel_id: hotelId, name, type, phone,
        commission_rate: commission_rate || 10,
        contact_name: contact_name || null,
        details: details || {},
      })
      .select().single()
    if (error) throw error
    return Response.json({ status: 'created', partner: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update partner
export async function PATCH(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { id, ...updates } = await request.json()
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('partners').update(updates).eq('id', id).select().single()
    if (error) throw error
    return Response.json({ status: 'updated', partner: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — manager only
export async function DELETE(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_DELETE.includes(session.role)) {
      return Response.json({ error: 'Manager access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()
    await supabase.from('partners').update({ active: false }).eq('id', id)
    return Response.json({ status: 'deactivated' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

