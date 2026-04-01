// app/api/bookings/route.js
import { getRecentBookings } from '../../../lib/dashboard.js'
import { cookies } from 'next/headers'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function GET(request) {
  const session = getSession()
  if (!session) {
    const { searchParams } = new URL(request.url)
    console.warn(JSON.stringify({ level:'warn', event:'auth_failure', route: new URL(request.url).pathname, hotelId: searchParams.get('hotelId') || null, ts: new Date().toISOString() }))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })
    const bookings = await getRecentBookings(hotelId)
    return Response.json({ bookings })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
