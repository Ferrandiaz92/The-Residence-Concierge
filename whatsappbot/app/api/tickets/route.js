// app/api/tickets/route.js
// ============================================================
// Internal tickets — role-aware access
//
// manager        → full access, all tickets, guest name visible
// supervisor     → all tickets, NO guest name/phone (room only)
// receptionist   → create + own hotel tickets (full guest info)
// employee       → create + view own dept tickets (room only)
// communications → no access
// ============================================================

import { createClient }        from '@supabase/supabase-js'
import { cookies }             from 'next/headers'
import {
  requireRole,
  canSeeAllTickets,
  canAccessPII,
  logAudit,
  ROLES,
}                              from '../../../lib/gdpr.js'
import {
  notifyDeptStaff,
  notifyReceptionResolved,
}                              from '../../../src/lib/push'

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

// ── GET — list tickets ────────────────────────────────────────
export async function GET(request) {
  const session = getSession()

  // Communications has no ticket access
  const guard = requireRole(
    session,
    ROLES.MANAGER, ROLES.SUPERVISOR, ROLES.RECEPTIONIST, ROLES.EMPLOYEE
  )
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const hotelId    = searchParams.get('hotelId') || session.hotelId
  const department = searchParams.get('department')

  const supabase = getSupabase()

  let query = supabase
    .from('internal_tickets')
    .select('*, guests(name, surname, room, phone)')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Employees only see their own department's tickets
  if (session.role === ROLES.EMPLOYEE) {
    if (session.department) {
      query = query.eq('department', session.department)
    }
  } else if (department) {
    query = query.eq('department', department)
  }

  const { data: tickets, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const now      = Date.now()
  const enriched = (tickets || []).map(t => {
    const baseTicket = {
      ...t,
      minutes_open: Math.round((now - new Date(t.created_at).getTime()) / 60000),
    }

    // Manager + receptionist see full guest info
    if (canAccessPII(session.role)) {
      return {
        ...baseTicket,
        guest_name:    t.guests?.name    || null,
        guest_surname: t.guests?.surname || null,
        guest_phone:   t.guests?.phone   || null,
        room:          t.room || t.guests?.room || null,
      }
    }

    // Supervisor + employee see room only, no guest identity
    return {
      ...baseTicket,
      guest_name:    null,   // deliberately omitted
      guest_surname: null,
      guest_phone:   null,
      room:          t.room || null,  // room is operational necessity
      guests:        undefined,
    }
  })

  return Response.json({ tickets: enriched })
}

// ── POST — create ticket ──────────────────────────────────────
export async function POST(request) {
  const session = getSession()
  const guard   = requireRole(
    session,
    ROLES.MANAGER, ROLES.SUPERVISOR, ROLES.RECEPTIONIST, ROLES.EMPLOYEE
  )
  if (guard) return guard

  try {
    const {
      hotelId,
      guestId,
      department,
      category,
      description,
      room,
      priority = 'today',
      createdBy,
    } = await request.json()

    if (!hotelId || !department || !description) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Employee can only create tickets for their own department
    if (session.role === ROLES.EMPLOYEE && session.department) {
      if (department !== session.department) {
        return Response.json(
          { error: 'You can only create tickets for your own department' },
          { status: 403 }
        )
      }
    }

    const supabase = getSupabase()
    const { count } = await supabase
      .from('internal_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('hotel_id', hotelId)

    const ticketNumber = (count || 0) + 1

    const { data: ticket, error } = await supabase
      .from('internal_tickets')
      .insert({
        hotel_id:      hotelId,
        guest_id:      guestId || null,
        department,
        category:      category || department,
        description,
        room:          room || null,
        priority,
        status:        'pending',
        created_by:    createdBy || `${session.role}:${session.name}`,
        ticket_number: ticketNumber,
      })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Push notification (fire-and-forget)
    if (priority !== 'planned') {
      let guestName = null
      if (guestId && canAccessPII(session.role)) {
        const { data: g } = await supabase
          .from('guests')
          .select('name, surname')
          .eq('id', guestId)
          .single()
        if (g) guestName = `${g.name || ''} ${g.surname || ''}`.trim() || null
      }
      notifyDeptStaff({ hotelId, ticket, guestName, room: room || null })
        .catch(err => console.error('Push notify error:', err))
    }

    return Response.json({ status: 'created', ticket })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH — update ticket status ──────────────────────────────
export async function PATCH(request) {
  const session = getSession()
  const guard   = requireRole(
    session,
    ROLES.MANAGER, ROLES.SUPERVISOR, ROLES.RECEPTIONIST, ROLES.EMPLOYEE
  )
  if (guard) return guard

  try {
    const { ticketId, status, assignedTo } = await request.json()
    if (!ticketId || !status) {
      return Response.json({ error: 'Missing ticketId or status' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Fetch current ticket to check ownership
    const { data: current } = await supabase
      .from('internal_tickets')
      .select('status, assigned_to_name, department, hotel_id')
      .eq('id', ticketId)
      .single()

    if (!current) return Response.json({ error: 'Ticket not found' }, { status: 404 })

    // Hotel isolation
    if (current.hotel_id !== session.hotelId) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    // Employee can only update tickets in their department
    if (session.role === ROLES.EMPLOYEE && session.department) {
      if (current.department !== session.department) {
        return Response.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Race-condition guard: prevent double-accept
    if (status === 'in_progress') {
      if (current.status === 'in_progress' || current.status === 'resolved') {
        return Response.json(
          { status: 'already_accepted', assignedTo: current.assigned_to_name },
          { status: 409 }
        )
      }
    }

    const updates = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'in_progress') {
      updates.accepted_at       = new Date().toISOString()
      updates.assigned_to_name  = assignedTo || session.name || 'Staff'
      updates.assigned_to_staff_id = session.staffId || null
    }
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString()
    }

    const { data: ticket, error } = await supabase
      .from('internal_tickets')
      .update(updates)
      .eq('id', ticketId)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Notify reception on resolve
    if (status === 'resolved' && ticket) {
      notifyReceptionResolved({
        hotelId: ticket.hotel_id,
        ticketNum: ticket.ticket_number,
        dept: ticket.department,
        room: ticket.room,
      }).catch(err => console.error('Push resolved notify error:', err))
    }

    return Response.json({ status: 'updated', ticket })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
