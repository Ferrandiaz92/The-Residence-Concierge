// app/api/visitors/route.js
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// GET — visitor list + analytics
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    const type    = searchParams.get('type') || 'all' // all | day_visitor | event
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()

    // Visitors list
    let query = supabase
      .from('guests')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('guest_type', type === 'all' ? ['day_visitor','event'] : [type])
      .order('visit_count_day', { ascending: false })
      .order('last_visit_at', { ascending: false, nullsFirst: false })

    const { data: visitors } = await query

    // Service usage stats from visitor_visits
    const { data: serviceStats } = await supabase
      .from('visitor_visits')
      .select('service_type, service_name')
      .eq('hotel_id', hotelId)

    const serviceCounts = {}
    ;(serviceStats || []).forEach(v => {
      const key = v.service_name || v.service_type
      serviceCounts[key] = (serviceCounts[key] || 0) + 1
    })

    // Visit frequency by day of week
    const { data: visitsByDay } = await supabase
      .from('visitor_visits')
      .select('visited_at')
      .eq('hotel_id', hotelId)
      .gte('visited_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

    const dayCount = [0,0,0,0,0,0,0] // Mon-Sun
    ;(visitsByDay || []).forEach(v => {
      const day = new Date(v.visited_at).getDay()
      dayCount[day === 0 ? 6 : day - 1]++
    })

    // Status breakdown
    const now = new Date()
    const statusCounts = { active: 0, regular: 0, fading: 0, inactive: 0, new: 0 }
    ;(visitors || []).forEach(v => {
      if (!v.last_visit_at) { statusCounts.new++; return }
      const days = Math.floor((now - new Date(v.last_visit_at)) / (1000 * 60 * 60 * 24))
      if (days <= 7) statusCounts.active++
      else if (days <= 21) statusCounts.regular++
      else if (days <= 42) statusCounts.fading++
      else statusCounts.inactive++
    })

    // Total visits this month
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const { data: monthVisits } = await supabase
      .from('visitor_visits')
      .select('id')
      .eq('hotel_id', hotelId)
      .gte('visited_at', monthStart.toISOString())

    return Response.json({
      visitors: visitors || [],
      stats: {
        total:       (visitors || []).length,
        totalVisits: (visitors || []).reduce((s,v) => s + (v.visit_count_day||0), 0),
        monthVisits: monthVisits?.length || 0,
        statusCounts,
        topServices: Object.entries(serviceCounts)
          .sort((a,b) => b[1]-a[1])
          .slice(0,8)
          .map(([name, count]) => ({ name, count })),
        visitsByDay: dayCount,
      }
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// POST — create day visitor
export async function POST(request) {
  try {
    const { hotelId, name, surname, phone, language, guestType, preferredServices, notes } = await request.json()
    if (!hotelId || !name || !phone) {
      return Response.json({ error: 'hotelId, name and phone required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Check if phone already exists
    const { data: existing } = await supabase
      .from('guests').select('*').eq('phone', phone).eq('hotel_id', hotelId).single()

    if (existing) {
      // Update to day visitor if they exist
      const { data } = await supabase
        .from('guests')
        .update({ name, surname, guest_type: guestType || 'day_visitor', preferred_services: preferredServices, notes, language })
        .eq('id', existing.id)
        .select().single()
      return Response.json({ status: 'updated', visitor: data })
    }

    const { data, error } = await supabase
      .from('guests')
      .insert({
        hotel_id:           hotelId,
        name, surname, phone,
        language:           language || 'en',
        guest_type:         guestType || 'day_visitor',
        preferred_services: preferredServices || [],
        notes,
        visit_count_day:    0,
      })
      .select().single()

    if (error) throw error
    return Response.json({ status: 'created', visitor: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update visitor + log a visit
export async function PATCH(request) {
  try {
    const { id, logVisit, serviceType, serviceName, ...updates } = await request.json()
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()

    if (logVisit) {
      // Log a visit
      await supabase.from('visitor_visits').insert({
        hotel_id:     updates.hotelId,
        guest_id:     id,
        service_type: serviceType || 'other',
        service_name: serviceName,
      })
      // Update last_visit_at and visit count
      const { data: guest } = await supabase.from('guests').select('visit_count_day, preferred_services').eq('id', id).single()
      const current = guest?.preferred_services || []
      if (serviceType && !current.includes(serviceType)) current.push(serviceType)
      await supabase.from('guests').update({
        last_visit_at:      new Date().toISOString().split('T')[0],
        visit_count_day:    (guest?.visit_count_day || 0) + 1,
        preferred_services: current,
      }).eq('id', id)
      return Response.json({ status: 'visit_logged' })
    }

    const { data, error } = await supabase
      .from('guests').update(updates).eq('id', id).select().single()
    if (error) throw error
    return Response.json({ status: 'updated', visitor: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
