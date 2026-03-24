// app/api/guests/search/route.js
import { searchGuests } from '../../../../lib/dashboard.js'
import { cookies } from 'next/headers'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const cookieStore = cookies()
    const sessionCookie = cookieStore.get('session')
    if (!sessionCookie) return Response.json({ guests: [] })
    const session = JSON.parse(sessionCookie.value)
    const guests = await searchGuests(session.hotelId, q)
    return Response.json({ guests })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
