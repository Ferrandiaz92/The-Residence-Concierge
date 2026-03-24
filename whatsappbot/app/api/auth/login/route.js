// app/api/auth/login/route.js
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    )

    // Look up staff member
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*, hotels(id, name)')
      .eq('email', email.toLowerCase())
      .single()

    if (error || !staff) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Simple password check — in production use bcrypt
    // For now password is stored as plain text in staff.password
    // Add a 'password' column to staff table or use NEXTAUTH_SECRET comparison
    if (password !== process.env.STAFF_PASSWORD && password !== staff.password) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Set session cookie
    const session = {
      staffId:  staff.id,
      hotelId:  staff.hotel_id,
      hotelName: staff.hotels?.name,
      name:     staff.name,
      role:     staff.role,
      email:    staff.email,
    }

    const cookieStore = cookies()
    cookieStore.set('session', JSON.stringify(session), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 7, // 7 days
      path:     '/',
    })

    return Response.json({ status: 'ok', role: staff.role })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE() {
  const cookieStore = cookies()
  cookieStore.delete('session')
  return Response.json({ status: 'logged out' })
}
