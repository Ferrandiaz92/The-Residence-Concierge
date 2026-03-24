// app/api/guests/[id]/route.js
import { getGuestProfile } from '../../../../lib/dashboard.js'

export async function GET(request, { params }) {
  try {
    const profile = await getGuestProfile(params.id)
    return Response.json(profile)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
