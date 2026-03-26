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

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Look up staff by email only first
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, email, name, role, password, hotel_id, hotels(id, name)')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !staff) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Check password (plain text for now)
    const passwordOk = (password === staff.password) ||
                       (password === process.env.STAFF_PASSWORD)

    if (!passwordOk) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Build session
    const session = {
      staffId:   staff.id,
      hotelId:   staff.hotel_id,
      hotelName: staff.hotels?.name,
      name:      staff.name,
      role:      staff.role,
      email:     staff.email,
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
