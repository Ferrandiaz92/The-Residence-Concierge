// app/api/guests/[id]/notes/route.js
import { saveGuestNotes } from '../../../../../lib/dashboard.js'
import { checkCsrf } from '../../../../../lib/csrf.js'
import { cookies } from 'next/headers'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function PATCH(request, { params }) {
  const session = getSession()
  if (!session) {
    const { searchParams } = new URL(request.url)
    console.warn(JSON.stringify({ level:'warn', event:'auth_failure', route: new URL(request.url).pathname, hotelId: searchParams.get('hotelId') || null, ts: new Date().toISOString() }))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { notes } = await request.json()
    const data = await saveGuestNotes(params.id, notes)
    return Response.json({ status: 'ok', data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
