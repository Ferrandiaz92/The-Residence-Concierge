// app/api/tickets/route.js
// ============================================================
// TICKET API — called by the staff portal dashboard
// POST /api/tickets — create a new internal ticket
// GET  /api/tickets — get open tickets for a hotel
// ============================================================

import { createTicket, getOpenTickets } from '@/src/lib/ticketing.js'
import { supabase } from '@/src/lib/supabase.js'

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      hotelId,
      guestId,
      department,
      category,
      description,
      room,
      priority = 'normal',
      createdBy = 'staff',
    } = body

    // Validate required fields
    if (!hotelId || !department || !category || !description) {
      return Response.json(
        { error: 'Missing required fields: hotelId, department, category, description' },
        { status: 400 }
      )
    }

    const ticket = await createTicket({
      hotelId, guestId, department, category,
      description, room, priority, createdBy,
    })

    return Response.json({
      status: 'created',
      ticket: {
        id:            ticket.id,
        ticket_number: ticket.ticket_number,
        department:    ticket.department,
        status:        ticket.status,
        priority:      ticket.priority,
        created_at:    ticket.created_at,
      }
    })
  } catch (err) {
    console.error('Create ticket error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')

    if (!hotelId) {
      return Response.json({ error: 'hotelId required' }, { status: 400 })
    }

    const tickets = await getOpenTickets(hotelId)
    return Response.json({ tickets })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/tickets — update ticket status manually from dashboard
export async function PATCH(request) {
  try {
    const { ticketId, status, note } = await request.json()

    const { data, error } = await supabase
      .from('internal_tickets')
      .update({
        status,
        ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        ...(note ? { resolution_note: note } : {}),
        escalation_due_at: null,
      })
      .eq('id', ticketId)
      .select()
      .single()

    if (error) throw error
    return Response.json({ status: 'updated', ticket: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
