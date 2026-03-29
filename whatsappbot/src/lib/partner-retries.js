// src/lib/partner-retries.js
// ─────────────────────────────────────────────────────────────
// FIX #1: Retry queue for failed partner alerts
//
// Problem: if sendWhatsApp(partner.phone, alert) fails (Twilio error,
// bad number, network blip), the booking is saved in the DB but the
// partner never receives the alert. The guest is told "confirmed" and
// nobody shows up.
//
// Solution: on failure, insert a row into partner_alert_retries.
// A cron at /api/cron/partner-retries runs every 5 minutes and
// retries with exponential backoff (2min → 10min → 30min).
// After 3 failures the booking is flagged and reception is notified.
//
// Usage in whatsapp-inbound.js / _sendToPartner():
//   import { queuePartnerAlert, markRetrySucceeded } from '../lib/partner-retries.js'
//   try {
//     const msg = await sendWhatsApp(partner.phone, alertMsg)
//     await markRetrySucceeded(booking.id)  // clear any queued retries
//   } catch(e) {
//     await queuePartnerAlert({ hotelId, bookingId, partner, message: alertMsg })
//   }
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import twilio            from 'twilio'
import log, { hotelCtx } from '../../lib/logger.js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

function getTwilio() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

// Backoff schedule: attempt 1 → 2min, attempt 2 → 10min, attempt 3 → 30min
const BACKOFF_MINUTES = [2, 10, 30]

// ── QUEUE A FAILED ALERT ──────────────────────────────────────
export async function queuePartnerAlert({ hotelId, bookingId, partner, message, lastError = null }) {
  const supabase = getSupabase()

  const nextRetryAt = new Date(Date.now() + BACKOFF_MINUTES[0] * 60 * 1000).toISOString()

  const { data, error } = await supabase.from('partner_alert_retries').insert({
    hotel_id:      hotelId,
    booking_id:    bookingId,
    partner_id:    partner.id,
    partner_phone: partner.phone,
    message_body:  message,
    attempt_count: 0,
    max_attempts:  3,
    last_error:    lastError,
    status:        'pending',
    next_retry_at: nextRetryAt,
  }).select().single()

  if (error) {
    log.warn('Failed to queue partner alert retry', { hotelId, bookingId, error: error.message })
  } else {
    log.info('Partner alert queued for retry', { hotelId, bookingId, partnerId: partner.id, nextRetryAt })
  }

  return data
}

// ── MARK A RETRY AS SUCCEEDED ─────────────────────────────────
// Call this after a successful direct send to cancel any queued retries
export async function markRetrySucceeded(bookingId) {
  const supabase = getSupabase()
  await supabase
    .from('partner_alert_retries')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
}

// ── PROCESS PENDING RETRIES ───────────────────────────────────
// Called by /api/cron/partner-retries every 5 minutes.
// Returns a summary of what was processed.
export async function processPendingRetries() {
  const supabase = getSupabase()
  const client   = getTwilio()
  const now      = new Date().toISOString()
  const results  = { attempted: 0, succeeded: 0, failed: 0, exhausted: 0 }

  // Fetch retries that are due
  const { data: retries } = await supabase
    .from('partner_alert_retries')
    .select('*, bookings(status, type, guests(name, room))')
    .eq('status', 'pending')
    .lte('next_retry_at', now)
    .order('next_retry_at', { ascending: true })
    .limit(20)

  if (!retries || retries.length === 0) return results

  for (const retry of retries) {
    results.attempted++

    // If booking is no longer pending (cancelled/confirmed), cancel the retry
    const bookingStatus = retry.bookings?.status
    if (bookingStatus && !['pending'].includes(bookingStatus)) {
      await supabase.from('partner_alert_retries')
        .update({ status: 'cancelled' }).eq('id', retry.id)
      log.info('Partner retry cancelled — booking no longer pending', { bookingId: retry.booking_id, bookingStatus })
      continue
    }

    const toPhone = retry.partner_phone.startsWith('whatsapp:')
      ? retry.partner_phone
      : `whatsapp:${retry.partner_phone}`

    try {
      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to:   toPhone,
        body: retry.message_body,
      })

      // Success — mark done
      await supabase.from('partner_alert_retries')
        .update({ status: 'succeeded', succeeded_at: now })
        .eq('id', retry.id)

      // Update booking with the alert SID (best effort)
      await supabase.from('bookings')
        .update({ partner_alerted_at: now })
        .eq('id', retry.booking_id)
        .catch(() => {})

      results.succeeded++
      log.info('Partner alert retry succeeded', {
        retryId:   retry.id,
        bookingId: retry.booking_id,
        attempt:   retry.attempt_count + 1,
      })

    } catch (err) {
      const newAttemptCount = retry.attempt_count + 1
      results.failed++

      if (newAttemptCount >= retry.max_attempts) {
        // Exhausted — notify reception and give up
        await supabase.from('partner_alert_retries')
          .update({
            status:        'failed',
            attempt_count: newAttemptCount,
            last_error:    err.message,
          })
          .eq('id', retry.id)

        // Mark booking as needing manual intervention
        await supabase.from('bookings')
          .update({ details: { ...retry.bookings?.details, _alert_failed: true } })
          .eq('id', retry.booking_id)
          .catch(() => {})

        // Alert reception — this needs human action
        await supabase.from('notifications').insert({
          hotel_id:  retry.hotel_id,
          type:      'partner_alert_failed',
          title:     `⚠️ Partner not reachable — manual action needed`,
          body:      `Could not reach partner for ${retry.bookings?.type || 'booking'} (${retry.bookings?.guests?.name || 'guest'} · Room ${retry.bookings?.guests?.room || '?'}). Please contact them directly.`,
          link_type: 'booking',
          link_id:   retry.booking_id,
        }).catch(() => {})

        results.exhausted++
        await log.critical('Partner alert exhausted all retries — reception notified', err, {
          hotelId:   retry.hotel_id,
          bookingId: retry.booking_id,
          partnerId: retry.partner_id,
          attempts:  newAttemptCount,
        })

      } else {
        // Schedule next retry with exponential backoff
        const backoffMin  = BACKOFF_MINUTES[newAttemptCount] || 30
        const nextRetryAt = new Date(Date.now() + backoffMin * 60 * 1000).toISOString()

        await supabase.from('partner_alert_retries')
          .update({
            attempt_count: newAttemptCount,
            last_error:    err.message,
            next_retry_at: nextRetryAt,
          })
          .eq('id', retry.id)

        log.warn('Partner alert retry failed — scheduled next attempt', {
          retryId:      retry.id,
          bookingId:    retry.booking_id,
          attempt:      newAttemptCount,
          nextRetryAt,
          error:        err.message,
        })
      }
    }
  }

  return results
}
