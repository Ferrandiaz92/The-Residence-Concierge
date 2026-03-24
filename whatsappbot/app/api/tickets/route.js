export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get('hotelId')
  return Response.json({ 
    status: 'ok', 
    hotelId: hotelId,
    tickets: [] 
  })
}

export async function POST(request) {
  const body = await request.json()
  return Response.json({ 
    status: 'created', 
    received: body 
  })
}
