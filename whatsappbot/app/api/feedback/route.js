// app/api/feedback/route.js
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

    const { data: feedback } = await supabase
      .from('guest_feedback')
      .select(`*, guests(name, surname, room, check_in, check_out)`)
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Summary stats
    const all    = feedback || []
    const avg    = all.length > 0
      ? (all.reduce((s, f) => s + f.rating, 0) / all.length).toFixed(1)
      : null
    const dist   = { 5:0, 4:0, 3:0, 2:0, 1:0 }
    all.forEach(f => { if (dist[f.rating] !== undefined) dist[f.rating]++ })

    return Response.json({ feedback: all, stats: { avg, total: all.length, distribution: dist } })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
