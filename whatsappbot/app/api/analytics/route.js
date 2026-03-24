// app/api/analytics/route.js
import { getManagerStats } from '../../../lib/dashboard.js'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })
    const stats = await getManagerStats(hotelId)
    return Response.json(stats)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
