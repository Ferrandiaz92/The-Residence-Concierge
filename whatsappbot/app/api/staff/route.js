// app/api/staff/route.js
// ============================================================
// Staff account management — Manager only
// Create accounts, update roles, suspend, reset passwords
// Every action is audit-logged (GDPR Article 5(2))
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import bcrypt           from 'bcryptjs'
import { requireRole, logAudit, ROLES } from '../../../lib/gdpr'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

function getSession() {
  try {
    const c = cookies().get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

const VALID_ROLES       = ['manager', 'communications', 'supervisor', 'receptionist', 'employee']
const VALID_DEPARTMENTS = ['maintenance', 'housekeeping', 'fnb', 'concierge', 'security', 'communications', null]

// ── GET — list all staff for this hotel ──────────────────────
export async function GET(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER)
  if (guard) return guard

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('staff')
    .select('id, email, name, role, department, active, last_login_at, created_at')
    .eq('hotel_id', session.hotelId)
    .order('role')
    .order('name')

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Never return password_hash in list response
  return Response.json({ staff: data || [] })
}

// ── POST — create a new staff account ────────────────────────
export async function POST(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER)
  if (guard) return guard

  try {
    const { email, name, role, department, password } = await request.json()

    // Validate
    if (!email || !name || !role || !password) {
      return Response.json({ error: 'email, name, role and password are required' }, { status: 400 })
    }
    if (!VALID_ROLES.includes(role)) {
      return Response.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }
    if (password.length < 10) {
      return Response.json({ error: 'Password must be at least 10 characters' }, { status: 400 })
    }

    const supabase    = getSupabase()
    const password_hash = await bcrypt.hash(password, 12)

    const { data: newStaff, error } = await supabase
      .from('staff')
      .insert({
        hotel_id:      session.hotelId,
        email:         email.toLowerCase().trim(),
        name,
        role,
        department:    department || null,
        password_hash,
        active:        true,
      })
      .select('id, email, name, role, department, active, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'An account with this email already exists' }, { status: 409 })
      }
      return Response.json({ error: error.message }, { status: 500 })
    }

    await logAudit({
      hotelId:      session.hotelId,
      session,
      action:       'staff_create',
      resourceType: 'staff',
      resourceId:   newStaff.id,
      detail:       { email: newStaff.email, role: newStaff.role, department: newStaff.department },
    })

    return Response.json({ status: 'created', staff: newStaff })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH — update role, department, suspend, or reset password
export async function PATCH(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER)
  if (guard) return guard

  try {
    const { staffId, role, department, active, password, name } = await request.json()

    if (!staffId) {
      return Response.json({ error: 'staffId is required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Verify target staff belongs to same hotel (prevent cross-hotel attacks)
    const { data: target } = await supabase
      .from('staff')
      .select('id, role, email, hotel_id')
      .eq('id', staffId)
      .eq('hotel_id', session.hotelId)
      .single()

    if (!target) {
      return Response.json({ error: 'Staff member not found' }, { status: 404 })
    }

    // Prevent manager from demoting themselves accidentally
    if (target.id === session.staffId && role && role !== ROLES.MANAGER) {
      return Response.json({ error: 'You cannot change your own role' }, { status: 400 })
    }

    const updates   = {}
    const auditDetail = {}

    if (name !== undefined)       { updates.name       = name }
    if (active !== undefined)     { updates.active      = active;     auditDetail.active      = active }
    if (department !== undefined) { updates.department  = department; auditDetail.department  = department }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 })
      }
      updates.role        = role
      auditDetail.oldRole = target.role
      auditDetail.newRole = role
    }

    if (password !== undefined) {
      if (password.length < 10) {
        return Response.json({ error: 'Password must be at least 10 characters' }, { status: 400 })
      }
      updates.password_hash = await bcrypt.hash(password, 12)
      auditDetail.passwordReset = true
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('staff')
      .update(updates)
      .eq('id', staffId)
      .select('id, email, name, role, department, active, last_login_at')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    await logAudit({
      hotelId:      session.hotelId,
      session,
      action:       role !== undefined ? 'staff_role_change' : 'staff_update',
      resourceType: 'staff',
      resourceId:   staffId,
      detail:       { email: target.email, ...auditDetail },
    })

    return Response.json({ status: 'updated', staff: updated })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
