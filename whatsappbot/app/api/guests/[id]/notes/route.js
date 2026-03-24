// app/api/guests/[id]/notes/route.js
import { saveGuestNotes } from '../../../../../lib/dashboard.js'

export async function PATCH(request, { params }) {
  try {
    const { notes } = await request.json()
    const data = await saveGuestNotes(params.id, notes)
    return Response.json({ status: 'ok', data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
