// app/api/messages/route.js
// Staff send a WhatsApp message to a guest directly from the dashboard

import { createClient } from '@supabase/supabase-js'
import { checkCsrf } from '../../../lib/csrf.js'
import { cookies } from 'next/headers'
import twilio from 'twilio'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

function getSession() {
  try {
    const c = cookies().get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

export async function POST(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const hotelId = session.hotelId

    // Only receptionist and manager can reply to guests
    if (!['receptionist','manager','admin'].includes(session.role)) {
      return Response.json({ error: 'Permission denied — only reception staff can reply to guests' }, { status: 403 })
    }

    const { conversationId, guestPhone, message } = await request.json()
    if (!conversationId || !guestPhone || !message?.trim()) {
      return Response.json({ error: 'conversationId, guestPhone and message required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Send WhatsApp via Twilio
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    const toFormatted = guestPhone.startsWith('whatsapp:') ? guestPhone : `whatsapp:${guestPhone}`
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to:   toFormatted,
      body: message.trim(),
    })

    // Save to conversation as 'assistant' message (appears as bot)
    const { data: conv } = await supabase
      .from('conversations').select('messages').eq('id', conversationId).single()

    const messages = [
      ...(conv?.messages || []),
      {
        role:    'assistant',
        content: message.trim(),
        ts:      new Date().toISOString(),
        sent_by: session.name || 'Staff', // track who sent it
      }
    ]

    await supabase.from('conversations').update({
      messages,
      last_message_at: new Date().toISOString(),
      status: 'active', // re-activate if was escalated
    }).eq('id', conversationId)

    return Response.json({ status: 'sent' })
  } catch (err) {
    console.error('Send message error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
