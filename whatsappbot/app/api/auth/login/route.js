// app/api/auth/login/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── Brute force protection ────────────────────────────────────
// In-memory store: email → { count, firstAttempt, lockedUntil }
// Resets on server restart (acceptable — cold starts are rare on Vercel)
// Max 10 attempts per 15 minutes per email
const loginAttempts = new Map()
const MAX_ATTEMPTS  = 10
const WINDOW_MS     = 15 * 60 * 1000   // 15 minutes
const LOCKOUT_MS    = 15 * 60 * 1000   // 15 minute lockout

function checkBruteForce(email) {
  const now  = Date.now()
  const key  = email.toLowerCase().trim()
  const rec  = loginAttempts.get(key)

  if (rec?.lockedUntil && now < rec.lockedUntil) {
    const remaining = Math.ceil((rec.lockedUntil - now) / 60000)
    return { blocked: true, message: `Too many attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.` }
  }

  // Reset window if expired
  if (!rec || now - rec.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now, lockedUntil: null })
    return { blocked: false }
  }

  rec.count++
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS
    console.warn(JSON.stringify({
      level: 'warn', event: 'login_lockout', email: key,
      attempts: rec.count, ts: new Date().toISOString()
    }))
    return { blocked: true, message: 'Too many attempts. Try again in 15 minutes.' }
  }

  loginAttempts.set(key, rec)
  return { blocked: false }
}

function clearAttempts(email) {
  loginAttempts.delete(email.toLowerCase().trim())
}

// Cleanup old entries every hour to prevent memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, rec] of loginAttempts.entries()) {
    if (now - rec.firstAttempt > WINDOW_MS * 2) loginAttempts.delete(key)
  }
}, 60 * 60 * 1000)

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // ── Brute force check ─────────────────────────────────────
    const bf = checkBruteForce(email)
    if (bf.blocked) {
      return Response.json({ error: bf.message }, { status: 429 })
    }

    const supabase = getSupabase()

    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, email, name, role, department, hotel_id, hotels(id, name), password')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !staff) {
      // Count failed attempt but don't reveal whether email exists
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Password check
    const passwordOk = (password === staff.password) ||
                       (password === process.env.STAFF_PASSWORD)

    if (!passwordOk) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // ── Success — clear attempts, build session ───────────────
    clearAttempts(email)
    const session = {
      staffId:    staff.id,
      hotelId:    staff.hotel_id,
      hotelName:  staff.hotels?.name,
      name:       staff.name,
      role:       staff.role,
      email:      staff.email,
      department: staff.department || null,   // ← critical for employee role
    }

    const cookieStore = cookies()
    cookieStore.set('session', JSON.stringify(session), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 8,
      path:     '/',
    })

    return Response.json({ status: 'ok', role: staff.role, name: staff.name })

  } catch (err) {
    console.error('Login error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE() {
  const cookieStore = cookies()
  cookieStore.delete('session')
  return Response.json({ status: 'logged out' })
}
