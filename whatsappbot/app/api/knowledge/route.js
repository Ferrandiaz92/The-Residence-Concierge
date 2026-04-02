// app/api/knowledge/route.js
// Role guards:
//   GET    → manager | communications | supervisor (read)
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

const CAN_READ  = ['manager', 'admin', 'communications', 'supervisor']
const CAN_WRITE = ['manager', 'admin', 'communications']
const CAN_DELETE = ['manager', 'admin']

// GET — list all entries
export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_READ.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId  = searchParams.get('hotelId')
    const category = searchParams.get('category')
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()
    let query = supabase
      .from('knowledge_base').select('*').eq('hotel_id', hotelId)
      .order('category').order('sort_order')
    if (category) query = query.eq('category', category)

    const { data } = await query
    return Response.json({ entries: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// POST — create entry
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { hotelId, category, question, answer } = await request.json()
  if (hotelId && session.hotelId && hotelId !== session.hotelId) return Response.json({ error: 'Access denied' }, { status: 403 })
    if (!hotelId || !category || !question || !answer) {
      return Response.json({ error: 'hotelId, category, question and answer required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({ hotel_id: hotelId, category, question, answer, created_by: `${session.role}:${session.name}` })
      .select().single()
    if (error) throw error
    return Response.json({ status: 'created', entry: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update entry
export async function PATCH(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { id, ...updates } = await request.json()
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })
    updates.updated_at = new Date().toISOString()
    updates.updated_by = `${session.role}:${session.name}`

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('knowledge_base').update(updates).eq('id', id).select().single()
    if (error) throw error
    return Response.json({ status: 'updated', entry: data })
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
    await supabase.from('knowledge_base').delete().eq('id', id)
    return Response.json({ status: 'deleted' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
