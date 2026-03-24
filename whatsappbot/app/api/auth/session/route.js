// app/api/auth/session/route.js
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = cookies()
    const sessionCookie = cookieStore.get('session')
    if (!sessionCookie) return Response.json({ session: null })
    const session = JSON.parse(sessionCookie.value)
    return Response.json({ session })
  } catch {
    return Response.json({ session: null })
  }
}
