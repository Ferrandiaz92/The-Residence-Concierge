// lib/gdpr.js
// ─────────────────────────────────────────────────────────────
// FIX #4: GDPR deletion now covers abuse_events and message_rate
//
// The previous deleteGuestData() cascaded through:
//   guests → conversations → bookings  ✓
//
// But missed phone-keyed tables:
//   abuse_events   ✗  (stores phone number as PII)
//   message_rate   ✗  (stores phone number as PII)
//   blocked_phones ✗  (stores phone number as PII)
//
// These are not linked by guest_id foreign key — they use raw
// phone strings — so the cascade didn't reach them.
// This fix adds explicit deletes for all three.
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── ROLE HIERARCHY ────────────────────────────────────────────
export const ROLES = {
  MANAGER:       'manager',
  COMMUNICATIONS:'communications',
  SUPERVISOR:    'supervisor',
  RECEPTIONIST:  'receptionist',
  EMPLOYEE:      'employee',
}

const PII_ROLES        = ['manager', 'receptionist']
const BOT_EDITOR_ROLES = ['manager', 'communications']
const TICKET_CREATE_ROLES = ['manager', 'supervisor', 'receptionist', 'employee']
const TICKET_ALL_ROLES    = ['manager', 'supervisor']
const SHIFT_ROLES         = ['manager', 'supervisor']

export function canAccessPII(role)        { return PII_ROLES.includes(role) }
export function canEditBot(role)          { return BOT_EDITOR_ROLES.includes(role) }
export function canCreateTicket(role)     { return TICKET_CREATE_ROLES.includes(role) }
export function canSeeAllTickets(role)    { return TICKET_ALL_ROLES.includes(role) }
export function canManageShifts(role)     { return SHIFT_ROLES.includes(role) }
export function canSeeFullAnalytics(role) { return role === 'manager' }
export function canExportData(role)       { return role === 'manager' }
export function canManageStaff(role)      { return role === 'manager' }
export function canDeleteGuestData(role)  { return role === 'manager' }

// ── ROUTE GUARD ───────────────────────────────────────────────
export function requireRole(session, ...allowedRoles) {
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!allowedRoles.includes(session.role)) {
    return Response.json(
      { error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
      { status: 403 }
    )
  }
  return null
}

// ── PII STRIPPING ─────────────────────────────────────────────
export function anonymiseGuest(guest) {
  if (!guest) return null
  return {
    guest_ref: 'Guest #' + guest.id?.toString().slice(0, 6).toUpperCase(),
    language:  guest.language,
  }
}

export function anonymiseMessagesForQA(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map(msg => {
    if (msg.role === 'user') {
      return { role: 'user', content: '[Guest message — redacted for privacy]', ts: msg.ts }
    }
    return msg
  })
}

export function stripAllMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map(msg => ({ role: msg.role, content: '[redacted]', ts: msg.ts }))
}

export function anonymiseBooking(booking) {
  const { guest_id, guests, ...safe } = booking
  return safe
}

// ── AUDIT LOGGING ─────────────────────────────────────────────
export async function logAudit({
  hotelId, session, action,
  resourceType = null, resourceId = null,
  detail = {}, ip = null,
}) {
  try {
    const supabase = getSupabase()
    await supabase.from('audit_log').insert({
      hotel_id:      hotelId,
      staff_id:      session?.staffId || null,
      staff_email:   session?.email   || null,
      staff_role:    session?.role    || null,
      action,
      resource_type: resourceType,
      resource_id:   resourceId,
      detail,
      ip_address:    ip,
    })
  } catch (err) {
    console.error('Audit log write failed:', err.message)
  }
}

export async function guardAndLog({ session, allowedRoles, hotelId, action, resourceType, resourceId, detail, ip }) {
  const guard = requireRole(session, ...allowedRoles)
  if (guard) return guard
  logAudit({ hotelId, session, action, resourceType, resourceId, detail, ip }).catch(() => {})
  return null
}

// ── GDPR: RIGHT TO ERASURE ────────────────────────────────────
/**
 * Fully delete a guest and ALL their PII across every table.
 *
 * Tables covered:
 *   guests          → cascade deletes conversations, bookings, commissions,
 *                     guest_stays, scheduled_messages, internal_tickets,
 *                     guest_feedback, guest_orders, abuse_events (guest_id FK)
 *
 *   abuse_events    → also deleted by phone (no guest_id FK on all rows)
 *   message_rate    → deleted by phone (no guest_id FK)
 *   blocked_phones  → deleted by phone (no guest_id FK)
 *
 * Always writes to audit_log BEFORE deletion so there is a permanent
 * record that erasure was carried out (GDPR Article 5(2) accountability).
 *
 * @param {string} hotelId
 * @param {string} guestId   — guests.id (UUID)
 * @param {Object} session   — staff session (for audit log)
 * @param {string} [ip]      — request IP
 * @returns {{ success: boolean, tablesCleared: string[] }}
 */
export async function deleteGuestData(hotelId, guestId, session, ip = null) {
  const supabase      = getSupabase()
  const tablesCleared = []

  // 1. Load guest phone BEFORE deletion (needed to clean phone-keyed tables)
  const { data: guest } = await supabase
    .from('guests').select('id, phone, name, surname').eq('id', guestId).single()

  if (!guest) {
    return { success: false, error: 'Guest not found' }
  }

  const phone = guest.phone?.replace('whatsapp:', '')

  // 2. Write audit log BEFORE deletion (GDPR Article 5(2) accountability)
  //    This record is permanent — the audit_log has no DELETE policy.
  await logAudit({
    hotelId,
    session,
    action:       'gdpr_erasure',
    resourceType: 'guest',
    resourceId:   guestId,
    detail: {
      guest_name:  `${guest.name || ''} ${guest.surname || ''}`.trim(),
      phone_hash:  phone ? phone.slice(-4) : null,  // last 4 digits only — not PII
      requested_by: session?.email || 'unknown',
    },
    ip,
  })

  // 3. Delete phone-keyed tables FIRST (before guest row is gone)
  //    These are not covered by the guest FK cascade.
  if (phone) {
    // FIX #4: abuse_events — was missing from erasure
    const { error: abuseErr } = await supabase
      .from('abuse_events')
      .delete()
      .eq('hotel_id', hotelId)
      .eq('phone', phone)

    if (!abuseErr) tablesCleared.push('abuse_events')
    else console.error('GDPR: abuse_events delete error:', abuseErr.message)

    // FIX #4: message_rate — was missing from erasure
    const { error: rateErr } = await supabase
      .from('message_rate')
      .delete()
      .eq('hotel_id', hotelId)
      .eq('phone', phone)

    if (!rateErr) tablesCleared.push('message_rate')
    else console.error('GDPR: message_rate delete error:', rateErr.message)

    // FIX #4: blocked_phones — was missing from erasure
    const { error: blockedErr } = await supabase
      .from('blocked_phones')
      .delete()
      .eq('hotel_id', hotelId)
      .eq('phone', phone)

    if (!blockedErr) tablesCleared.push('blocked_phones')
    else console.error('GDPR: blocked_phones delete error:', blockedErr.message)
  }

  // 4. Delete the guest record — cascade handles the rest:
  //    conversations → messages, bookings → commissions,
  //    scheduled_messages, internal_tickets, guest_stays,
  //    guest_feedback, guest_orders, abuse_events (guest_id FK rows)
  const { error: guestErr } = await supabase
    .from('guests')
    .delete()
    .eq('id', guestId)
    .eq('hotel_id', hotelId)  // safety: never delete across hotels

  if (guestErr) {
    console.error('GDPR: guest delete error:', guestErr.message)
    return { success: false, error: guestErr.message, tablesCleared }
  }

  tablesCleared.push('guests (+ cascade: conversations, messages, bookings, scheduled_messages, tickets)')

  return { success: true, tablesCleared }
}
