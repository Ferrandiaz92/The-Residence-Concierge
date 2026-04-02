// app/api/facilities/route.js
// CRUD for facilities + facility booking management
// GET    /api/facilities?hotelId=  → list facilities
// POST   /api/facilities           → create facility (manager only)
// PATCH  /api/facilities           → update facility (manager only)
// DELETE /api/facilities?id=       → deactivate (manager only)

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import { checkCsrf }    from '../../../lib/csrf.js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

const CAN_READ  = ['manager', 'receptionist', 'supervisor', 'communications', 'concierge']
const CAN_WRITE = ['manager']

export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_READ.includes(session.role)) return Response.json({ error: 'Access denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const hotelId = session.hotelId  // always from session — never URL
    const supabase = getSupabase()

    const { data } = await supabase
      .from('facilities')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('active', true)
      .order('department').order('name')

    return Response.json({ facilities: data || [] })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

export async function POST(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) return Response.json({ error: 'Access denied' }, { status: 403 })

    const body = await request.json()
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('facilities')
      .insert({ hotel_id: session.hotelId, active: true, ...body })
      .select().single()
    if (error) throw error
    return Response.json({ status: 'created', facility: data })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

export async function PATCH(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) return Response.json({ error: 'Access denied' }, { status: 403 })

    const { id, ...updates } = await request.json()
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('facilities').update(updates).eq('id', id).select().single()
    if (error) throw error
    return Response.json({ status: 'updated', facility: data })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

export async function DELETE(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_WRITE.includes(session.role)) return Response.json({ error: 'Access denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const supabase = getSupabase()
    await supabase.from('facilities').update({ active: false }).eq('id', id)
    return Response.json({ status: 'deactivated' })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}
