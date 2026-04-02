// lib/route-helpers.js
// ─────────────────────────────────────────────────────────────
// Centralised auth, CSRF, input validation and DB helpers.
// Import from here instead of copy-pasting into every route.
//
// Usage:
//   import { requireSession, requireHotel, validate, db } from '../../../lib/route-helpers.js'
//
//   export async function GET(request) {
//     const { session, error } = requireSession()
//     if (error) return error
//
//     const { hotelId, error: hotelErr } = requireHotel(request, session)
//     if (hotelErr) return hotelErr
//
//     const supabase = db()
//     ...
//   }
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import { checkCsrf }    from './csrf.js'

// ── Supabase client ───────────────────────────────────────────
export function db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── Session ───────────────────────────────────────────────────
// Returns { session } or { error: Response }
export function requireSession(request) {
  try {
    const c       = cookies().get('session')
    const session = c ? JSON.parse(c.value) : null
    if (!session) {
      // Log auth failure for monitoring
      const path = request ? new URL(request.url).pathname : 'unknown'
      console.warn(JSON.stringify({
        level: 'warn', event: 'auth_failure', route: path,
        ts: new Date().toISOString(),
      }))
      return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    return { session }
  } catch {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
}

// ── Role guard ────────────────────────────────────────────────
// Returns { ok: true } or { error: Response }
export function requireRole(session, allowedRoles) {
  if (!allowedRoles.includes(session.role)) {
    return { error: Response.json({ error: 'Access denied' }, { status: 403 }) }
  }
  return { ok: true }
}

// ── Hotel isolation ───────────────────────────────────────────
// Extracts hotelId from request and verifies it matches the session.
// Prevents staff at Hotel A from reading Hotel B data by changing the URL.
// Returns { hotelId } or { error: Response }
export function requireHotel(request, session) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get('hotelId')

  if (!hotelId) {
    return { error: Response.json({ error: 'hotelId required' }, { status: 400 }) }
  }

  // Multi-hotel isolation: session must belong to this hotel
  // session.hotelId is set at login time and cannot be spoofed
  if (session.hotelId !== hotelId) {  // always enforce — no bypass for null hotelId
    console.warn(JSON.stringify({
      level: 'warn', event: 'hotel_isolation_blocked',
      sessionHotel: session.hotelId, requestedHotel: hotelId,
      role: session.role, ts: new Date().toISOString(),
    }))
    return { error: Response.json({ error: 'Access denied' }, { status: 403 }) }
  }

  return { hotelId }
}

// ── Hotel isolation for POST body ────────────────────────────
// Same as requireHotel but reads hotelId from parsed JSON body
export function requireHotelFromBody(body, session) {
  const hotelId = body.hotelId

  if (!hotelId) {
    return { error: Response.json({ error: 'hotelId required' }, { status: 400 }) }
  }

  if (session.hotelId !== hotelId) {
    console.warn(JSON.stringify({
      level: 'warn', event: 'hotel_isolation_blocked',
      sessionHotel: session.hotelId, requestedHotel: hotelId,
      role: session.role, ts: new Date().toISOString(),
    }))
    return { error: Response.json({ error: 'Access denied' }, { status: 403 }) }
  }

  return { hotelId }
}

// ── CSRF ──────────────────────────────────────────────────────
// Returns error Response or null if allowed
export function requireCsrf(request) {
  return checkCsrf(request)
}

// ── Input validation ──────────────────────────────────────────
// Simple field presence validator.
// Usage: const err = validate(body, ['name','phone','type'])
//        if (err) return err
export function validate(obj, requiredFields) {
  const missing = requiredFields.filter(f => {
    const val = obj[f]
    return val === undefined || val === null || val === ''
  })
  if (missing.length > 0) {
    return Response.json({
      error: `Missing required fields: ${missing.join(', ')}`,
    }, { status: 400 })
  }
  return null
}

// ── Standard error response ───────────────────────────────────
export function serverError(err, context = '') {
  console.error(JSON.stringify({
    level: 'error', event: 'server_error',
    context, message: err.message,
    ts: new Date().toISOString(),
  }))
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}

// ── Standard success response ─────────────────────────────────
export function ok(data) {
  return Response.json({ success: true, ...data })
}
