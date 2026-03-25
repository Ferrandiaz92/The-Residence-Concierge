// app/api/guests/search/route.js
// Returns all guest types: stay, day_visitor, event, prospect
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')

    const cookieStore = cookies()
    const sessionCookie = cookieStore.get('session')
    if (!sessionCookie) return Response.json({ guests: [] })
    const session = JSON.parse(sessionCookie.value)

    if (!q || q.length < 2) return Response.json({ guests: [] })

    const supabase = getSupabase()

    // Search across ALL guest types — stay, day_visitor, event, prospect
    const { data: guests } = await supabase
      .from('guests')
      .select('id, name, surname, room, phone, language, check_in, check_out, guest_type, preferred_services, visit_count_day, last_visit_at')
      .eq('hotel_id', session.hotelId)
      .or(`room.ilike.%${q}%,surname.ilike.%${q}%,name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('last_visit_at', { ascending: false, nullsFirst: false })
      .limit(10)

    return Response.json({ guests: guests || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
