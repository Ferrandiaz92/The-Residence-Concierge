// src/lib/cancellations.js
// ─────────────────────────────────────────────────────────────
// FEATURE #2: Booking cancellation flows
//
// Three distinct flows:
//
// Flow A — Facility (visitor / internal service)
//   Bot cancels the internal_ticket directly.
//   No partner to notify, no commission to reverse.
//   Notify reception dashboard only.
//
// Flow B — Partner booking (taxi, restaurant, activity)
//   Bot finds the booking, notifies the partner via WhatsApp,
//   reverses commission, marks cancelled.
//   Creates a cancellation alert card for reception to acknowledge.
//
// Flow C — Room booking
//   Bot NEVER cancels. Immediately escalates to reception.
//   Human handles refunds, PMS, cancellation policy.
//
// Claude emits:
//   [CANCEL_FACILITY]{"type":"tennis","time":"15:00"}
//   [CANCEL_BOOKING]{"type":"taxi"}
//   [CANCEL_ROOM] — no JSON needed, always escalates
// ─────────────────────────────────────────────────────────────

import { supabase }     from './supabase.js'
import { sendWhatsApp } from './twilio.js'
import log, { hotelCtx, guestCtx } from '../../lib/logger.js'

// ── TAG PARSERS ───────────────────────────────────────────────

export function parseCancelFacility(aiResponse) {
  const marker = '[CANCEL_FACILITY]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasCancelFacility: false, cleanResponse: aiResponse }
  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim().split('\n')[0]
    const data    = JSON.parse(jsonStr)
    return {
      hasCancelFacility: true,
      facilityCancel:    data,
      cleanResponse:     aiResponse.slice(0, idx).trim(),
    }
  } catch {
    return { hasCancelFacility: false, cleanResponse: aiResponse }
  }
}

export function parseCancelBooking(aiResponse) {
  const marker = '[CANCEL_BOOKING]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasCancelBooking: false, cleanResponse: aiResponse }
  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim().split('\n')[0]
    const data    = JSON.parse(jsonStr)
    return {
      hasCancelBooking: true,
      bookingCancel:    data,
      cleanResponse:    aiResponse.slice(0, idx).trim(),
    }
  } catch {
    return { hasCancelBooking: false, cleanResponse: aiResponse }
  }
}

export function parseCancelRoom(aiResponse) {
  return aiResponse.includes('[CANCEL_ROOM]')
}

// ── FLOW A: Cancel facility (internal ticket) ─────────────────
export async function cancelFacility(facilityCancel, hotel, guest, convId) {
  const hCtx = hotelCtx(hotel)
  const gCtx = guestCtx(guest)

  try {
    // Find the most recent open facility ticket for this guest
    const { data: ticket } = await supabase
      .from('internal_tickets')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('guest_id', guest.id)
      .eq('category', 'facility_booking')
      .not('status', 'in', '("resolved","cancelled")')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!ticket) {
      log.warn('Cancel facility: no open ticket found', { ...hCtx, ...gCtx })
      return { success: false, reason: 'no_ticket_found' }
    }

    // Cancel the ticket
    await supabase
      .from('internal_tickets')
      .update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'guest',
      })
      .eq('id', ticket.id)

    // Notify reception dashboard
    await supabase.from('notifications').insert({
      hotel_id:  hotel.id,
      type:      'facility_cancelled',
      title:     `🚫 Facility cancelled — ${ticket.description?.slice(0, 40) || 'facility booking'}`,
      body:      `${guest.name || 'Guest'}${guest.room ? ` · Room ${guest.room}` : ''} cancelled their booking`,
      link_type: 'ticket',
      link_id:   ticket.id,
    }).catch(() => {})

    log.info('Facility cancelled', { ...hCtx, ...gCtx, ticketId: ticket.id })
    return { success: true, ticket }

  } catch (err) {
    await log.error('cancelFacility failed', err, { ...hCtx, ...gCtx })
    return { success: false, reason: err.message }
  }
}

// ── FLOW B: Cancel partner booking (taxi, restaurant, activity) ──
export async function cancelPartnerBooking(bookingCancel, hotel, guest, convId) {
  const hCtx = hotelCtx(hotel)
  const gCtx = guestCtx(guest)

  try {
    // Find most recent active booking of this type for this guest
    const query = supabase
      .from('bookings')
      .select('*, partners(name, phone)')
      .eq('hotel_id', hotel.id)
      .eq('guest_id', guest.id)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)

    // Filter by type if provided
    if (bookingCancel.type) {
      query.eq('type', bookingCancel.type)
    }

    const { data: booking } = await query.single()

    if (!booking) {
      log.warn('Cancel booking: no active booking found', { ...hCtx, ...gCtx, type: bookingCancel.type })
      return { success: false, reason: 'no_booking_found' }
    }

    const partner = booking.partners

    // Step 1: Notify partner via WhatsApp — most critical step
    let partnerNotified = false
    if (partner?.phone) {
      try {
        const cancelMsg = buildPartnerCancellationMsg(booking, guest, hotel)
        await sendWhatsApp(partner.phone, cancelMsg)
        partnerNotified = true
        log.info('Partner notified of cancellation', { partnerId: partner.id, bookingId: booking.id })
      } catch (err) {
        // Queue for retry via partner-retries system
        await supabase.from('partner_alert_retries').insert({
          hotel_id:      hotel.id,
          booking_id:    booking.id,
          partner_id:    booking.partner_id,
          partner_phone: partner.phone,
          message_body:  buildPartnerCancellationMsg(booking, guest, hotel),
          attempt_count: 0,
          max_attempts:  3,
          last_error:    err.message,
          status:        'pending',
          next_retry_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        }).catch(() => {})
        log.warn('Partner cancellation notify failed — queued for retry', { bookingId: booking.id, error: err.message })
      }
    }

    // Step 2: Cancel the booking + reverse commission
    await supabase
      .from('bookings')
      .update({
        status:           'cancelled',
        cancelled_at:     new Date().toISOString(),
        cancelled_by:     'guest',
        cancel_reason:    bookingCancel.reason || null,
        partner_notified: partnerNotified,
        ack_status:       null,   // reception must acknowledge
      })
      .eq('id', booking.id)

    // Reverse commission if it was confirmed
    if (booking.status === 'confirmed' && booking.commission_amount > 0) {
      await supabase
        .from('commissions')
        .update({ status: 'cancelled' })
        .eq('booking_id', booking.id)
        .catch(() => {})
    }

    // Step 3: Create cancellation alert card for reception
    await supabase.from('notifications').insert({
      hotel_id:  hotel.id,
      type:      'booking_cancelled',
      title:     `🚫 ${booking.type} cancelled — ${guest.name || 'Guest'}${guest.room ? ` · Room ${guest.room}` : ''}`,
      body:      `Partner: ${partner?.name || 'Unknown'} · ${partnerNotified ? 'Partner notified ✓' : '⚠ Partner notification pending'}`,
      link_type: 'booking',
      link_id:   booking.id,
      metadata:  JSON.stringify({
        booking_type:     booking.type,
        partner_name:     partner?.name,
        partner_notified: partnerNotified,
        guest_name:       guest.name,
        room:             guest.room,
        time:             booking.details?.time,
        cancel_reason:    bookingCancel.reason,
      }),
    }).catch(() => {})

    log.info('Partner booking cancelled', {
      ...hCtx, ...gCtx,
      bookingId:        booking.id,
      type:             booking.type,
      partnerNotified,
      commissionAmount: booking.commission_amount,
    })

    return { success: true, booking, partner, partnerNotified }

  } catch (err) {
    await log.error('cancelPartnerBooking failed', err, { ...hCtx, ...gCtx })
    return { success: false, reason: err.message }
  }
}

// ── FLOW C: Room cancellation — always escalate ───────────────
export async function escalateRoomCancellation(hotel, guest, convId) {
  const hCtx = hotelCtx(hotel)
  const gCtx = guestCtx(guest)

  try {
    // Escalate the conversation
    await supabase
      .from('conversations')
      .update({ status: 'escalated' })
      .eq('id', convId)

    // High-priority alert to reception
    await supabase.from('notifications').insert({
      hotel_id:  hotel.id,
      type:      'room_cancel_request',
      title:     `🚨 Room cancellation request — ${guest.name || 'Guest'}${guest.room ? ` · Room ${guest.room}` : ''}`,
      body:      'Guest requested to cancel their room. Please contact them immediately — this involves cancellation policy and potential refunds.',
      link_type: 'conversation',
      link_id:   convId,
      priority:  'urgent',
    }).catch(() => {})

    log.warn('Room cancellation escalated to reception', { ...hCtx, ...gCtx, convId })
    return { success: true }

  } catch (err) {
    await log.error('escalateRoomCancellation failed', err, { ...hCtx, ...gCtx })
    return { success: false }
  }
}

// ── CANCELLATION ACKNOWLEDGEMENT (called from dashboard API) ──
export async function acknowledgeBookingCancellation(bookingId, staffSession, ackStatus, note = null) {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      ack_status:  ackStatus,   // 'acknowledged' | 'partner_confirmed' | 'issue'
      ack_by:      staffSession.name || staffSession.email,
      ack_by_role: staffSession.role,
      ack_at:      new Date().toISOString(),
      ack_note:    note,
    })
    .eq('id', bookingId)
    .select()
    .single()

  if (error) throw error

  // Mark the notification as read
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('link_id', bookingId)
    .eq('type', 'booking_cancelled')
    .catch(() => {})

  return data
}

// ── PARTNER CANCELLATION MESSAGE BUILDER ─────────────────────
function buildPartnerCancellationMsg(booking, guest, hotel) {
  const ref  = booking.id.slice(-6).toUpperCase()
  const time = booking.details?.time || ''
  const date = booking.details?.date || ''

  return [
    `❌ CANCELLATION — Booking #${ref}`,
    ``,
    `Hotel: ${hotel.name}`,
    `Guest: ${guest.name || 'Guest'}${guest.room ? ` · Room ${guest.room}` : ''}`,
    `Service: ${booking.type}${time ? ` at ${time}` : ''}${date ? ` on ${date}` : ''}`,
    ``,
    `This booking has been cancelled by the guest.`,
    `Please do not proceed with this service.`,
    `Contact reception if you have any questions.`,
  ].join('\n')
}

// ── GUEST CANCELLATION CONFIRMATION MESSAGES ─────────────────
export const CANCEL_CONFIRM = {
  facility: {
    en: (type) => `Your ${type || 'facility'} booking has been cancelled. No charges apply. Let me know if you'd like to rebook at a different time! 😊`,
    ru: (type) => `Ваше бронирование ${type || 'услуги'} отменено. Плата не взимается. Дайте знать, если хотите перенести! 😊`,
    he: (type) => `ההזמנה שלך ל${type || 'מתקן'} בוטלה. אין חיובים. אשמח לעזור לך לקבוע זמן אחר! 😊`,
    de: (type) => `Ihre ${type || 'Einrichtungs'}-Buchung wurde storniert. Keine Gebühren. Lassen Sie mich wissen, wenn Sie umbuchen möchten! 😊`,
    fr: (type) => `Votre réservation ${type || 'de l\'installation'} a été annulée. Aucun frais. Dites-moi si vous souhaitez réserver à un autre moment! 😊`,
    es: (type) => `Su reserva de ${type || 'instalación'} ha sido cancelada. Sin cargos. ¡Avíseme si quiere reservar en otro momento! 😊`,
  },
  partner: {
    en: (type, partner) => `Your ${type || 'booking'} with ${partner || 'our partner'} has been cancelled and they've been notified. Is there anything else I can arrange for you? 😊`,
    ru: (type, partner) => `Ваше бронирование ${type || ''} с ${partner || 'партнёром'} отменено, они уведомлены. Могу ли я организовать что-то ещё? 😊`,
    he: (type, partner) => `ההזמנה שלך ל${type || ''} עם ${partner || 'שותף שלנו'} בוטלה והם קיבלו הודעה. האם יש משהו אחר שאוכל לסדר? 😊`,
    de: (type, partner) => `Ihre ${type || ''}-Buchung bei ${partner || 'unserem Partner'} wurde storniert und sie wurden benachrichtigt. Kann ich noch etwas für Sie arrangieren? 😊`,
    fr: (type, partner) => `Votre réservation ${type || ''} chez ${partner || 'notre partenaire'} a été annulée et ils ont été notifiés. Puis-je arranger autre chose pour vous? 😊`,
    es: (type, partner) => `Su reserva de ${type || ''} con ${partner || 'nuestro socio'} ha sido cancelada y han sido notificados. ¿Puedo organizar algo más? 😊`,
  },
  room: {
    en: `I've passed your cancellation request to our reception team — they'll be in touch shortly to assist you with our cancellation policy and any applicable refunds. 🙏`,
    ru: `Я передал ваш запрос на отмену нашей службе приёма — они свяжутся с вами в ближайшее время. 🙏`,
    he: `העברתי את בקשת הביטול שלך לצוות הקבלה שלנו — הם יצרו איתך קשר בקרוב. 🙏`,
    de: `Ich habe Ihren Stornierungsantrag an unsere Rezeption weitergeleitet — sie werden sich in Kürze bei Ihnen melden. 🙏`,
    fr: `J'ai transmis votre demande d'annulation à notre équipe de réception — ils vous contacteront sous peu. 🙏`,
    es: `He pasado su solicitud de cancelación a nuestro equipo de recepción — se pondrán en contacto con usted en breve. 🙏`,
  },
}
