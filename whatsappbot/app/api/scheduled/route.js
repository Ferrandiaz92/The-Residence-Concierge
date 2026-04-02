// app/api/scheduled/route.js
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

export async function GET(request) {
  const session = getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = session.hotelId || searchParams.get('hotelId')
    if (session.hotelId && hotelId !== session.hotelId) return Response.json({ error: 'Access denied' }, { status: 403 })
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()

    // Load guests with their scheduled message statuses
    const { data: guests } = await supabase
      .from('guests')
      .select('id, name, surname, room, phone, language, check_in, check_out')
      .eq('hotel_id', hotelId)
      .not('check_in', 'is', null)
      .order('check_in', { ascending: false })
      .limit(50)

    const { data: messages } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('hotel_id', hotelId)

    // Group messages by guest
    const msgsByGuest = {}
    ;(messages || []).forEach(m => {
      if (!msgsByGuest[m.guest_id]) msgsByGuest[m.guest_id] = []
      msgsByGuest[m.guest_id].push(m)
    })

    const result = (guests || []).map(g => {
      const checkin  = new Date(g.check_in)
      const checkout = g.check_out ? new Date(g.check_out) : null
      const stayNights = checkout
        ? Math.round((checkout - checkin) / (1000 * 60 * 60 * 24))
        : null

      return {
        guest:      g,
        stayNights,
        messages:   msgsByGuest[g.id] || [],
      }
    })

    return Response.json({ guests: result })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// POST — manually trigger a specific message type for a guest
export async function POST(request) {
  try {
    const { hotelId, guestId, messageType } = await request.json()
  if (hotelId && session.hotelId && hotelId !== session.hotelId) return Response.json({ error: 'Access denied' }, { status: 403 })
    const supabase = getSupabase()

    // Reset status to pending so it gets picked up by next cron run
    await supabase.from('scheduled_messages').upsert({
      hotel_id: hotelId, guest_id: guestId,
      message_type: messageType, status: 'pending',
    }, { onConflict: 'guest_id,message_type' })

    return Response.json({ status: 'queued' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
