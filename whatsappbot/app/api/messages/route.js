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

    // Save to messages TABLE (same as bot via appendMessage)
    // NOT to conversations.messages JSONB — that column is stale/unused for new convs
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      hotel_id:        hotelId,
      role:            'assistant',
      content:         message.trim(),
      sent_by:         session.name || 'Staff',
      created_at:      new Date().toISOString(),
    })

    // Update conversation metadata + de-escalate
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      status:          'active', // clear escalated flag — staff has replied
    }).eq('id', conversationId)

    return Response.json({ status: 'sent' })
  } catch (err) {
    console.error('Send message error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
