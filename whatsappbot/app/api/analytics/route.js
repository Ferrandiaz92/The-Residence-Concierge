// app/api/analytics/route.js
import { getManagerStats } from '../../../lib/dashboard.js'
import { cookies } from 'next/headers'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function GET(request) {
  const session = getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
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
