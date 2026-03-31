// src/lib/ticketing.js
// ============================================================
// INTERNAL TICKETING SYSTEM
//
// Flow:
//   Staff creates ticket in portal
//   → Alert sent to department supervisor
//   → No 👍 in 10 min → escalate to full team
//   → No 👍 in 20 min → alert General Manager
//   → Team member taps 👍 → ticket accepted
//   → Team member taps ✅ → ticket resolved
//   → Optional: guest auto-notified when resolved
// ============================================================

import { supabase }     from './supabase.js'
import { sendWhatsApp } from './twilio.js'

// ── ESCALATION TIMINGS ────────────────────────────────────────
const ESCALATION = {
  normal: {
    supervisor_timeout_min: 10,  // escalate to team after 10 min
    team_timeout_min:       20,  // escalate to manager after 20 min
  },
  urgent: {
    supervisor_timeout_min: 5,
    team_timeout_min:       10,
  }
}

// ── TICKET CATEGORIES ─────────────────────────────────────────
export const TICKET_CATEGORIES = {
  maintenance: [
    { key: 'ac_heating',    label: 'AC / Heating' },
    { key: 'plumbing',      label: 'Plumbing / Water' },
    { key: 'electrical',    label: 'Electrical / Lights' },
    { key: 'tv_wifi',       label: 'TV / WiFi' },
    { key: 'door_lock',     label: 'Door / Lock' },
    { key: 'fix_something', label: 'Fix something' },
  ],
  housekeeping: [
    { key: 'towels',        label: 'Extra towels' },
    { key: 'room_clean',    label: 'Room cleaning' },
    { key: 'turndown',      label: 'Turndown service' },
    { key: 'pillows',       label: 'Pillows / Bedding' },
    { key: 'toiletries',    label: 'Toiletries' },
    { key: 'minibar',       label: 'Minibar restock' },
  ],
  concierge: [
    { key: 'luggage_collect', label: 'Collect luggage' },
    { key: 'luggage_store',   label: 'Luggage storage' },
    { key: 'deliver_room',    label: 'Deliver to room' },
    { key: 'wakeup_call',     label: 'Wake-up call' },
    { key: 'baby_cot',        label: 'Baby cot' },
    { key: 'iron',            label: 'Iron / Ironing board' },
  ],
  fnb: [
    { key: 'room_service',  label: 'Room service' },
    { key: 'welcome_drink', label: 'Welcome drink' },
    { key: 'dietary',       label: 'Special dietary' },
  ],
}

// ── FORMAT SUPERVISOR ALERT ───────────────────────────────────

export function formatTicketAlert(ticket, guest, hotel, contactName) {
  const priority = ticket.priority === 'urgent' ? '🔴 URGENT' : '🔧 Normal'
  const guestLine = guest
    ? `Guest: ${guest.name || ''} ${guest.surname || ''} · Room ${ticket.room || guest.room || '?'}`
    : ticket.room ? `Room: ${ticket.room}` : 'No room specified'

  return `${priority} — TICKET #${ticket.ticket_number}
Hotel: ${hotel.name}
${guestLine}
Issue: ${ticket.description}
Department: ${ticket.department.toUpperCase()}
Category: ${ticket.category.replace(/_/g, ' ')}
Reported: ${new Date(ticket.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by ${ticket.created_by}
──────────────────────
Reply 👍 to accept this ticket
Reply ✅ when issue is resolved
Reply ❌ if cannot fix (will escalate)`
}

export function formatTeamAlert(ticket, guest, hotel) {
  const guestLine = guest
    ? `Guest: ${guest.name || ''} ${guest.surname || ''} · Room ${ticket.room || guest.room || '?'}`
    : ticket.room ? `Room: ${ticket.room}` : ''

  return `⚠️ ESCALATED — No response from supervisor
TICKET #${ticket.ticket_number} · ${hotel.name}
${guestLine}
Issue: ${ticket.description}
Open for 10+ minutes — please respond immediately
──────────────────────
Reply 👍 to accept · ✅ when resolved`
}

export function formatManagerAlert(ticket, guest, hotel) {
  const guestLine = guest
    ? `Guest: ${guest.name || ''} ${guest.surname || ''} · Room ${ticket.room || guest.room || '?'}`
    : ticket.room ? `Room: ${ticket.room}` : ''

  return `🚨 ESCALATION ALERT — General Manager
TICKET #${ticket.ticket_number} · ${hotel.name}
${guestLine}
Issue: ${ticket.description}
No response from ${ticket.department} team after 20 minutes.
Immediate action required.
──────────────────────
Reply 👍 to acknowledge`
}

export function formatResolutionNotification(ticket, guest, language) {
  // Optional: sent to guest when ticket resolved
  const msgs = {
    en: `Good news! The issue in your room has been resolved. Please let me know if you need anything else. 😊`,
    ru: `Хорошие новости! Проблема в вашем номере устранена. Дайте знать, если нужна помощь. 😊`,
    he: `חדשות טובות! הבעיה בחדרך טופלה. אנא הודע לי אם תצטרך עוד משהו. 😊`,
  }
  return msgs[language] || msgs.en
}

// ── CREATE TICKET ─────────────────────────────────────────────

export async function createTicket({
  hotelId,
  guestId = null,
  department,
  category,
  description,
  room = null,
  priority = 'normal',
  createdBy = 'staff',
}) {
  // 1. Insert ticket
  const { data: ticket, error } = await supabase
    .from('internal_tickets')
    .insert({
      hotel_id:    hotelId,
      guest_id:    guestId,
      department,
      category,
      description,
      room,
      priority,
      status:      'pending',
      created_by:  createdBy,
    })
    .select()
    .single()

  if (error) throw error

  // 2. Log creation event
  await logEvent(ticket.id, 'created', createdBy, description)

  // 3. Load hotel info for alert
  const { data: hotel } = await supabase
    .from('hotels').select('*').eq('id', hotelId).single()

  // 4. Load guest info if provided
  let guest = null
  if (guestId) {
    const { data } = await supabase
      .from('guests').select('*').eq('id', guestId).single()
    guest = data
  }

  // 5. Send first alert to supervisor
  await sendToSupervisor(ticket, guest, hotel)

  return ticket
}

// ── SHIFT HELPERS ─────────────────────────────────────────────

// Returns the on-duty supervisor(s) for a department right now.
// Queries the shifts table (workers + shift_patterns + shift_overrides)
// to find staff whose shift covers the current time today.
// Falls back to all supervisors + managers if nobody is on duty.
async function getOnDutySupervisors(hotelId, department) {
  const now       = new Date()
  const todayDay  = now.getDay()           // 0=Sun … 6=Sat
  const todayDate = now.toISOString().split('T')[0]
  const nowMins   = now.getHours() * 60 + now.getMinutes()

  // Helper: "HH:MM" → total minutes since midnight
  const toMins = (t) => {
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }

  // Helper: does a shift interval cover nowMins? Handles overnight shifts.
  const coversNow = (start, end) => {
    const s = toMins(start)
    const e = toMins(end)
    if (s === null || e === null) return false
    if (e > s) return nowMins >= s && nowMins < e        // same-day shift
    return nowMins >= s || nowMins < e                    // overnight shift
  }

  // 1. Load all supervisor workers for this hotel+department
  const { data: workers } = await supabase
    .from('workers')
    .select('id, name, phone, department_contacts_id')
    .eq('hotel_id', hotelId)
    .eq('active', true)

  if (!workers || workers.length === 0) return []

  // 2. Filter to supervisors via department_contacts
  const { data: supervisorContacts } = await supabase
    .from('department_contacts')
    .select('id, phone, name')
    .eq('hotel_id', hotelId)
    .eq('department', department)
    .eq('role', 'supervisor')
    .eq('active', true)

  if (!supervisorContacts || supervisorContacts.length === 0) return []

  const supContactIds = new Set(supervisorContacts.map(c => c.id))
  const supervisorWorkers = workers.filter(w => supContactIds.has(w.department_contacts_id))

  if (supervisorWorkers.length === 0) return supervisorContacts // fallback

  // 3. For each supervisor worker, check overrides first, then weekly pattern
  const onDuty = []
  for (const worker of supervisorWorkers) {
    // Check day override first
    const { data: override } = await supabase
      .from('shift_overrides')
      .select('*')
      .eq('worker_id', worker.id)
      .eq('date', todayDate)
      .single()

    if (override) {
      if (override.is_off) continue        // day marked off — skip
      if (coversNow(override.start_time, override.end_time)) {
        onDuty.push(worker)
        continue
      }
      continue // override exists but doesn't cover now
    }

    // Fall back to weekly pattern
    const { data: pattern } = await supabase
      .from('shift_patterns')
      .select('*')
      .eq('worker_id', worker.id)
      .eq('day_of_week', todayDay)
      .eq('active', true)
      .single()

    if (pattern && !pattern.is_off && coversNow(pattern.start_time, pattern.end_time)) {
      onDuty.push(worker)
    }
  }

  return onDuty
}

// Returns all manager/admin department_contacts for a hotel
async function getManagerContacts(hotelId) {
  const { data } = await supabase
    .from('department_contacts')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('role', ['manager', 'admin'])
    .eq('active', true)
  return data || []
}

// ── SEND TO SUPERVISOR (shift-aware) ──────────────────────────

async function sendToSupervisor(ticket, guest, hotel) {
  // 1. Find on-duty supervisors for this department right now
  const onDuty = await getOnDutySupervisors(hotel.id, ticket.department)

  // 2. Fallback: no on-duty supervisor → alert ALL supervisors + managers
  if (!onDuty || onDuty.length === 0) {
    console.warn(
      `Ticket #${ticket.ticket_number} — no on-duty supervisor for ${ticket.department} · alerting all supervisors + managers`
    )
    await logEvent(ticket.id, 'escalation_note', 'system',
      `No on-duty supervisor found for ${ticket.department} — sending to all supervisors and managers`)

    const { data: allSups } = await supabase
      .from('department_contacts')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('department', ticket.department)
      .eq('role', 'supervisor')
      .eq('active', true)

    const managers = await getManagerContacts(hotel.id)
    const fallback = [...(allSups || []), ...managers]

    if (fallback.length === 0) {
      console.error(`No supervisors or managers found for hotel ${hotel.id}`)
      return
    }

    const message = formatTicketAlert(ticket, guest, hotel, 'Team')
    await Promise.all(fallback.map(c => sendWhatsApp(c.phone, message).catch(() => {})))

    const timeoutMin  = ESCALATION[ticket.priority]?.supervisor_timeout_min || 10
    const escalateDue = new Date(Date.now() + timeoutMin * 60 * 1000)
    await supabase.from('internal_tickets').update({
      escalation_level:  0,
      escalation_due_at: escalateDue.toISOString(),
    }).eq('id', ticket.id)

    return
  }

  // 3. Alert all on-duty supervisors (usually 1, could be 2 on overlapping shifts)
  const message    = formatTicketAlert(ticket, guest, hotel, onDuty.map(w => w.name).join(' / '))
  const timeoutMin = ESCALATION[ticket.priority]?.supervisor_timeout_min || 10
  const escalateDue = new Date(Date.now() + timeoutMin * 60 * 1000)

  await Promise.all(onDuty.map(w => sendWhatsApp(w.phone, message).catch(() => {})))

  // Record first on-duty supervisor as primary assignee
  const primary = onDuty[0]
  await supabase.from('internal_tickets').update({
    assigned_to_name:  onDuty.map(w => w.name).join(' / '),
    assigned_to_phone: primary.phone,
    escalation_level:  0,
    escalation_due_at: escalateDue.toISOString(),
  }).eq('id', ticket.id)

  await logEvent(ticket.id, 'alert_sent', 'system',
    `Alert sent to on-duty supervisor(s): ${onDuty.map(w => w.name).join(', ')} · escalates in ${timeoutMin}min`)

  console.log(
    `Ticket #${ticket.ticket_number} → on-duty supervisor(s): ${onDuty.map(w => w.name).join(', ')} · escalates in ${timeoutMin}min`
  )
}

// ── SEND TO TEAM ──────────────────────────────────────────────

async function sendToTeam(ticket, guest, hotel) {
  // Get all team members for this department
  const { data: team } = await supabase
    .from('department_contacts')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('department', ticket.department)
    .eq('role', 'team')
    .eq('active', true)

  if (!team || team.length === 0) {
    console.warn(`No team members for ${ticket.department} — escalating to manager`)
    await sendToManager(ticket, guest, hotel)
    return
  }

  const message = formatTeamAlert(ticket, guest, hotel)

  // Send to all team members simultaneously
  await Promise.all(team.map(member => sendWhatsApp(member.phone, message)))

  // Calculate next escalation to manager
  const timeoutMin = ESCALATION[ticket.priority]?.team_timeout_min || 20
  const escalateDue = new Date(Date.now() + timeoutMin * 60 * 1000)

  await supabase
    .from('internal_tickets')
    .update({
      escalation_level:  1,
      escalation_due_at: escalateDue.toISOString(),
      status:            'escalated',
    })
    .eq('id', ticket.id)

  await logEvent(ticket.id, 'escalated', 'system',
    `Escalated to team (${team.length} members) · manager alert at ${escalateDue.toLocaleTimeString()}`)

  console.log(`Ticket #${ticket.ticket_number} → team (${team.length} members) · manager in ${timeoutMin}min`)
}

// ── SEND TO MANAGER ───────────────────────────────────────────

async function sendToManager(ticket, guest, hotel) {
  // Alert ALL managers/admins simultaneously — not just one
  const managers = await getManagerContacts(hotel.id)

  if (!managers || managers.length === 0) {
    console.error(`No managers found for hotel ${hotel.id} — ticket #${ticket.ticket_number} unassigned`)
    await logEvent(ticket.id, 'escalation_error', 'system', 'No manager contacts found — ticket unattended')
    return
  }

  const message = formatManagerAlert(ticket, guest, hotel)
  await Promise.all(managers.map(m => sendWhatsApp(m.phone, message).catch(() => {})))

  await supabase
    .from('internal_tickets')
    .update({
      escalation_level:  2,
      escalation_due_at: null,   // no further escalation after manager
      status:            'escalated',
    })
    .eq('id', ticket.id)

  const names = managers.map(m => m.name).join(', ')
  await logEvent(ticket.id, 'escalated', 'system', `Escalated to manager(s): ${names}`)
  console.log(`Ticket #${ticket.ticket_number} → manager(s): ${names}`)
}

// ── HANDLE STAFF REPLY ────────────────────────────────────────

export async function handleTicketReply(from, message) {
  const msg = message.trim().toLowerCase()

  // Find the most recent pending/escalated ticket assigned to this person
  // OR any ticket where this person is in the team
  const { data: ticket, error } = await supabase
    .from('internal_tickets')
    .select(`*, hotels(*), guests(*)`)
    .or(`assigned_to_phone.eq.${from},status.in.(pending,escalated)`)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Also check escalated tickets for team members
  if (error || !ticket) {
    const { data: escalatedTicket } = await supabase
      .from('internal_tickets')
      .select(`*, hotels(*), guests(*)`)
      .eq('status', 'escalated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!escalatedTicket) {
      console.log(`No open ticket found for ${from}`)
      return false
    }

    return await processReply(escalatedTicket, from, message)
  }

  return await processReply(ticket, from, message)
}

async function processReply(ticket, from, message) {
  const msg = message.trim()

  // 👍 = accepted / taking ownership
  if (msg.includes('👍') || msg.toLowerCase() === 'ok' || msg.toLowerCase() === 'yes') {
    // Cancel escalation timer
    await supabase
      .from('internal_tickets')
      .update({
        status:            'in_progress',
        assigned_to_phone: from,
        escalation_due_at: null,
        accepted_at:       new Date().toISOString(),
      })
      .eq('id', ticket.id)

    await logEvent(ticket.id, 'accepted', from, 'Ticket accepted')

    // Get staff name from contacts
    const { data: contact } = await supabase
      .from('department_contacts')
      .select('name')
      .eq('phone', from)
      .single()

    const name = contact?.name || from
    await sendWhatsApp(from, `✅ Got it! Ticket #${ticket.ticket_number} is now assigned to you.\n\nRoom: ${ticket.room || '?'}\nIssue: ${ticket.description}\n\nReply ✅ when resolved.`)

    console.log(`Ticket #${ticket.ticket_number} accepted by ${name}`)
    return true
  }

  // ✅ = resolved
  if (msg.includes('✅') || msg.toLowerCase() === 'done' || msg.toLowerCase() === 'fixed' || msg.toLowerCase() === 'resolved') {
    await supabase
      .from('internal_tickets')
      .update({
        status:           'resolved',
        resolved_at:      new Date().toISOString(),
        escalation_due_at: null,
      })
      .eq('id', ticket.id)

    await logEvent(ticket.id, 'resolved', from, 'Marked as resolved')

    await sendWhatsApp(from, `🎉 Ticket #${ticket.ticket_number} marked as resolved. Thank you!`)

    // Optionally notify guest
    if (ticket.guest_id && ticket.guests) {
      const guest   = ticket.guests
      const hotel   = ticket.hotels
      const lang    = guest.language || 'en'
      const guestMsg = formatResolutionNotification(ticket, guest, lang)
      if (guest.phone) {
        await sendWhatsApp(guest.phone, guestMsg)
        await logEvent(ticket.id, 'guest_notified', 'system', 'Guest notified of resolution')
      }
    }

    console.log(`Ticket #${ticket.ticket_number} resolved`)
    return true
  }

  // ❌ = cannot fix
  if (msg.includes('❌') || msg.toLowerCase() === 'no' || msg.toLowerCase().includes('cannot')) {
    const hotel = ticket.hotels
    const guest = ticket.guests

    await supabase
      .from('internal_tickets')
      .update({ status: 'escalated', escalation_level: (ticket.escalation_level || 0) + 1 })
      .eq('id', ticket.id)

    await logEvent(ticket.id, 'escalated', from, 'Staff reported cannot fix — escalating')
    await sendToManager(ticket, guest, hotel)
    await sendWhatsApp(from, `Understood. Ticket #${ticket.ticket_number} has been escalated to the manager.`)

    return true
  }

  return false
}

// ── ESCALATION CHECKER ────────────────────────────────────────
// Called by a scheduled job every 2 minutes
// In Vercel: use /api/escalation-check route called by cron

export async function checkEscalations() {
  const now = new Date().toISOString()

  // Find all tickets where escalation is due
  const { data: tickets, error } = await supabase
    .from('internal_tickets')
    .select(`*, hotels(*), guests(*)`)
    .lt('escalation_due_at', now)
    .in('status', ['pending', 'escalated'])
    .not('escalation_due_at', 'is', null)

  if (error || !tickets || tickets.length === 0) return

  console.log(`Escalation check: ${tickets.length} tickets due`)

  for (const ticket of tickets) {
    const hotel = ticket.hotels
    const guest = ticket.guests

    if (ticket.escalation_level === 0) {
      // Supervisor didn't respond → send to team
      console.log(`Ticket #${ticket.ticket_number} — supervisor timeout → escalating to team`)
      await sendToTeam(ticket, guest, hotel)
    } else if (ticket.escalation_level === 1) {
      // Team didn't respond → send to manager
      console.log(`Ticket #${ticket.ticket_number} — team timeout → escalating to manager`)
      await sendToManager(ticket, guest, hotel)
    }
    // escalation_level 2 = already at manager, no further escalation
  }
}

// ── TICKET HISTORY HELPERS ────────────────────────────────────

async function logEvent(ticketId, eventType, actor, note) {
  await supabase
    .from('ticket_events')
    .insert({ ticket_id: ticketId, event_type: eventType, actor, note })
}

export async function getTicketHistory(ticketId) {
  const { data } = await supabase
    .from('ticket_events')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  return data || []
}

export async function getOpenTickets(hotelId) {
  const { data } = await supabase
    .from('v_open_tickets')
    .select('*')
    .eq('hotel_id', hotelId)
  return data || []
}

export async function getTicketStats(hotelId) {
  const { data } = await supabase
    .from('internal_tickets')
    .select('status, priority, department, created_at, resolved_at, accepted_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  if (!data) return {}

  const total    = data.length
  const resolved = data.filter(t => t.status === 'resolved').length
  const open     = data.filter(t => !['resolved','cancelled'].includes(t.status)).length

  // Average resolution time in minutes
  const resolved_times = data
    .filter(t => t.resolved_at && t.created_at)
    .map(t => (new Date(t.resolved_at) - new Date(t.created_at)) / 60000)
  const avg_resolution = resolved_times.length
    ? Math.round(resolved_times.reduce((a, b) => a + b, 0) / resolved_times.length)
    : null

  return { total, resolved, open, avg_resolution_min: avg_resolution }
}
