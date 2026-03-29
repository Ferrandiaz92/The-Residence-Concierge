// src/lib/supabase.js
// ─────────────────────────────────────────────────────────────
// FIX #5: Messages stored in a proper table instead of JSONB blob
//
// BEFORE: appendMessage read the entire conversations.messages JSONB
//   array, appended one item, and wrote the entire array back.
//   Problems:
//   - Full read+write on every message (gets slower as history grows)
//   - Race condition: two rapid messages → last write wins, one lost
//   - No search/filter possible on message content
//   - Row grows unbounded; long-staying guests hit Postgres TOAST limits
//
// AFTER: appendMessage inserts a single row into the messages table.
//   - O(1) write regardless of history length
//   - Race-condition safe (each message is its own atomic insert)
//   - Full SQL query capability on message content
//   - getConversationHistory fetches only the last N rows needed
//
// MIGRATION REQUIRED before deploying this file:
//   Run supabase/migration_messages_table.sql in your Supabase SQL editor.
//   The migration is non-destructive — it keeps the old JSONB column
//   until you've verified everything works, then you can drop it.
// ─────────────────────────────────────────────────────────────

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

// ── KEY CHANGE: new guests default to 'prospect' not 'stay' ──
export async function getOrCreateGuest(hotelId, phone) {
  const clean = phone.replace('whatsapp:', '')

  // Try to find existing guest by phone
  const { data: existing } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone', clean)
    .single()

  if (existing) return existing

  // New guest — create as prospect until we know more
  const { data: created, error } = await supabase
    .from('guests')
    .insert({
      hotel_id:         hotelId,
      phone:            clean,
      guest_type:       'prospect',
      prospect_status:  'new',
      first_contact_at: new Date().toISOString(),
      language:         'en',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create guest: ${error.message}`)
  return created
}

export async function updateGuest(guestId, updates) {
  const { data, error } = await supabase
    .from('guests')
    .update(updates)
    .eq('id', guestId)
    .select()
    .single()
  if (error) throw new Error(`Failed to update guest: ${error.message}`)
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

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ guest_id: guestId, hotel_id: hotelId, status: 'active' })
    .select()
    .single()

  if (error) throw new Error(`Failed to create conversation: ${error.message}`)
  return created
}

// ── FIX #5: appendMessage — single INSERT, no read needed ────
// Each message is its own row. Safe under concurrent requests.
// The old JSONB approach required read-modify-write which could
// lose messages if two arrived within the same millisecond.
export async function appendMessage(convId, role, content, meta = {}) {
  // Insert the message as a proper row
  const { error } = await supabase.from('messages').insert({
    conversation_id: convId,
    role,
    content,
    sent_by: meta.sent_by || null,
  })

  if (error) {
    // Graceful fallback: log but don't crash the bot
    console.error('[supabase] appendMessage failed:', error.message)
    return
  }

  // Keep last_message_at in sync for sorting/display in dashboard
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', convId)
}

// ── FIX #5: getConversationHistory — fetches only last N rows ─
// Previously fetched the entire JSONB blob and sliced in JS.
// Now we let Postgres do the pagination — only the rows needed
// for Claude's context window are transferred.
export async function getConversationHistory(convId, limit = 20) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, sent_by, created_at')
    .eq('conversation_id', convId)
    .not('content', 'is', null)
    .neq('content', '')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[supabase] getConversationHistory failed:', error.message)
    return []
  }

  // Reverse so oldest-first for Claude (it expects chronological order)
  return (data || []).reverse()
}

// Kept for backward compatibility with any dashboard code that
// reads conv.messages directly — returns empty array now that
// the column is no longer written. Remove after verifying dashboard.
export async function getConversationMessages(convId) {
  return getConversationHistory(convId)
}

export async function getPartners(hotelId) {
  const { data } = await supabase
    .from('partners')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('active', true)
    .order('name')
  return data || []
}

export async function createBooking(hotelId, guestId, partnerId, type, details, commissionAmount, source = 'guest_request') {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      hotel_id:          hotelId,
      guest_id:          guestId,
      partner_id:        partnerId,
      type,
      details,
      commission_amount: commissionAmount,
      status:            'pending',
      source,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to create booking: ${error.message}`)
  return data
}

export async function updateBookingStatus(bookingId, status) {
  const updates = { status }
  if (status === 'confirmed') updates.confirmed_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select()
    .single()
  if (error) console.error('updateBookingStatus error:', error.message)
  return data
}
