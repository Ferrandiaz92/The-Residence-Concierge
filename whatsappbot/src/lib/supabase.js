// src/lib/supabase.js
// ============================================================
// Updated with stay_status-aware guest lookup
// Key changes:
//   getOrCreateGuest     — unchanged (phone-based lookup)
//   getGuestByRoom       — NEW — resolves room → active guest
//                          used by QR code WhatsApp flow
//   setGuestStayStatus   — NEW — transitions stay_status
// ============================================================

import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

export async function getHotelByWhatsappNumber(number) {
  const clean = number.replace('whatsapp:', '')
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .or(`whatsapp_number.eq.${clean},whatsapp_number.eq.whatsapp:${clean}`)
    .single()
  if (error || !data) throw new Error(`No hotel found for ${number}`)
  return data
}

// ── GET OR CREATE GUEST BY PHONE ──────────────────────────────
// Standard flow: guest messages the bot from their own number
export async function getOrCreateGuest(hotelId, phone) {
  const clean = phone.replace('whatsapp:', '')

  const { data: existing } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone', clean)
    .single()

  if (existing) return existing

  // New guest — prospect until checked in
  const { data: created, error } = await supabase
    .from('guests')
    .insert({
      hotel_id:         hotelId,
      phone:            clean,
      guest_type:       'prospect',
      stay_status:      'prospect',
      prospect_status:  'new',
      first_contact_at: new Date().toISOString(),
      language:         'en',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create guest: ${error.message}`)
  return created
}

// ── GET ACTIVE GUEST BY ROOM ──────────────────────────────────
// QR code flow: guest scans room QR, sends "Room 312"
// Returns the active guest in that room, or null if none / grey zone
//
// Grey zone: room exists but stay_status is not 'active'
// Caller handles grey zone by asking guest to confirm
export async function getGuestByRoom(hotelId, roomNumber) {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('room', roomNumber)
    .eq('stay_status', 'active')
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data
}

// ── LINK COMPANION GUEST TO ROOM ─────────────────────────────
// When a new phone number sends their room number (QR code flow)
// and we find an active guest in that room —
// link the new phone as a companion to the same stay
export async function linkCompanionGuest(hotelId, phone, activeGuest) {
  const clean = phone.replace('whatsapp:', '')

  // Check if this phone already exists
  const { data: existing } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone', clean)
    .single()

  if (existing) {
    // Update existing record to link to this room/stay
    const { data } = await supabase
      .from('guests')
      .update({
        room:           activeGuest.room,
        check_in:       activeGuest.check_in,
        check_out:      activeGuest.check_out,
        stay_status:    'active',
        guest_type:     'companion',
        companion_of:   activeGuest.id,   // links to primary guest
        checked_in_at:  new Date().toISOString(),
        language:       existing.language || activeGuest.language || 'en',
      })
      .eq('id', existing.id)
      .select()
      .single()
    return data
  }

  // Create new companion guest
  const { data: created } = await supabase
    .from('guests')
    .insert({
      hotel_id:       hotelId,
      phone:          clean,
      room:           activeGuest.room,
      check_in:       activeGuest.check_in,
      check_out:      activeGuest.check_out,
      stay_status:    'active',
      guest_type:     'companion',
      companion_of:   activeGuest.id,
      language:       activeGuest.language || 'en',
      checked_in_at:  new Date().toISOString(),
      first_contact_at: new Date().toISOString(),
    })
    .select()
    .single()

  return created
}

// ── SET STAY STATUS ───────────────────────────────────────────
export async function setGuestStayStatus(guestId, status, extra = {}) {
  const updates = { stay_status: status, ...extra }

  if (status === 'active') {
    updates.checked_in_at = updates.checked_in_at || new Date().toISOString()
  }
  if (status === 'checked_out') {
    updates.checked_out_at = updates.checked_out_at || new Date().toISOString()
  }

  const { data } = await supabase
    .from('guests')
    .update(updates)
    .eq('id', guestId)
    .select()
    .single()

  return data
}

export async function updateGuest(guestId, updates) {
  const { data, error } = await supabase
    .from('guests')
    .update(updates)
    .eq('id', guestId)
    .select()
    .single()
  if (error) console.error('updateGuest error:', error.message)
  return data
}

export async function getOrCreateConversation(guestId, hotelId) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('guest_id', guestId)
    .in('status', ['active', 'escalated'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing

  const { data: created } = await supabase
    .from('conversations')
    .insert({ guest_id: guestId, hotel_id: hotelId, messages: [], status: 'active' })
    .select()
    .single()

  return created
}

export async function appendMessage(convId, role, content) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', convId)
    .single()

  const messages = [...(conv?.messages || []), {
    role, content,
    ts: new Date().toISOString()
  }]

  await supabase
    .from('conversations')
    .update({ messages, last_message_at: new Date().toISOString() })
    .eq('id', convId)
}

export async function getConversationHistory(convId) {
  const { data } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', convId)
    .single()
  return data?.messages || []
}

export async function getPartners(hotelId) {
  const { data } = await supabase
    .from('partners')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('active', true)
  return data || []
}

export async function createBooking(booking) {
  const { data } = await supabase
    .from('bookings')
    .insert(booking)
    .select()
    .single()
  return data
}
