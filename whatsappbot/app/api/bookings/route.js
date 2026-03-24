// app/api/bookings/route.js
import { getRecentBookings } from '../../../lib/dashboard.js'

export async function GET(request) {
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
