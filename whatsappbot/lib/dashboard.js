// lib/dashboard.js
// All data fetching functions for the admin dashboard

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── SEARCH GUESTS ─────────────────────────────────────────────
export async function searchGuests(hotelId, query) {
  const supabase = getSupabase()
  if (!query || query.length < 2) return []
  const { data } = await supabase
    .from('guests')
    .select('id, name, surname, room, phone, language, check_in, check_out')
    .eq('hotel_id', hotelId)
    .or(`room.ilike.%${query}%,surname.ilike.%${query}%,name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10)
  return data || []
}

// ── CONVERSATIONS ─────────────────────────────────────────────
export async function getActiveConversations(hotelId) {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('conversations')
    .select(`
      id, status, last_message_at, messages,
      guests(id, name, surname, room, phone, language)
    `)
    .eq('hotel_id', hotelId)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false })
    .limit(30)
  return data || []
}

// ── GUEST PROFILE ─────────────────────────────────────────────
export async function getGuestProfile(guestId) {
  const supabase = getSupabase()
  const { data: guest } = await supabase
    .from('guests')
    .select('*')
    .eq('id', guestId)
    .single()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, messages, created_at, status')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: true })

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`*, partners(name, type)`)
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })

  return { guest, conversations: conversations || [], bookings: bookings || [] }
}

// ── BOOKINGS ──────────────────────────────────────────────────
export async function getRecentBookings(hotelId, limit = 30) {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('bookings')
    .select(`
      id, type, status, commission_amount, created_at, confirmed_at, details,
      guests(name, surname, room),
      partners(name, type)
    `)
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// ── TICKETS ───────────────────────────────────────────────────
export async function getOpenTickets(hotelId) {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('internal_tickets')
    .select(`*, guests(name, surname, room)`)
    .eq('hotel_id', hotelId)
    .not('status', 'in', '("resolved","cancelled")')
    .order('created_at', { ascending: true })
  return data || []
}

// ── MANAGER STATS ─────────────────────────────────────────────
export async function getManagerStats(hotelId) {
  const supabase = getSupabase()
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0,0,0,0)

  const { data: commissions } = await supabase
    .from('commissions')
    .select('amount, status, created_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', monthStart.toISOString())

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, type, status, created_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', monthStart.toISOString())

  const { data: tickets } = await supabase
    .from('internal_tickets')
    .select('id, status, department, created_at, resolved_at, accepted_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', monthStart.toISOString())

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, created_at, messages')
    .eq('hotel_id', hotelId)
    .gte('created_at', monthStart.toISOString())

  const totalCommission = commissions?.reduce((s, c) => s + Number(c.amount), 0) || 0
  const totalBookings   = bookings?.length || 0
  const resolvedTickets = tickets?.filter(t => t.status === 'resolved').length || 0
  const openTickets     = tickets?.filter(t => !['resolved','cancelled'].includes(t.status)).length || 0

  // Bookings by type
  const byType = {}
  bookings?.forEach(b => { byType[b.type] = (byType[b.type] || 0) + 1 })

  // Commission by type
  const commByType = {}
  bookings?.forEach(b => {
    if (b.commission_amount) {
      commByType[b.type] = (commByType[b.type] || 0) + Number(b.commission_amount)
    }
  })

  return {
    totalCommission: Math.round(totalCommission),
    totalBookings,
    resolvedTickets,
    openTickets,
    byType,
    commByType,
    conversations: conversations?.length || 0,
  }
}

// ── SAVE GUEST NOTES ──────────────────────────────────────────
export async function saveGuestNotes(guestId, notes) {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('guests')
    .update({ notes })
    .eq('id', guestId)
    .select()
    .single()
  return data
}
