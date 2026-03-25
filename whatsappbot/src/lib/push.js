// src/lib/push.js
// Server-side push notification sender
// Uses web-push library (npm install web-push)
//
// ENV VARS NEEDED (generate once with: npx web-push generate-vapid-keys):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_MAILTO=mailto:you@yourhotel.com

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// Initialise web-push (called lazily so it doesn't crash if keys not set)
function initWebPush() {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('VAPID keys not configured — push notifications disabled')
    return false
  }
  webpush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:admin@theresidence.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  return true
}

// ── PRIORITY CONFIG ────────────────────────────────────────
const PRIORITY_CONFIG = {
  urgent: {
    prefix:  '🚨 URGENT',
    badge:   '/icons/badge-urgent.png',
    vibrate: [200, 100, 200, 100, 200],  // strong pattern
    requireInteraction: true,             // stays on screen until dismissed
    tag:     'urgent',                    // replaces previous urgent notification
    silent:  false,
  },
  today: {
    prefix:  '📋',
    badge:   '/icons/badge.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag:     null,                        // each gets its own notification
    silent:  false,
  },
  planned: {
    prefix:  '🗓',
    badge:   '/icons/badge.png',
    vibrate: [],
    requireInteraction: false,
    tag:     'planned-digest',
    silent:  true,                        // no sound for planned
  },
}

// ── BUILD NOTIFICATION PAYLOAD ─────────────────────────────
// This is what the service worker receives and displays
function buildPayload(type, data) {
  switch (type) {

    // New internal ticket for a dept
    case 'new_ticket': {
      const { ticket, guestName, room } = data
      const pc    = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.today
      const title = `${pc.prefix} — ${ticket.department.toUpperCase()}`
      const body  = [
        ticket.category?.replace(/_/g, ' '),
        room ? `Room ${room}` : null,
        guestName || null,
      ].filter(Boolean).join(' · ')
      return {
        title, body,
        badge:   pc.badge,
        vibrate: pc.vibrate,
        requireInteraction: pc.requireInteraction,
        tag:     pc.tag || ticket.id,
        silent:  pc.silent,
        data: {
          url:       '/dashboard',       // tap opens dashboard
          tab:       'live',
          ticketId:  ticket.id,
          priority:  ticket.priority,
          type:      'new_ticket',
        },
      }
    }

    // Guest escalation — for reception
    case 'escalation': {
      const { guestName, room, convId } = data
      return {
        title:   '↩ Guest needs reply',
        body:    `${guestName || 'Guest'} · Room ${room || '?'}`,
        badge:   '/icons/badge-urgent.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        tag:     `escalation-${convId}`,
        silent:  false,
        data: { url:'/dashboard', tab:'live', convId, type:'escalation' },
      }
    }

    // Guest message (bot handoff) — for reception
    case 'guest_message': {
      const { guestName, room, message, convId } = data
      return {
        title:   `💬 ${guestName || 'Guest'} · Room ${room || '?'}`,
        body:    message?.slice(0, 100) || 'New message',
        badge:   '/icons/badge.png',
        vibrate: [200, 100, 200],
        requireInteraction: false,
        tag:     `msg-${convId}`,
        silent:  false,
        data: { url:'/dashboard', tab:'live', convId, type:'guest_message' },
      }
    }

    // Ticket resolved — silent, for reception
    case 'ticket_resolved': {
      const { ticketNum, dept, room } = data
      return {
        title:   `✅ Resolved — ${dept}`,
        body:    `Ticket #${ticketNum} · Room ${room || '?'}`,
        badge:   '/icons/badge.png',
        vibrate: [],
        requireInteraction: false,
        tag:     `resolved-${ticketNum}`,
        silent:  true,
        data: { url:'/dashboard', tab:'live', type:'ticket_resolved' },
      }
    }

    // Planned digest — grouped summary for dept staff
    case 'planned_digest': {
      const { dept, tickets } = data
      const count = tickets.length
      return {
        title:   `🗓 ${count} planned task${count > 1 ? 's' : ''} for today`,
        body:    tickets.slice(0, 3).map(t =>
          `· ${t.category?.replace(/_/g, ' ')} ${t.room ? `(Rm ${t.room})` : ''}`
        ).join('\n'),
        badge:   '/icons/badge.png',
        vibrate: [],
        requireInteraction: false,
        tag:     'planned-digest',
        silent:  true,
        data: { url:'/dashboard', tab:'live', type:'planned_digest' },
      }
    }

    default:
      return null
  }
}

// ── SEND TO SUBSCRIPTIONS ─────────────────────────────────
async function sendToSubscriptions(subscriptions, payload) {
  if (!initWebPush()) return { sent: 0, failed: 0 }
  if (!payload) return { sent: 0, failed: 0 }

  const supabase  = getSupabase()
  const results   = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        sub.subscription,
        JSON.stringify(payload),
        { urgency: payload.data?.priority === 'urgent' ? 'high' : 'normal' }
      )
    )
  )

  // Remove expired/invalid subscriptions (410 Gone = unsubscribed)
  const expired = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const status = r.reason?.statusCode
      if (status === 410 || status === 404) {
        expired.push(subscriptions[i].id)
      } else {
        console.error('Push send error:', r.reason?.message)
      }
    }
  })

  if (expired.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expired)
  }

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected' && !expired.includes(subscriptions[results.indexOf(r)]?.id)).length
  return { sent, failed }
}

// ── PUBLIC API ────────────────────────────────────────────

// Notify all dept staff when a new ticket is created
export async function notifyDeptStaff({ hotelId, ticket, guestName, room }) {
  // Skip planned — they go in the daily digest
  if (ticket.priority === 'planned') return

  const supabase = getSupabase()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('department', ticket.department)

  if (!subs || subs.length === 0) return

  const payload = buildPayload('new_ticket', { ticket, guestName, room })
  return sendToSubscriptions(subs, payload)
}

// Notify all reception staff when guest escalates
export async function notifyReceptionEscalation({ hotelId, guestName, room, convId }) {
  const supabase = getSupabase()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('role', 'receptionist')

  if (!subs || subs.length === 0) return

  const payload = buildPayload('escalation', { guestName, room, convId })
  return sendToSubscriptions(subs, payload)
}

// Notify reception of new guest message (bot handoff)
export async function notifyReceptionMessage({ hotelId, guestName, room, message, convId }) {
  const supabase = getSupabase()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('role', 'receptionist')

  if (!subs || subs.length === 0) return

  const payload = buildPayload('guest_message', { guestName, room, message, convId })
  return sendToSubscriptions(subs, payload)
}

// Notify reception silently when ticket is resolved
export async function notifyReceptionResolved({ hotelId, ticketNum, dept, room }) {
  const supabase = getSupabase()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('role', 'receptionist')

  if (!subs || subs.length === 0) return

  const payload = buildPayload('ticket_resolved', { ticketNum, dept, room })
  return sendToSubscriptions(subs, payload)
}

// Send planned digest to a specific dept (called by cron at 9am)
export async function sendPlannedDigest({ hotelId, department, tickets }) {
  if (!tickets || tickets.length === 0) return

  const supabase = getSupabase()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('department', department)

  if (!subs || subs.length === 0) return

  const payload = buildPayload('planned_digest', { dept: department, tickets })
  const result  = await sendToSubscriptions(subs, payload)

  // Log the digest so we don't double-send
  await supabase.from('push_digest_log').insert({
    hotel_id:   hotelId,
    department,
    ticket_ids: tickets.map(t => t.id),
  })

  return result
}
