// app/api/auth/login/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import bcrypt           from 'bcryptjs'
import { logAudit }     from '../../../../lib/gdpr.js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

const VALID_ROLES = ['manager', 'communications', 'supervisor', 'receptionist', 'employee']

export async function POST(request) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*, hotels(id, name)')
      .eq('email', email.toLowerCase().trim())
      .eq('active', true)
      .single()

    if (error || !staff) {
      await logAudit({ hotelId: null, session: { email, role: null }, action: 'login_fail', detail: { reason: 'email_not_found' } })
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!VALID_ROLES.includes(staff.role)) {
      return Response.json({ error: 'Account configuration error' }, { status: 403 })
    }

    let passwordOk = false
    if (staff.password_hash) {
      passwordOk = await bcrypt.compare(password, staff.password_hash)
    } else if (staff.password) {
      passwordOk = (password === staff.password) || (password === process.env.STAFF_PASSWORD)
      if (passwordOk) {
        const newHash = await bcrypt.hash(password, 12)
        await supabase.from('staff').update({ password_hash: newHash, password: null }).eq('id', staff.id)
          .catch(e => console.error('Hash migration failed:', e.message))
      }
    }

    if (!passwordOk) {
      await logAudit({ hotelId: staff.hotel_id, session: { staffId: staff.id, email: staff.email, role: staff.role }, action: 'login_fail', detail: { reason: 'wrong_password' } })
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    await supabase.from('staff').update({ last_login_at: new Date().toISOString() }).eq('id', staff.id)

    const session = {
      staffId:    staff.id,
      hotelId:    staff.hotel_id,
      hotelName:  staff.hotels?.name,
      name:       staff.name,
      role:       staff.role,
      email:      staff.email,
      department: staff.department || null,
    }

    const cookieStore = cookies()
    cookieStore.set('session', JSON.stringify(session), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 8,
      path:     '/',
    })

    await logAudit({ hotelId: staff.hotel_id, session, action: 'login_success' })
    return Response.json({ status: 'ok', role: staff.role, name: staff.name })

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
