// src/lib/supabase.js
// Server-side Supabase client using service key (bypasses RLS)
// Only use this in API routes and server components — never client-side

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.SUPABASE_URL
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

// ── HOTEL helpers ─────────────────────────────────────────────────────────────

export async function getHotelByWhatsappNumber(number) {
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('whatsapp_number', number)
    .eq('active', true)
    .single()
  if (error) throw error
  return data
}

// ── GUEST helpers ─────────────────────────────────────────────────────────────

export async function getOrCreateGuest(hotelId, phone) {
  // Try to find existing guest
  const { data: existing } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone', phone)
    .single()

  if (existing) return existing

  // Create new guest
  const { data, error } = await supabase
    .from('guests')
    .insert({ hotel_id: hotelId, phone })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGuest(guestId, updates) {
  const { data, error } = await supabase
    .from('guests')
    .update(updates)
    .eq('id', guestId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function searchGuests(hotelId, query) {
  // Search by room, surname, or phone
  const { data, error } = await supabase
    .from('guests')
    .select(`
      *,
      conversations(id, status, last_message_at, messages),
      bookings(id, type, status, commission_amount, created_at)
    `)
    .eq('hotel_id', hotelId)
    .or(`room.ilike.%${query}%,surname.ilike.%${query}%,phone.ilike.%${query}%,name.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data
}

// ── CONVERSATION helpers ──────────────────────────────────────────────────────

export async function getOrCreateConversation(guestId, hotelId) {
  // Get active conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('guest_id', guestId)
    .eq('status', 'active')
    .single()

  if (existing) return existing

  // Create new conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({ guest_id: guestId, hotel_id: hotelId, messages: [] })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function appendMessage(conversationId, role, content) {
  // Append a message to the conversation's messages array
  const message = { role, content, ts: new Date().toISOString() }

  const { data, error } = await supabase.rpc('append_message', {
    p_conversation_id: conversationId,
    p_message: message
  })

  // Fallback if RPC not set up yet — fetch then update
  if (error) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('messages')
      .eq('id', conversationId)
      .single()

    const messages = [...(conv?.messages || []), message]
    const { data: updated, error: updateError } = await supabase
      .from('conversations')
      .update({ messages, last_message_at: new Date().toISOString() })
      .eq('id', conversationId)
      .select()
      .single()
    if (updateError) throw updateError
    return updated
  }
  return data
}

export async function getConversationHistory(conversationId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', conversationId)
    .single()
  if (error) throw error
  return data?.messages || []
}

export async function getRecentConversations(hotelId, limit = 20) {
  const { data, error } = await supabase
    .from('v_active_conversations')
    .select('*')
    .eq('hotel_id', hotelId)
    .limit(limit)
  if (error) throw error
  return data
}

// ── PARTNER helpers ───────────────────────────────────────────────────────────

export async function getPartners(hotelId, type = null) {
  let query = supabase
    .from('partners')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('active', true)

  if (type) query = query.eq('type', type)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ── BOOKING helpers ───────────────────────────────────────────────────────────

export async function createBooking(hotelId, guestId, partnerId, type, details, commissionAmount) {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      hotel_id: hotelId,
      guest_id: guestId,
      partner_id: partnerId,
      type,
      details,
      commission_amount: commissionAmount,
      status: 'pending'
    })
    .select()
    .single()
  if (error) throw error

  // Auto-create commission record
  if (commissionAmount > 0) {
    const month = new Date().toISOString().slice(0, 7)
    await supabase.from('commissions').insert({
      hotel_id: hotelId,
      booking_id: data.id,
      amount: commissionAmount,
      month
    })
  }

  return data
}

export async function updateBookingStatus(bookingId, status) {
  const updates = {
    status,
    ...(status === 'confirmed' ? { confirmed_at: new Date().toISOString() } : {})
  }
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getRecentBookings(hotelId, limit = 30) {
  const { data, error } = await supabase
    .from('v_recent_bookings')
    .select('*')
    .eq('hotel_id', hotelId)
    .limit(limit)
  if (error) throw error
  return data
}
