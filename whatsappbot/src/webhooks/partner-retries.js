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
// Also sends a one-time guest holding message after 10 min pending.
// Returns a summary of what was processed.
export async function processPendingRetries() {
  const supabase = getSupabase()
  const client   = getTwilio()
  const now      = new Date().toISOString()
  const results  = { attempted: 0, succeeded: 0, failed: 0, exhausted: 0, holding_sent: 0 }

  // ── STEP 1: Send one-time holding messages to guests waiting >10 min ──
  // Find bookings that are: pending, partner alerted, no holding message sent yet,
  // and older than 10 minutes.
  const holdingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: pendingBookings } = await supabase
    .from('bookings')
    .select('*, guests(name, phone, language, room, guest_type), partners(name, type)')
    .eq('status', 'pending')
    .eq('holding_sent', false)
    .not('partner_alert_sid', 'is', null)  // partner has been alerted
    .lt('created_at', holdingCutoff)

  if (pendingBookings && pendingBookings.length > 0) {
    for (const booking of pendingBookings) {
      const guest = booking.guests
      if (!guest?.phone) continue

      const holdingMsg = buildHoldingMessage(booking, guest)
      const toPhone    = guest.phone.startsWith('whatsapp:') ? guest.phone : `whatsapp:${guest.phone}`

      try {
        await client.messages.create({
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to:   toPhone,
          body: holdingMsg,
        })

        // Mark holding message sent so we never send it again for this booking
        await supabase
          .from('bookings')
          .update({ holding_sent: true, holding_sent_at: new Date().toISOString() })
          .eq('id', booking.id)

        results.holding_sent++
        log.info('Guest holding message sent', {
          bookingId: booking.id,
          guestName: guest.name,
          type:      booking.type,
        })
      } catch (err) {
        log.warn('Failed to send guest holding message', {
          bookingId: booking.id,
          error: err.message,
        })
      }
    }
  }

  // ── STEP 2: Retry failed partner alerts (existing logic) ──
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
        // Exhausted — mark partner inactive, alert manager, notify staff to rebook manually
        await supabase.from('partner_alert_retries')
          .update({
            status:        'failed',
            attempt_count: newAttemptCount,
            last_error:    err.message,
          })
          .eq('id', retry.id)

        // Mark booking as failed
        await supabase.from('bookings')
          .update({ status: 'declined', details: { ...retry.bookings?.details, _alert_failed: true, _failure_reason: 'partner_unreachable' } })
          .eq('id', retry.booking_id)
          .catch(() => {})

        // Mark partner as inactive (unreachable)
        try {
          await supabase.from('partners')
            .update({ active: false, _unreachable_at: new Date().toISOString() })
            .eq('id', retry.partner_id)
        } catch {}

        // Better: use a dedicated unreachable flag column
        try {
          await supabase.from('partners')
            .update({ unreachable: true, unreachable_since: new Date().toISOString() })
            .eq('id', retry.partner_id)
        } catch {}

        // Load partner + hotel info for the alert
        let partner = null, hotel = null
        try { ({ data: partner } = await supabase.from('partners').select('name, phone').eq('id', retry.partner_id).single()) } catch {}
        try { ({ data: hotel }   = await supabase.from('hotels').select('name, config').eq('id', retry.hotel_id).single()) } catch {}
        const guestName  = retry.bookings?.guests?.name || 'Guest'
        const guestRoom  = retry.bookings?.guests?.room || '?'
        const bookingType = retry.bookings?.type || 'booking'
        const partnerName = partner?.name || 'Partner'

        // Dashboard notification — urgent, for manager
        await supabase.from('notifications').insert({
          hotel_id:  retry.hotel_id,
          type:      'partner_unreachable',
          title:     `🔴 ${partnerName} unreachable — rebook manually`,
          body:      `3 failed attempts. ${guestName} · Room ${guestRoom} needs a ${bookingType}. Please contact an alternative partner and WhatsApp the guest directly.`,
          link_type: 'booking',
          link_id:   retry.booking_id,
          urgent:    true,
        }).catch(() => {})

        // WhatsApp alert to manager phone (if configured)
        const managerPhone = hotel?.config?.staff_digest_phone || hotel?.config?.manager_phone
        if (managerPhone) {
          try {
            const client = getTwilio()
            const to = managerPhone.startsWith('whatsapp:') ? managerPhone : `whatsapp:${managerPhone}`
            await client.messages.create({
              from: process.env.TWILIO_WHATSAPP_NUMBER,
              to,
              body: `🔴 *PARTNER UNREACHABLE — Action needed*\n\nPartner: ${partnerName}\nGuest: ${guestName} · Room ${guestRoom}\nBooking: ${bookingType}\n\n3 alert attempts failed. Partner has been marked inactive.\n\nPlease arrange an alternative and message the guest directly.\n\nReactivate partner in Settings once resolved.`,
            })
          } catch(whatsappErr) {
            log.warn('Manager WhatsApp alert failed', { error: whatsappErr.message })
          }
        }

        results.exhausted++
        await log.critical('Partner unreachable — marked inactive, manager alerted', err, {
          hotelId:     retry.hotel_id,
          bookingId:   retry.booking_id,
          partnerId:   retry.partner_id,
          partnerName,
          attempts:    newAttemptCount,
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

// ── HOLDING MESSAGE BUILDER ───────────────────────────────────
// Sent to the guest after 10 min of no partner reply.
// One message per booking, never repeated.
function buildHoldingMessage(booking, guest) {
  const lang = guest?.language || 'en'
  const type = booking.type || 'service'

  const emoji = {
    taxi:       '🚗',
    restaurant: '🍽️',
    activity:   '⛵',
  }[type] || '📋'

  const messages = {
    taxi: {
      en: `We're confirming your taxi booking ${emoji} — our partner is being contacted and we'll update you shortly. Thank you for your patience!`,
      ru: `Мы подтверждаем ваш заказ такси ${emoji} — связываемся с партнёром и скоро сообщим вам результат. Спасибо за ожидание!`,
      he: `אנו מאשרים את הזמנת המונית שלך ${emoji} — אנחנו בקשר עם השותף ונעדכן אותך בקרוב. תודה על סבלנותך!`,
      de: `Wir bestätigen Ihre Taxibuchung ${emoji} — unser Partner wird kontaktiert und wir melden uns gleich. Danke für Ihre Geduld!`,
      fr: `Nous confirmons votre réservation de taxi ${emoji} — notre partenaire est contacté et nous vous informerons bientôt. Merci de votre patience !`,
      es: `Estamos confirmando su reserva de taxi ${emoji} — estamos contactando al socio y le informaremos pronto. ¡Gracias por su paciencia!`,
      it: `Stiamo confermando la sua prenotazione taxi ${emoji} — stiamo contattando il partner e la aggiorneremo a breve. Grazie per la pazienza!`,
      zh: `我们正在确认您的出租车预订 ${emoji} — 正在联系合作伙伴，稍后将为您更新。感谢您的耐心！`,
      ar: `نحن نؤكد حجز سيارة الأجرة ${emoji} — يتم الاتصال بشريكنا وسنخبرك قريبًا. شكرًا لصبرك!`,
      el: `Επιβεβαιώνουμε την κράτηση ταξί σας ${emoji} — επικοινωνούμε με τον συνεργάτη και θα σας ενημερώσουμε σύντομα. Ευχαριστούμε για την υπομονή σας!`,
    },
    restaurant: {
      en: `We're confirming your table reservation ${emoji} — the restaurant is being contacted and we'll update you shortly. Thank you!`,
      ru: `Мы подтверждаем вашу бронь стола ${emoji} — связываемся с рестораном и скоро сообщим вам. Спасибо!`,
      he: `אנו מאשרים את הזמנת השולחן שלך ${emoji} — אנחנו בקשר עם המסעדה ונעדכן אותך בקרוב. תודה!`,
      de: `Wir bestätigen Ihre Tischreservierung ${emoji} — das Restaurant wird kontaktiert und wir melden uns bald. Danke!`,
      fr: `Nous confirmons votre réservation de table ${emoji} — le restaurant est contacté et nous vous informerons bientôt. Merci !`,
      el: `Επιβεβαιώνουμε την κράτηση τραπεζιού σας ${emoji} — επικοινωνούμε με το εστιατόριο και θα σας ενημερώσουμε σύντομα. Ευχαριστούμε!`,
    },
    activity: {
      en: `We're confirming your activity booking ${emoji} — our partner is being contacted and we'll update you shortly. Thank you for your patience!`,
      ru: `Мы подтверждаем вашу активность ${emoji} — связываемся с партнёром и скоро сообщим вам. Спасибо!`,
      he: `אנו מאשרים את הזמנת הפעילות שלך ${emoji} — ניצור קשר עם השותף ונחזור אליך בקרוב. תודה!`,
      el: `Επιβεβαιώνουμε την κράτηση δραστηριότητάς σας ${emoji} — επικοινωνούμε με τον συνεργάτη και θα σας ενημερώσουμε σύντομα. Ευχαριστούμε!`,
    },
  }

  const typeMsgs = messages[type] || messages.taxi
  return (typeMsgs[lang] || typeMsgs.en)

}
