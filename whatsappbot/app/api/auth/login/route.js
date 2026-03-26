// app/api/auth/login/route.js
// ============================================================
// Authentication — supports all 5 roles
// Uses bcrypt password verification (replaces plain-text)
// Writes audit log on every login attempt
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import bcrypt           from 'bcryptjs'
import { logAudit }     from '../../../lib/gdpr'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// Valid roles — anything not in this list is rejected
const VALID_ROLES = ['manager', 'communications', 'supervisor', 'receptionist', 'employee']

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Look up staff member by email
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*, hotels(id, name)')
      .eq('email', email.toLowerCase().trim())
      .eq('active', true)       // suspended accounts cannot log in
      .single()

    if (error || !staff) {
      // Audit failed attempt without leaking whether email exists
      await logAudit({
        hotelId:      null,
        session:      { email, role: null },
        action:       'login_fail',
        detail:       { reason: 'email_not_found' },
      })
      // Use same message for missing email and wrong password (prevent enumeration)
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Role sanity check
    if (!VALID_ROLES.includes(staff.role)) {
      return Response.json({ error: 'Account configuration error' }, { status: 403 })
    }

    // Verify password with bcrypt
    let passwordOk = false

    if (staff.password_hash) {
      // New bcrypt path
      passwordOk = await bcrypt.compare(password, staff.password_hash)
    } else if (staff.password) {
      // Legacy plain-text fallback (migrate immediately after login)
      passwordOk = (password === staff.password) ||
                   (password === process.env.STAFF_PASSWORD)

      if (passwordOk) {
        // Migrate to bcrypt on the fly
        const newHash = await bcrypt.hash(password, 12)
        await supabase
          .from('staff')
          .update({ password_hash: newHash, password: null })
          .eq('id', staff.id)
          .catch(e => console.error('Hash migration failed:', e.message))
      }
    } else {
      // No password set at all — reject
      passwordOk = false
    }

    if (!passwordOk) {
      await logAudit({
        hotelId:  staff.hotel_id,
        session:  { staffId: staff.id, email: staff.email, role: staff.role },
        action:   'login_fail',
        detail:   { reason: 'wrong_password' },
      })
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Update last_login_at
    await supabase
      .from('staff')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', staff.id)

    // Build session — only include what the UI needs
    // Never put sensitive data in the session cookie
    const session = {
      staffId:   staff.id,
      hotelId:   staff.hotel_id,
      hotelName: staff.hotels?.name,
      name:      staff.name,
      role:      staff.role,
      email:     staff.email,
      department: staff.department || null,
    }

    const cookieStore = cookies()
    cookieStore.set('session', JSON.stringify(session), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 8,   // 8 hours (reduced from 7 days for security)
      path:     '/',
    })

    // Audit successful login
    await logAudit({
      hotelId:  staff.hotel_id,
      session,
      action:   'login_success',
    })

    return Response.json({
      status: 'ok',
      role:   staff.role,
      name:   staff.name,
    })

  } catch (err) {
    console.error('Login error:', err)
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE() {
  const cookieStore = cookies()
  cookieStore.delete('session')
  return Response.json({ status: 'logged out' })
}
