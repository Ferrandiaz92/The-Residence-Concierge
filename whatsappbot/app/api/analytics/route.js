// app/api/analytics/route.js
import { getManagerStats } from '../../../lib/dashboard.js'
import { requireSession, requireHotel, serverError } from '../../../lib/route-helpers.js'
import { cookies } from 'next/headers'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function GET(request) {
  const { session, error: authErr } = requireSession(request)
  if (authErr) return authErr
  const { hotelId, error: hotelErr } = requireHotel(request, session)
  if (hotelErr) return hotelErr
  try {
    const { searchParams } = new URL(request.url)
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })
    const stats = await getManagerStats(hotelId)
    return Response.json(stats)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
