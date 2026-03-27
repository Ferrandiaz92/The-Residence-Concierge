// src/lib/supabase.js — updated getOrCreateGuest
// New unknown numbers default to 'prospect' type
// Only changes: getOrCreateGuest function

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
// ── FIX #3: Phone normalisation ──────────────────────────────
// Normalises any phone format to E.164: +35799123456
// Handles: +35799123456, 0035799123456, 35799123456
export function normalisePhone(raw) {
  if (!raw) return raw
  // Strip whatsapp: prefix and all non-digit/+ chars
  let digits = raw.replace('whatsapp:', '').replace(/[^\d+]/g, '')
  // If starts with 00, replace with +
  if (digits.startsWith('00')) digits = '+' + digits.slice(2)
  // If no leading +, add it
  if (!digits.startsWith('+')) digits = '+' + digits
  return digits
}

export async function getOrCreateGuest(hotelId, phone) {
  const clean = normalisePhone(phone)

  // Try to find existing guest by phone
  // Also try common format variants in case old data is un-normalised
  const { data: existing } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone', clean)
    .maybeSingle()

  // If not found with normalised, try the raw cleaned version as fallback
  if (!existing) {
    const rawClean = phone.replace('whatsapp:', '').trim()
    if (rawClean !== clean) {
      const { data: fallback } = await supabase
        .from('guests')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('phone', rawClean)
        .maybeSingle()

      if (fallback) {
        // Found with un-normalised number — migrate it
        await supabase.from('guests').update({ phone: clean }).eq('id', fallback.id)
        return { ...fallback, phone: clean }
      }
    }
  }

  if (existing) return existing

  if (existing) return existing

  // New guest — create as prospect until we know more
  const { data: created, error } = await supabase
    .from('guests')
    .insert({
      hotel_id:         hotelId,
      phone:            clean,
      guest_type:       'prospect',    // ← was 'stay', now 'prospect'
      prospect_status:  'new',
      first_contact_at: new Date().toISOString(),
      language:         'en',          // will be updated on first message
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
    .insert({ guest_id: guestId, hotel_id: hotelId, messages: [], status: 'active' })
    .select()
    .single()

  if (error) throw new Error(`Failed to create conversation: ${error.message}`)
  return created
}

export async function appendMessage(convId, role, content, meta = {}) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', convId)
    .single()

  const messages = [...(conv?.messages || []), {
    role, content, ts: new Date().toISOString(), ...meta
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
