// app/api/guests/[id]/route.js
import { getGuestProfile } from '../../../../lib/dashboard.js'
import { requireSession, serverError } from '../../../../lib/route-helpers.js'
import { cookies } from 'next/headers'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function GET(request, { params }) {
  const { session, error: authErr } = requireSession(request)
  if (authErr) return authErr
  try {
    const profile = await getGuestProfile(params.id)
    return Response.json(profile)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
