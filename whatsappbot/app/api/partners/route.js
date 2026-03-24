// app/api/partners/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

function getSession() {
  try {
    const c = cookies().get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

// GET — list all partners
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })
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
    if (!['manager','admin'].includes(session?.role)) {
      return Response.json({ error: 'Manager access required' }, { status: 403 })
    }
    const body = await request.json()
    const { hotelId, name, type, phone, commission_rate, details } = body
    if (!hotelId || !name || !type || !phone) {
      return Response.json({ error: 'hotelId, name, type and phone required' }, { status: 400 })
    }
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('partners')
      .insert({ hotel_id: hotelId, name, type, phone, commission_rate: commission_rate || 10, details: details || {} })
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
    if (!['manager','admin'].includes(session?.role)) {
      return Response.json({ error: 'Manager access required' }, { status: 403 })
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

// DELETE — deactivate partner (soft delete)
export async function DELETE(request) {
  try {
    const session = getSession()
    if (!['manager','admin'].includes(session?.role)) {
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
