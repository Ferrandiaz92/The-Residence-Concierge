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
}                       from '../../../lib/gdpr'

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

// ── GET — read Q&A entries ────────────────────────────────────
export async function GET(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER, ROLES.COMMUNICATIONS)
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get('hotelId') || session.hotelId

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('qa_entries')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ qa: data || [] })
}

// ── POST — create Q&A entry ───────────────────────────────────
export async function POST(request) {
  const session = getSession()
  const guard   = requireRole(session, ROLES.MANAGER, ROLES.COMMUNICATIONS)
  if (guard) return guard

  try {
    const { hotelId, question, answer, category, tags, active = true } = await request.json()

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
