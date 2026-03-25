// app/api/tickets/route.js
// Internal ticket CRUD + push notification triggers

import { createClient }          from '@supabase/supabase-js'
import { cookies }               from 'next/headers'
import { notifyDeptStaff, notifyReceptionResolved } from '../../../src/lib/push.js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

// ── GET — list tickets ────────────────────────────────────────
export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const hotelId    = searchParams.get('hotelId')
    const department = searchParams.get('department')
    if (!hotelId) return Response.json({ tickets: [] })

    const supabase = getSupabase()
    let query = supabase
      .from('internal_tickets')
      .select('*, guests ( name, surname, room, guest_room )')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (department) query = query.eq('department', department)

    const { data: tickets, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    const enriched = (tickets || []).map(t => ({
      ...t,
      guest_name:    t.guests?.name    || null,
      guest_surname: t.guests?.surname || null,
      room:          t.room || t.guests?.room || t.guests?.guest_room || null,
    }))
    return Response.json({ tickets: enriched })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

// ── POST — create ticket + 🔔 notify dept ────────────────────
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { hotelId, guestId, department, category, description, room, priority = 'today', createdBy } = await request.json()
    if (!hotelId || !department || !description) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = getSupabase()

    // Ticket number
    const { count } = await supabase.from('internal_tickets').select('*', { count:'exact', head:true }).eq('hotel_id', hotelId)
    const ticketNumber = (count || 0) + 1

    const { data: ticket, error } = await supabase
      .from('internal_tickets')
      .insert({ hotel_id:hotelId, guest_id:guestId||null, department, category:category||department, description, room:room||null, priority, status:'pending', created_by:createdBy||`staff:${session.name}`, ticket_number:ticketNumber })
      .select().single()
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // 🔔 Push notification — fire-and-forget, never block response
    if (priority !== 'planned') {
      let guestName = null
      if (guestId) {
        const { data: g } = await supabase.from('guests').select('name, surname').eq('id', guestId).single()
        if (g) guestName = `${g.name||''} ${g.surname||''}`.trim() || null
      }
      notifyDeptStaff({ hotelId, ticket, guestName, room:room||null })
        .catch(err => console.error('Push notify error:', err))
    }

    return Response.json({ status: 'created', ticket })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

// ── PATCH — update status + 🔔 notify reception on resolve ───
export async function PATCH(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { ticketId, status, assignedTo } = await request.json()
    if (!ticketId || !status) return Response.json({ error: 'Missing ticketId or status' }, { status: 400 })

    const supabase = getSupabase()

    // ── Race-condition guard on accept ───────────────────────
    // If two people tap Accept simultaneously, only the first wins
    if (status === 'in_progress') {
      const { data: current } = await supabase
        .from('internal_tickets').select('status, assigned_to_name').eq('id', ticketId).single()
      if (current?.status === 'in_progress' || current?.status === 'resolved') {
        // Already accepted by someone else
        return Response.json({ status:'already_accepted', assignedTo: current.assigned_to_name }, { status:409 })
      }
    }

    const updates = { status, updated_at: new Date().toISOString() }
    if (status === 'in_progress') {
      updates.accepted_at      = new Date().toISOString()
      // Store the display name of who accepted
      updates.assigned_to_name = assignedTo || session.name || 'Staff'
      // Also store the staff_id for proper linking
      updates.assigned_to_staff_id = session.staffId || null
    }
    if (status === 'resolved') updates.resolved_at = new Date().toISOString()

    const { data: ticket, error } = await supabase
      .from('internal_tickets').update(updates).eq('id', ticketId).select().single()
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // 🔔 Silent push to reception when resolved
    if (status === 'resolved' && ticket) {
      notifyReceptionResolved({ hotelId:ticket.hotel_id, ticketNum:ticket.ticket_number, dept:ticket.department, room:ticket.room })
        .catch(err => console.error('Push resolved notify error:', err))
    }

    return Response.json({ status: 'updated', ticket })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}
