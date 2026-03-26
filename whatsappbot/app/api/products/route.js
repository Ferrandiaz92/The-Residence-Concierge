// app/api/products/route.js
// CRUD for partner products (experiences, events, etc.)
// Manager/Admin only for write operations

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth:{ persistSession:false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

// GET — list products for a hotel
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId   = searchParams.get('hotelId')
    const activeOnly= searchParams.get('active') !== 'false'
    if (!hotelId) return Response.json({ products:[] })

    const supabase = getSupabase()
    const today    = new Date().toISOString().split('T')[0]

    let query = supabase
      .from('partner_products')
      .select('*, partners(id,name,type,phone,commission_rate)')
      .eq('hotel_id', hotelId)
      .order('sort_order').order('created_at')

    if (activeOnly) query = query.eq('active', true)

    const { data, error } = await query
    if (error) return Response.json({ error:error.message }, { status:500 })
    return Response.json({ products: data || [] })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}

// POST — create product
export async function POST(request) {
  try {
    const session = getSession()
    if (!['manager','admin'].includes(session?.role)) return Response.json({ error:'Forbidden' }, { status:403 })

    const { hotelId, partnerId, name, description, category, tiers, commissionRate, availableFrom, availableTo, availableTimes, maxPerGuest } = await request.json()
    if (!hotelId || !partnerId || !name || !tiers?.length) return Response.json({ error:'Missing required fields' }, { status:400 })

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('partner_products')
      .insert({
        hotel_id:        hotelId,
        partner_id:      partnerId,
        name,
        description:     description || null,
        category:        category || 'other',
        tiers,
        commission_rate: commissionRate || 15,
        available_from:  availableFrom || null,
        available_to:    availableTo   || null,
        available_times: availableTimes || null,
        max_per_guest:   maxPerGuest || 10,
        active:          true,
      })
      .select().single()
    if (error) return Response.json({ error:error.message }, { status:500 })
    return Response.json({ status:'created', product:data })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}

// PATCH — update product
export async function PATCH(request) {
  try {
    const session = getSession()
    if (!['manager','admin'].includes(session?.role)) return Response.json({ error:'Forbidden' }, { status:403 })

    const { id, ...updates } = await request.json()
    if (!id) return Response.json({ error:'Missing id' }, { status:400 })

    // Map camelCase to snake_case
    const mapped = {}
    if (updates.name          !== undefined) mapped.name           = updates.name
    if (updates.description   !== undefined) mapped.description    = updates.description
    if (updates.category      !== undefined) mapped.category       = updates.category
    if (updates.tiers         !== undefined) mapped.tiers          = updates.tiers
    if (updates.commissionRate!== undefined) mapped.commission_rate= updates.commissionRate
    if (updates.availableFrom !== undefined) mapped.available_from = updates.availableFrom
    if (updates.availableTo   !== undefined) mapped.available_to   = updates.availableTo
    if (updates.availableTimes!== undefined) mapped.available_times= updates.availableTimes
    if (updates.maxPerGuest   !== undefined) mapped.max_per_guest  = updates.maxPerGuest
    if (updates.active        !== undefined) mapped.active         = updates.active
    if (updates.sortOrder     !== undefined) mapped.sort_order     = updates.sortOrder

    const supabase = getSupabase()
    const { data, error } = await supabase.from('partner_products').update(mapped).eq('id', id).select().single()
    if (error) return Response.json({ error:error.message }, { status:500 })
    return Response.json({ status:'updated', product:data })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}

// DELETE — deactivate product
export async function DELETE(request) {
  try {
    const session = getSession()
    if (!['manager','admin'].includes(session?.role)) return Response.json({ error:'Forbidden' }, { status:403 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error:'Missing id' }, { status:400 })
    const supabase = getSupabase()
    await supabase.from('partner_products').update({ active:false }).eq('id', id)
    return Response.json({ status:'deactivated' })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}
