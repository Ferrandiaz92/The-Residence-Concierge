// lib/gdpr.js
// ============================================================
// GDPR UTILITIES
//
// Centralises all PII stripping and audit logging.
// Every route that touches guest data should import from here.
//
// Key functions:
//   anonymiseMessages(messages)       — strips guest turns for Comms QA view
//   anonymiseGuest(guest)             — removes PII fields for non-privileged roles
//   canAccessPII(role)                — single source of truth for PII access
//   requireRole(session, ...roles)    — route guard helper
//   logAudit(params)                  — write to audit_log table
// ============================================================

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── ROLE HIERARCHY ────────────────────────────────────────────
// Defines which roles may access what category of data.
// Used by canAccess() throughout the app.

export const ROLES = {
  MANAGER:       'manager',
  COMMUNICATIONS:'communications',
  SUPERVISOR:    'supervisor',
  RECEPTIONIST:  'receptionist',
  EMPLOYEE:      'employee',
}

// Roles that may see raw PII (name, phone, full check-in dates)
const PII_ROLES = [ROLES.MANAGER, ROLES.RECEPTIONIST]

// Roles that may edit bot content (Q&A, system prompt, knowledge base)
const BOT_EDITOR_ROLES = [ROLES.MANAGER, ROLES.COMMUNICATIONS]

// Roles that may create and manage tickets
const TICKET_CREATE_ROLES = [ROLES.MANAGER, ROLES.SUPERVISOR, ROLES.RECEPTIONIST, ROLES.EMPLOYEE]

// Roles that may see all department tickets (not just own)
const TICKET_ALL_ROLES = [ROLES.MANAGER, ROLES.SUPERVISOR]

// Roles that may manage shifts
const SHIFT_ROLES = [ROLES.MANAGER, ROLES.SUPERVISOR]

// ── ACCESS CHECKS ─────────────────────────────────────────────

export function canAccessPII(role) {
  return PII_ROLES.includes(role)
}

export function canEditBot(role) {
  return BOT_EDITOR_ROLES.includes(role)
}

export function canCreateTicket(role) {
  return TICKET_CREATE_ROLES.includes(role)
}

export function canSeeAllTickets(role) {
  return TICKET_ALL_ROLES.includes(role)
}

export function canManageShifts(role) {
  return SHIFT_ROLES.includes(role)
}

export function canSeeFullAnalytics(role) {
  return role === ROLES.MANAGER
}

export function canExportData(role) {
  // Only manager can export individual-level data
  // Communications can export aggregated reports (handled separately)
  return role === ROLES.MANAGER
}

export function canManageStaff(role) {
  return role === ROLES.MANAGER
}

export function canDeleteGuestData(role) {
  // GDPR right to erasure — manager only, audited
  return role === ROLES.MANAGER
}

// ── ROUTE GUARD ───────────────────────────────────────────────
// Use at the top of any API route:
//   const guard = requireRole(session, 'manager', 'communications')
//   if (guard) return guard   // returns 401/403 Response if not allowed

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
  return null // allowed — proceed
}

// ── PII STRIPPING ─────────────────────────────────────────────

/**
 * Strip all PII from a guest object.
 * Returns only non-identifying operational fields.
 * Used for Supervisor role (sees room on ticket only, not here).
 */
export function anonymiseGuest(guest) {
  if (!guest) return null
  return {
    // Replace identity fields with a stable short reference
    guest_ref:  'Guest #' + guest.id?.toString().slice(0, 6).toUpperCase(),
    language:   guest.language,   // not PII per GDPR recital 26
    // No name, surname, phone, room, check_in, check_out, notes
  }
}

/**
 * For Communications role: strip guest messages, keep only bot (assistant) replies.
 * Guest text may contain PII (names, room numbers mentioned in passing).
 * Bot replies are safe to review for QA purposes.
 *
 * @param {Array} messages  — raw messages array from conversations.messages
 * @returns {Array}         — only assistant turns, with a placeholder for user turns
 */
export function anonymiseMessagesForQA(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map(msg => {
    if (msg.role === 'user') {
      return {
        role:    'user',
        content: '[Guest message — redacted for privacy]',
        ts:      msg.ts,
      }
    }
    // Assistant (bot) messages are returned in full for QA review
    return msg
  })
}

/**
 * Full anonymisation — strips all turns.
 * Used in aggregated analytics where even bot content isn't needed.
 */
export function stripAllMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map(msg => ({
    role:    msg.role,
    content: '[redacted]',
    ts:      msg.ts,
  }))
}

/**
 * Anonymise a booking for Communications view.
 * Removes guest_id and any guest-identifying fields.
 */
export function anonymiseBooking(booking) {
  const { guest_id, guests, ...safe } = booking
  return safe
}

// ── AUDIT LOGGING ─────────────────────────────────────────────

/**
 * Write an entry to audit_log.
 * Call this for every sensitive access or content change.
 * Fire-and-forget — never blocks the main response.
 *
 * @param {Object} params
 * @param {string} params.hotelId
 * @param {Object} params.session       — from cookie (staffId, role, email)
 * @param {string} params.action        — e.g. 'conversation_view', 'qa_edit'
 * @param {string} [params.resourceType]— e.g. 'conversation', 'qa', 'guest'
 * @param {string} [params.resourceId]  — UUID of the affected row
 * @param {Object} [params.detail]      — extra context
 * @param {string} [params.ip]          — request IP address
 */
export async function logAudit({
  hotelId,
  session,
  action,
  resourceType = null,
  resourceId   = null,
  detail       = {},
  ip           = null,
}) {
  try {
    const supabase = getSupabase()
    await supabase.from('audit_log').insert({
      hotel_id:      hotelId,
      staff_id:      session?.staffId   || null,
      staff_email:   session?.email     || null,
      staff_role:    session?.role      || null,
      action,
      resource_type: resourceType,
      resource_id:   resourceId,
      detail,
      ip_address:    ip,
    })
  } catch (err) {
    // Audit log failure must never break the main flow
    console.error('Audit log write failed:', err.message)
  }
}

// ── CONVENIENCE: LOG + GUARD TOGETHER ────────────────────────
// For routes that need both a role check and an audit entry

export async function guardAndLog({
  session,
  allowedRoles,
  hotelId,
  action,
  resourceType,
  resourceId,
  detail,
  ip,
}) {
  const guard = requireRole(session, ...allowedRoles)
  if (guard) return guard

  // Log asynchronously — don't await
  logAudit({ hotelId, session, action, resourceType, resourceId, detail, ip })
    .catch(err => console.error('Audit log error:', err))

  return null // allowed
}
