// app/api/cancellations/route.js
// ─────────────────────────────────────────────────────────────
// Handles cancellation acknowledgement actions from the dashboard.
// Called when reception/manager/supervisor clicks:
//   - "Acknowledged"
//   - "Partner confirmed cancellation"
//   - "Issue — needs follow up"
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import { acknowledgeBookingCancellation } from '../../../src/lib/cancellations.js'
import { checkCsrf }    from '../../../lib/csrf.js'
import log              from '../../../lib/logger.js'

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

// GET — fetch cancelled bookings needing acknowledgement
export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId') || session.hotelId
    const supabase = getSupabase()

    // Load cancelled bookings that haven't been acknowledged yet
    const { data: cancellations } = await supabase
      .from('bookings')
      .select(`
        id, type, status, cancelled_at, cancel_reason, cancelled_by,
        partner_notified, ack_status, ack_by, ack_by_role, ack_at, ack_note,
        commission_amount, details, created_at,
        guests ( id, name, surname, room, phone, language, stay_status ),
        partners ( id, name, phone, type )
      `)
      .eq('hotel_id', hotelId)
      .eq('status', 'cancelled')
      .is('ack_status', null)
      .order('cancelled_at', { ascending: false })
      .limit(50)

    return Response.json({ cancellations: cancellations || [] })
  } catch (err) {
    await log.error('GET /api/cancellations failed', err, {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — acknowledge a cancellation
export async function PATCH(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // Role check — only these roles can acknowledge
    const allowedRoles = ['manager', 'receptionist', 'supervisor']
    if (!allowedRoles.includes(session.role)) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    const { bookingId, ackStatus, note } = await request.json()

    if (!bookingId || !ackStatus) {
      return Response.json({ error: 'bookingId and ackStatus required' }, { status: 400 })
    }

    const validStatuses = ['acknowledged', 'partner_confirmed', 'issue']
    if (!validStatuses.includes(ackStatus)) {
      return Response.json({ error: `ackStatus must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }

    const booking = await acknowledgeBookingCancellation(bookingId, session, ackStatus, note)

    log.info('Cancellation acknowledged', {
      bookingId,
      ackStatus,
      by:   session.name || session.email,
      role: session.role,
    })

    return Response.json({ status: 'ok', booking })
  } catch (err) {
    await log.error('PATCH /api/cancellations failed', err, {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}
