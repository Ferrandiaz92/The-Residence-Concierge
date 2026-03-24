// app/api/notifications/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

function getSession() {
  try {
    const cookieStore = cookies()
    const c = cookieStore.get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ notifications: [] })
    const supabase = getSupabase()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('hotel_id', session.hotelId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20)
    return Response.json({ notifications: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { id, markAllRead } = await request.json()
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = getSupabase()
    if (markAllRead) {
      await supabase.from('notifications').update({ read: true }).eq('hotel_id', session.hotelId)
    } else if (id) {
      await supabase.from('notifications').update({ read: true }).eq('id', id)
    }
    return Response.json({ status: 'ok' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
