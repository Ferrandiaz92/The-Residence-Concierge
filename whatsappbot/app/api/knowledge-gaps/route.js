// app/api/knowledge-gaps/route.js
// GET  — list unresolved gaps for a hotel (sorted by times_seen)
// PATCH — mark a gap as resolved

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function GET(request) {
  const session = getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const hotelId = session.hotelId  // always from session — never URL
  const resolved = searchParams.get('resolved') === 'true'
  const limit    = parseInt(searchParams.get('limit') || '50')

  if (session.hotelId && session.hotelId !== hotelId) {
    return Response.json({ error: 'Access denied' }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('knowledge_gaps')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('resolved', resolved)
    .order('times_seen', { ascending: false })
    .order('last_seen_at',  { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ gaps: data || [] })
}

export async function PATCH(request) {
  const session = getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, resolved } = await request.json()
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('knowledge_gaps')
    .update({
      resolved:    resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ status: 'updated', gap: data })
}
