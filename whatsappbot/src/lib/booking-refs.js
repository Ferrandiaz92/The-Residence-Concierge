// src/lib/booking-refs.js
// ============================================================
// Booking reference number generation and verification.
//
// Format: RC-YYMM-NNNN
//   RC   = The Residence Concierge (universal prefix)
//   YYMM = year + month (e.g. 2604 = April 2026)
//   NNNN = sequential per hotel (resets each month)
//
// Examples: RC-2604-0001, RC-2604-0042, RC-2607-0001
//
// Used for:
//   - Stripe experience bookings (guest_orders table)
//   - Partner bookings (bookings table)
//   - Facility bookings (facility_bookings table)
//
// Partners can text "REF #RC-2604-0042" to verify any booking.
// ============================================================

import { supabase } from './supabase.js'

// ── GENERATE NEXT REF ──────────────────────────────────────
export async function generateBookingRef(hotelId) {
  try {
    const { data, error } = await supabase.rpc('next_booking_ref', {
      p_hotel_id: hotelId
    })
    if (error) throw error
    return data  // e.g. "RC-2604-0042"
  } catch (e) {
    console.error('generateBookingRef failed:', e.message)
    // Fallback to UUID-based ref if function not available yet
    return 'RC-' + Date.now().toString(36).toUpperCase().slice(-6)
  }
}

// ── PARSE REF FROM TEXT ────────────────────────────────────
// Handles: "REF #RC-2604-0042", "ref RC-2604-0042", "#RC-2604-0042",
//          "check RC-2604-0042", "RC-2604-0042", "verify RC-2604-0042"
export function parseRefFromMessage(message) {
  const clean = message.trim().toUpperCase()
  // Match RC-YYMM-NNNN pattern
  const match = clean.match(/\bRC-(\d{4})-(\d{4})\b/)
  return match ? match[0] : null
}

// Is this message a ref verification request?
export function isRefVerification(message) {
  const m = message.toLowerCase().trim()
  const hasRef = /\brc-\d{4}-\d{4}\b/i.test(message)
  const hasKeyword = /\b(ref|reference|verify|check|confirm|paid|payment|booking)\b/.test(m)
  return hasRef && (hasKeyword || m.startsWith('#') || m.startsWith('rc-'))
}

// ── LOOK UP A REF ──────────────────────────────────────────
// Searches guest_orders, bookings, and facility_bookings
// Returns { type, record, guest, partner, hotel } or null
export async function lookupRef(ref) {
  // 1. Check guest_orders (Stripe payments)
  const { data: order } = await supabase
    .from('guest_orders')
    .select(`
      id, status, booking_ref, total_amount, commission_amount,
      tier_name, quantity, paid_at, created_at, stripe_payment_intent,
      disputed, dispute_note,
      partner_products ( name, category ),
      partners ( id, name, phone ),
      guests ( id, name, surname, room, phone, language ),
      hotels ( id, name, config )
    `)
    .eq('booking_ref', ref)
    .single()

  if (order) {
    return {
      type:    'stripe_order',
      record:  order,
      guest:   order.guests,
      partner: order.partners,
      hotel:   order.hotels,
    }
  }

  // 2. Check partner bookings
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, status, booking_ref, type, details, commission_amount,
      created_at, confirmed_at, disputed, dispute_note,
      partners ( id, name, phone ),
      guests ( id, name, surname, room, phone, language ),
      hotels ( id, name, config )
    `)
    .eq('booking_ref', ref)
    .single()

  if (booking) {
    return {
      type:    'partner_booking',
      record:  booking,
      guest:   booking.guests,
      partner: booking.partners,
      hotel:   booking.hotels,
    }
  }

  return null
}

// ── BUILD VERIFICATION REPLY ───────────────────────────────
// The message sent back to partner when they text a REF number
export function buildVerificationReply(lookup) {
  if (!lookup) {
    return [
      '❓ Reference not found.',
      '',
      'Please check the number and try again.',
      'Format: REF #RC-2604-0042',
      '',
      'Contact reception if you need help.',
    ].join('\n')
  }

  const { type, record, guest, partner, hotel } = lookup
  const ref      = record.booking_ref
  const guestName = [guest?.name, guest?.surname].filter(Boolean).join(' ') || 'Guest'
  const room     = guest?.room ? `Room ${guest.room}` : null

  // ── STRIPE ORDER (paid experience) ────────────────────────
  if (type === 'stripe_order') {
    const isPaid = ['paid', 'confirmed'].includes(record.status)
    const product = record.partner_products?.name || 'Experience'
    const tierLine = `${record.tier_name || ''}${record.quantity > 1 ? ` × ${record.quantity}` : ''}`
    const amount   = record.total_amount?.toFixed(0) || '?'
    const payout   = ((record.total_amount || 0) - (record.commission_amount || 0)).toFixed(0)
    const paidAt   = record.paid_at
      ? new Date(record.paid_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : null
    // Settlement: next Friday
    const nextFriday = (() => {
      const d = new Date()
      d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
      return d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })
    })()

    const lines = [
      isPaid ? '✅ BOOKING VERIFIED' : '⚠️ BOOKING NOT YET PAID',
      `Ref: #${ref}`,
      '',
      `📋 ${product}`,
      tierLine && `   ${tierLine} — €${amount}`,
      '',
      `👤 Guest: ${guestName}`,
      room && `   ${room} · ${hotel?.name || ''}`,
      '',
    ]

    if (isPaid) {
      lines.push(
        '💳 Payment: PAID ✅',
        paidAt && `   ${paidAt}`,
        '',
        `💰 Your payout: €${payout}`,
        `   Settlement: ${nextFriday}`,
        '',
        '🪪 Ask guest to show photo ID matching this name.',
        '',
        `Reply: DISPUTE #${ref}  — if any issue`,
      )
    } else {
      lines.push(
        `⚠️ Status: ${record.status.toUpperCase()}`,
        'Payment has NOT been received yet.',
        'Do not provide the service until paid.',
        '',
        'Contact reception if the guest claims they paid:',
        `${hotel?.config?.reception_phone || 'hotel reception'}`,
      )
    }

    if (record.disputed) {
      lines.push('', '🚨 NOTE: This booking is under dispute. Contact reception.')
    }

    return lines.filter(l => l !== null && l !== false).join('\n')
  }

  // ── PARTNER BOOKING (taxi, restaurant, activity) ───────────
  if (type === 'partner_booking') {
    const isConfirmed = record.status === 'confirmed'
    const isPending   = record.status === 'pending'
    const typeEmoji   = { taxi:'🚗', restaurant:'🍽️', activity:'⛵' }[record.type] || '📋'
    const details     = record.details || {}

    const lines = [
      isConfirmed ? '✅ BOOKING VERIFIED' : isPending ? '⏳ BOOKING PENDING' : `ℹ️ STATUS: ${record.status.toUpperCase()}`,
      `Ref: #${ref}`,
      '',
      `${typeEmoji} ${record.type?.charAt(0).toUpperCase() + record.type?.slice(1) || 'Booking'}`,
      details.destination && `   To: ${details.destination}`,
      details.time        && `   Time: ${details.time}`,
      details.date        && `   Date: ${details.date}`,
      details.passengers  && `   Passengers: ${details.passengers}`,
      '',
      `👤 Guest: ${guestName}`,
      room && `   ${room} · ${hotel?.name || ''}`,
      '',
      isConfirmed ? '✅ You confirmed this booking.' : isPending ? '⏳ Awaiting your confirmation.' : '',
      '',
      `Reply: DISPUTE #${ref}  — if any issue`,
    ]

    return lines.filter(l => l !== null && l !== false && l !== '').join('\n')
  }

  return 'Booking found but details unavailable. Please contact reception.'
}

// ── HANDLE DISPUTE REPLY ───────────────────────────────────
// Partner texts "DISPUTE #RC-2604-0042 [optional reason]"
export function isDisputeMessage(message) {
  return /\bDISPUTE\b/i.test(message) && /\bRC-\d{4}-\d{4}\b/i.test(message)
}

export function parseDisputeMessage(message) {
  const refMatch  = message.match(/\bRC-\d{4}-\d{4}\b/i)
  const ref       = refMatch ? refMatch[0].toUpperCase() : null
  // Everything after the ref number is the reason
  const reasonMatch = message.replace(/DISPUTE/i, '').replace(ref || '', '').replace(/#/g, '').trim()
  return { ref, reason: reasonMatch || 'No reason given' }
}
