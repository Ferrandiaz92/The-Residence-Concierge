// app/api/conversations/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
    const convId  = searchParams.get('convId') // optional — fetch single conv
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()

    // Single conversation refresh (used after sending a reply)
    if (convId) {
      const { data } = await supabase
        .from('conversations')
        .select(`
          id, status, last_message_at, messages,
          guests(id, name, surname, room, phone, language, guest_type, visit_count_day, preferred_services, check_in, check_out)
        `)
        .eq('id', convId)
        .single()
      return Response.json({ conversation: data })
    }

    // All active + escalated conversations for hotel
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, status, last_message_at, messages,
        guests(id, name, surname, room, phone, language, guest_type, visit_count_day, preferred_services, check_in, check_out, visit_count, favourite_services)
      `)
      .eq('hotel_id', hotelId)
      .in('status', ['active', 'escalated'])
      .order('last_message_at', { ascending: false })
      .limit(50)

    return Response.json({ conversations: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
