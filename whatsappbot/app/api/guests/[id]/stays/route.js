// app/api/guests/[id]/stays/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request, { params }) {
  const session = getSession()
  if (!session) {
    const { searchParams } = new URL(request.url)
    console.warn(JSON.stringify({ level:'warn', event:'auth_failure', route: new URL(request.url).pathname, hotelId: searchParams.get('hotelId') || null, ts: new Date().toISOString() }))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = getSupabase()
    const { data: stays } = await supabase
      .from('guest_stays')
      .select('*')
      .eq('guest_id', params.id)
      .order('check_in', { ascending: false })
      .limit(10)

    return Response.json({ stays: stays || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
