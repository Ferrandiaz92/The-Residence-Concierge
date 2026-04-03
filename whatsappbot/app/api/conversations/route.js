// app/api/conversations/route.js
// ============================================================
// FIX: Read messages from the messages TABLE, not conversations.messages JSONB
//
// Fix #5 changed appendMessage() to write to the messages table.
// getConversationHistory() also reads from the messages table.
// But this API was still reading conversations.messages (JSONB) — empty for
// all new conversations since Fix #5 deployed. That's why the dashboard
// showed conversations but no messages inside them.
//
// This version:
//   1. Fetches conversations (without the stale messages JSONB column)
//   2. For each conversation, fetches its messages from the messages table
//   3. Returns the same shape the dashboard expects: conv.messages = [{role, content, ts}]
// ============================================================

import { createClient }         from '@supabase/supabase-js'
import { cookies }              from 'next/headers'
import {
  requireRole,
  anonymiseMessagesForQA,
  canAccessPII,
  logAudit,
  ROLES,
}                               from '../../../lib/gdpr.js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

function getSession() {
  try {
    const c = cookies().get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

export async function GET(request) {
  const session = getSession()

  const guard = requireRole(
    session,
    ROLES.MANAGER,
    ROLES.RECEPTIONIST,
    ROLES.COMMUNICATIONS,
    ROLES.SUPERVISOR
  )
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const hotelId = session.hotelId  // always from session — no URL override
  const limit   = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  const supabase = getSupabase()

  // Step 1: Fetch conversations (no messages column — it's stale JSONB)
  const { data: convData, error: convErr } = await supabase
    .from('conversations')
    .select(`
      id, status, last_message_at, created_at,
      guests(id, name, surname, room, phone, language, guest_type, stay_status)
    `)
    .eq('hotel_id', hotelId)
    .in('status', ['active', 'escalated'])
    .order('last_message_at', { ascending: false })
    .limit(limit)

  if (convErr) return Response.json({ error: convErr.message }, { status: 500 })

  const convs = convData || []
  if (convs.length === 0) return Response.json({ conversations: [] })

  // Step 2: Batch fetch messages for all conversations
  // Single query — much faster than N individual queries
  const convIds = convs.map(c => c.id)

  const { data: msgData } = await supabase
    .from('messages')
    .select('conversation_id, role, content, sent_by, created_at')
    .in('conversation_id', convIds)
    .not('content', 'is', null)
    .neq('content', '')
    .order('created_at', { ascending: true })

  // Group messages by conversation_id
  const msgsByConv = {}
  for (const msg of (msgData || [])) {
    if (!msgsByConv[msg.conversation_id]) msgsByConv[msg.conversation_id] = []
    msgsByConv[msg.conversation_id].push({
      role:    msg.role,
      content: msg.content,
      ts:      msg.created_at,
      sent_by: msg.sent_by,
    })
  }

  // Step 3: Also check conversations.messages JSONB as fallback
  // for conversations that existed before Fix #5 was deployed
  // (they have messages in JSONB but not in the messages table)
  const convsWithNoTableMessages = convs.filter(c => !msgsByConv[c.id] || msgsByConv[c.id].length === 0)

  if (convsWithNoTableMessages.length > 0) {
    const fallbackIds = convsWithNoTableMessages.map(c => c.id)
    const { data: fallbackData } = await supabase
      .from('conversations')
      .select('id, messages')
      .in('id', fallbackIds)

    for (const fc of (fallbackData || [])) {
      if (Array.isArray(fc.messages) && fc.messages.length > 0) {
        // Use JSONB messages as fallback — convert to same shape
        msgsByConv[fc.id] = fc.messages.map(m => ({
          role:    m.role,
          content: m.content,
          ts:      m.ts || m.created_at,
          sent_by: m.sent_by,
        }))
      }
    }
  }

  // Step 4: Build response — attach messages to each conversation
  const conversations = convs.map(conv => {
    const messages = msgsByConv[conv.id] || []

    if (canAccessPII(session.role)) {
      return { ...conv, messages }
    }

    // Communications — anonymise
    return {
      id:              conv.id,
      status:          conv.status,
      last_message_at: conv.last_message_at,
      created_at:      conv.created_at,
      guest_ref:       'Guest #' + conv.guests?.id?.toString().slice(0, 6).toUpperCase(),
      language:        conv.guests?.language,
      message_count:   messages.length,
      messages:        anonymiseMessagesForQA(messages),
    }
  })

  // Audit log for communications role
  if (session.role === ROLES.COMMUNICATIONS) {
    logAudit({
      hotelId:      session.hotelId,
      session,
      action:       'conversation_view',
      resourceType: 'conversation',
      detail:       { count: conversations.length, view: 'anonymised_list' },
    })
  }

  return Response.json({ conversations })
}
