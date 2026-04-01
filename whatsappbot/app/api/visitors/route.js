// app/api/visitors/route.js (updated — includes prospects)
import { createClient } from '@supabase/supabase-js'
import { checkCsrf } from '../../../lib/csrf.js'
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
    const hotelId = searchParams.get('hotelId')
    const type    = searchParams.get('type') || 'all'
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()

    // Which types to fetch
    const types = type === 'all'
      ? ['day_visitor', 'event', 'prospect']
      : type === 'non_prospect'
        ? ['day_visitor', 'event']
        : [type]

    const { data: visitors } = await supabase
      .from('guests')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('guest_type', types)
      .order('visit_count_day', { ascending: false })
      .order('last_visit_at',   { ascending: false, nullsFirst: false })
      .order('first_contact_at',{ ascending: false, nullsFirst: false })

    // For prospects — load last message snippet from conversations
    const prospectIds = (visitors||[])
      .filter(v => v.guest_type === 'prospect')
      .map(v => v.id)

    let prospectConvs = []
    if (prospectIds.length > 0) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('guest_id, messages, last_message_at')
        .in('guest_id', prospectIds)
        .order('last_message_at', { ascending: false })

      // Get most recent conv per guest
      const seen = new Set()
      prospectConvs = (convs || []).filter(c => {
        if (seen.has(c.guest_id)) return false
        seen.add(c.guest_id)
        return true
      })
    }

    const convByGuest = {}
    prospectConvs.forEach(c => { convByGuest[c.guest_id] = c })

    // Service usage stats
    const { data: serviceStats } = await supabase
      .from('visitor_visits')
      .select('service_type, service_name')
      .eq('hotel_id', hotelId)

    const serviceCounts = {}
    ;(serviceStats || []).forEach(v => {
      const key = v.service_name || v.service_type
      serviceCounts[key] = (serviceCounts[key] || 0) + 1
    })

    // Visit frequency by day
    const { data: visitsByDay } = await supabase
      .from('visitor_visits')
      .select('visited_at')
      .eq('hotel_id', hotelId)
      .gte('visited_at', new Date(Date.now() - 90*24*60*60*1000).toISOString())

    const dayCount = [0,0,0,0,0,0,0]
    ;(visitsByDay||[]).forEach(v => {
      const day = new Date(v.visited_at).getDay()
      dayCount[day === 0 ? 6 : day - 1]++
    })

    // Status breakdown for day visitors
    const now = new Date()
    const statusCounts = { active:0, regular:0, fading:0, inactive:0, new:0 }
    ;(visitors||[]).filter(v => v.guest_type !== 'prospect').forEach(v => {
      if (!v.last_visit_at) { statusCounts.new++; return }
      const days = Math.floor((now - new Date(v.last_visit_at)) / (1000*60*60*24))
      if (days <= 7) statusCounts.active++
      else if (days <= 21) statusCounts.regular++
      else if (days <= 42) statusCounts.fading++
      else statusCounts.inactive++
    })

    // Prospect pipeline counts
    const prospectCounts = { new:0, followed_up:0, converted:0, lost:0 }
    ;(visitors||[]).filter(v => v.guest_type === 'prospect').forEach(v => {
      const s = v.prospect_status || 'new'
      if (prospectCounts[s] !== undefined) prospectCounts[s]++
    })

    // Month visits
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const { data: monthVisits } = await supabase
      .from('visitor_visits')
      .select('id')
      .eq('hotel_id', hotelId)
      .gte('visited_at', monthStart.toISOString())

    // Attach conv data to prospects
    const enriched = (visitors||[]).map(v => {
      if (v.guest_type !== 'prospect') return v
      const conv = convByGuest[v.id]
      if (!conv) return v
      const msgs = conv.messages || []
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
      return {
        ...v,
        last_message_at: conv.last_message_at,
        last_message_snippet: lastUserMsg?.content?.slice(0, 80) || null,
        message_count: msgs.length,
      }
    })

    return Response.json({
      visitors: enriched,
      stats: {
        total:          (visitors||[]).filter(v => v.guest_type !== 'prospect').length,
        totalProspects: (visitors||[]).filter(v => v.guest_type === 'prospect').length,
        totalVisits:    (visitors||[]).reduce((s,v) => s + (v.visit_count_day||0), 0),
        monthVisits:    monthVisits?.length || 0,
        statusCounts,
        prospectCounts,
        topServices: Object.entries(serviceCounts)
          .sort((a,b) => b[1]-a[1]).slice(0,8)
          .map(([name,count]) => ({ name, count })),
        visitsByDay: dayCount,
      }
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const { hotelId, name, surname, phone, language, guestType, preferredServices, notes } = await request.json()
    if (!hotelId || !name || !phone) return Response.json({ error: 'hotelId, name and phone required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: existing } = await supabase.from('guests').select('*').eq('phone', phone).eq('hotel_id', hotelId).single()

    if (existing) {
      const { data } = await supabase.from('guests')
        .update({ name, surname, guest_type: guestType||'day_visitor', preferred_services: preferredServices, notes, language })
        .eq('id', existing.id).select().single()
      return Response.json({ status: 'updated', visitor: data })
    }

    const { data, error } = await supabase.from('guests').insert({
      hotel_id: hotelId, name, surname, phone,
      language: language||'en',
      guest_type: guestType||'day_visitor',
      preferred_services: preferredServices||[],
      notes,
      visit_count_day: 0,
    }).select().single()

    if (error) throw error
    return Response.json({ status: 'created', visitor: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const { id, logVisit, serviceType, serviceName, hotelId, ...updates } = await request.json()
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()

    if (logVisit) {
      await supabase.from('visitor_visits').insert({
        hotel_id: hotelId, guest_id: id,
        service_type: serviceType||'other', service_name: serviceName,
      })
      const { data: guest } = await supabase.from('guests').select('visit_count_day, preferred_services').eq('id', id).single()
      const current = guest?.preferred_services || []
      if (serviceType && !current.includes(serviceType)) current.push(serviceType)
      await supabase.from('guests').update({
        last_visit_at:      new Date().toISOString().split('T')[0],
        visit_count_day:    (guest?.visit_count_day||0) + 1,
        preferred_services: current,
      }).eq('id', id)
      return Response.json({ status: 'visit_logged' })
    }

    const { data, error } = await supabase.from('guests').update(updates).eq('id', id).select().single()
    if (error) throw error
    return Response.json({ status: 'updated', visitor: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
