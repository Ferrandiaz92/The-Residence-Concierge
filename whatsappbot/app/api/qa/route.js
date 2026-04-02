// app/api/qa/route.js
// ============================================================
// Bot Q&A management
//
// GET    → manager + communications (read)
// POST   → manager + communications (create)
// PATCH  → manager + communications (update)
// DELETE → manager only
//
// All edits are audit-logged (GDPR Article 5(2) accountability)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import {
  requireRole,
  logAudit,
  canEditBot,
  ROLES,
}                       from '../../../lib/gdpr.js'

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

// ── GET — read Q&A entries OR conversation review ─────────────
// When filter/language/guestType params present → conversation review mode
// Otherwise → qa_entries list mode
export async function GET(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER, ROLES.COMMUNICATIONS)
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const hotelId   = session.hotelId  // always from session
  const filter    = searchParams.get('filter')
  const language  = searchParams.get('language')
  const guestType = searchParams.get('guestType')
  const search    = searchParams.get('search')
  const month     = searchParams.get('month')

  const supabase = getSupabase()

  // ── QA ENTRIES mode (default) ─────────────────────────────
  if (!filter && !language && !guestType) {
    const { data, error } = await supabase
      .from('qa_entries')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ qa: data || [] })
  }

  // ── CONVERSATION REVIEW mode ───────────────────────────────
  // Fetch conversations with their messages + guest info for QA review
  let convQuery = supabase
    .from('conversations')
    .select('id, status, last_message_at, created_at, guests(id, name, surname, room, language, guest_type, stay_status)')
    .eq('hotel_id', hotelId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  // Filter by status
  if (filter === 'escalated') convQuery = convQuery.eq('status', 'escalated')
  else if (filter === 'resolved') convQuery = convQuery.eq('status', 'resolved')
  else convQuery = convQuery.in('status', ['active', 'escalated', 'resolved'])

  const { data: convData, error: convErr } = await convQuery
  if (convErr) return Response.json({ error: convErr.message }, { status: 500 })

  let convs = convData || []

  // Filter by guest type
  if (guestType && guestType !== 'all') {
    convs = convs.filter(c => c.guests?.guest_type === guestType)
  }

  // Filter by language
  if (language && language !== 'all') {
    convs = convs.filter(c => c.guests?.language === language)
  }

  // Filter by month — use last_message_at so active conversations
  // show in the month they were last active, not when they started
  if (month && month !== 'all') {
    convs = convs.filter(c =>
      c.last_message_at?.startsWith(month) ||
      c.created_at?.startsWith(month)
    )
  }

  if (convs.length === 0) {
    return Response.json({ conversations: [], stats: { totalConvs: 0 } })
  }

  // Batch fetch messages from messages table
  const convIds = convs.map(c => c.id)
  const { data: msgData } = await supabase
    .from('messages')
    .select('conversation_id, role, content, sent_by, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true })

  const msgsByConv = {}
  for (const msg of (msgData || [])) {
    if (!msgsByConv[msg.conversation_id]) msgsByConv[msg.conversation_id] = []
    msgsByConv[msg.conversation_id].push({ role: msg.role, content: msg.content, ts: msg.created_at, sent_by: msg.sent_by })
  }

  // Fallback to JSONB for old convs
  const noMsgs = convs.filter(c => !msgsByConv[c.id]?.length)
  if (noMsgs.length > 0) {
    const { data: jsonbData } = await supabase
      .from('conversations').select('id, messages').in('id', noMsgs.map(c => c.id))
    for (const fc of (jsonbData || [])) {
      if (Array.isArray(fc.messages) && fc.messages.length > 0) {
        msgsByConv[fc.id] = fc.messages.map(m => ({ role: m.role, content: m.content, ts: m.ts, sent_by: m.sent_by }))
      }
    }
  }

  // Fetch QA flags
  const { data: flagData } = await supabase
    .from('qa_flags')
    .select('*')
    .in('conversation_id', convIds)

  const flagsByConv = {}
  for (const f of (flagData || [])) {
    if (!flagsByConv[f.conversation_id]) flagsByConv[f.conversation_id] = []
    flagsByConv[f.conversation_id].push(f)
  }

  // Build response
  const conversations = convs.map(conv => {
    const messages = msgsByConv[conv.id] || []
    const flags    = flagsByConv[conv.id] || []

    // Filter by search term
    if (search && search.trim()) {
      const q = search.toLowerCase()
      const hit = messages.some(m => m.content?.toLowerCase().includes(q)) ||
        conv.guests?.name?.toLowerCase().includes(q)
      if (!hit) return null
    }

    return { ...conv, messages, flags }
  }).filter(Boolean)

  const stats = {
    totalConvs:    conversations.length,
    escalated:     conversations.filter(c => c.status === 'escalated').length,
    totalMessages: conversations.reduce((s, c) => s + (c.messages?.length || 0), 0),
  }

  return Response.json({ conversations, stats })
}

// ── POST — create Q&A entry ───────────────────────────────────
export async function POST(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER, ROLES.COMMUNICATIONS)
  if (guard) return guard

  try {
    const { hotelId, question, answer, category, tags, active = true } = await request.json()
  if (hotelId && session.hotelId && hotelId !== session.hotelId) return Response.json({ error: 'Access denied' }, { status: 403 })

    if (!question || !answer) {
      return Response.json({ error: 'question and answer are required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('qa_entries')
      .insert({
        hotel_id:   hotelId || session.hotelId,
        question,
        answer,
        category:   category || 'general',
        tags:       tags     || [],
        active,
        created_by: `${session.role}:${session.name}`,
      })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    await logAudit({
      hotelId:      session.hotelId,
      session,
      action:       'qa_edit',
      resourceType: 'qa',
      resourceId:   data.id,
      detail:       { operation: 'create', question: question.slice(0, 100) },
    })

    return Response.json({ status: 'created', qa: data })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH — update Q&A entry ──────────────────────────────────
export async function PATCH(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER, ROLES.COMMUNICATIONS)
  if (guard) return guard

  try {
    const { id, question, answer, category, tags, active } = await request.json()
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const updates = {}
    if (question !== undefined) updates.question = question
    if (answer   !== undefined) updates.answer   = answer
    if (category !== undefined) updates.category = category
    if (tags     !== undefined) updates.tags     = tags
    if (active   !== undefined) updates.active   = active
    updates.updated_by = `${session.role}:${session.name}`
    updates.updated_at = new Date().toISOString()

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('qa_entries')
      .update(updates)
      .eq('id', id)
      .eq('hotel_id', session.hotelId)   // hotel isolation
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    await logAudit({
      hotelId:      session.hotelId,
      session,
      action:       'qa_edit',
      resourceType: 'qa',
      resourceId:   id,
      detail:       { operation: 'update', fields: Object.keys(updates) },
    })

    return Response.json({ status: 'updated', qa: data })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE — manager only ─────────────────────────────────────
export async function DELETE(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER)
  if (guard) return guard

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const supabase = getSupabase()
    const { error } = await supabase
      .from('qa_entries')
      .delete()
      .eq('id', id)
      .eq('hotel_id', session.hotelId)

    if (error) return Response.json({ error: error.message }, { status: 500 })

    await logAudit({
      hotelId:      session.hotelId,
      session,
      action:       'qa_edit',
      resourceType: 'qa',
      resourceId:   id,
      detail:       { operation: 'delete' },
    })

    return Response.json({ status: 'deleted' })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
