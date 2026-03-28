// app/api/conversations/route.js
// ============================================================
// Conversations — role-aware data filtering
//
// manager | receptionist  → full transcript + guest PII
// communications          → anonymised (bot turns only, Guest #ID)
// supervisor              → no access
// employee                → no access
// ============================================================

import { createClient }         from '@supabase/supabase-js'
import { cookies }              from 'next/headers'
import {
  requireRole,
  anonymiseMessagesForQA,
  anonymiseGuest,
  logAudit,
  canAccessPII,
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

  // supervisor: read-only, no PII (like communications but sees all messages)
  // employee: no access
  const guard = requireRole(
    session,
    ROLES.MANAGER,
    ROLES.RECEPTIONIST,
    ROLES.COMMUNICATIONS,
    ROLES.SUPERVISOR
  )
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const hotelId  = searchParams.get('hotelId') || session.hotelId
  const limit    = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, status, last_message_at, created_at, messages,
      guests(id, name, surname, room, phone, language, guest_type)
    `)
    .eq('hotel_id', hotelId)
    .in('status', ['active', 'escalated'])
    .order('last_message_at', { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const conversations = (data || []).map(conv => {
    if (canAccessPII(session.role)) {
      // Manager / receptionist — full data
      return conv
    }

    // Communications role — anonymise everything
    // Guest reference only, bot messages only
    return {
      id:               conv.id,
      status:           conv.status,
      last_message_at:  conv.last_message_at,
      created_at:       conv.created_at,
      guest_ref:        'Guest #' + conv.guests?.id?.toString().slice(0, 6).toUpperCase(),
      language:         conv.guests?.language,
      message_count:    conv.messages?.length || 0,
      messages:         anonymiseMessagesForQA(conv.messages),
      // No name, phone, room
    }
  })

  // Audit: communications accessing conversations
  if (session.role === ROLES.COMMUNICATIONS) {
    logAudit({
      hotelId:      session.hotelId,
      session,
      action:       'conversation_view',
      resourceType: 'conversation',
      detail:       { count: conversations.length, view: 'anonymised_list' },
    }).catch(() => {})
  }

  return Response.json({ conversations })
}
