// app/api/conversations/route.js
import { getActiveConversations } from '../../../lib/dashboard.js'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })
    const conversations = await getActiveConversations(hotelId)
    return Response.json({ conversations })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
