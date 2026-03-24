// app/api/config/route.js
// Returns partner types and departments for the hotel
// Used by staff portal and settings tab

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()
    const [typesRes, deptsRes] = await Promise.all([
      supabase.from('partner_types').select('*').eq('hotel_id', hotelId).eq('active', true).order('sort_order'),
      supabase.from('departments').select('*').eq('hotel_id', hotelId).eq('active', true).order('sort_order'),
    ])

    return Response.json({
      partnerTypes: typesRes.data || [],
      departments:  deptsRes.data || [],
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { hotelId, type, item } = await request.json()
    // type = 'partner_type' | 'department'
    const supabase = getSupabase()
    const table = type === 'partner_type' ? 'partner_types' : 'departments'
    const { data, error } = await supabase
      .from(table)
      .insert({ hotel_id: hotelId, ...item })
      .select().single()
    if (error) throw error
    return Response.json({ status: 'created', item: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { type, id, updates } = await request.json()
    const supabase = getSupabase()
    const table = type === 'partner_type' ? 'partner_types' : 'departments'
    const { data, error } = await supabase
      .from(table).update(updates).eq('id', id).select().single()
    if (error) throw error
    return Response.json({ status: 'updated', item: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id   = searchParams.get('id')
    const supabase = getSupabase()
    const table = type === 'partner_type' ? 'partner_types' : 'departments'
    await supabase.from(table).update({ active: false }).eq('id', id)
    return Response.json({ status: 'deactivated' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
