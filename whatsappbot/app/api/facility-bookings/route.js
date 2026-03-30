// app/api/facility-bookings/route.js
// Manages facility booking requests — list, confirm, reject, alternative

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import { checkCsrf }    from '../../../lib/csrf.js'
import twilio           from 'twilio'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}
function sendWhatsApp(to, body) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const fmt    = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER, to: fmt, body })
}

const CAN_READ    = ['manager', 'receptionist', 'supervisor', 'concierge']
const CAN_CONFIRM = ['manager', 'receptionist', 'supervisor', 'concierge']

// ── Guest notification messages ───────────────────────────────
const GUEST_MSGS = {
  confirmed: {
    en: (f, date, time) => `Great news! Your ${f} booking is confirmed ✅\n\n📅 ${date}\n🕐 ${time}\n\nSee you there! 🎾`,
    ru: (f, date, time) => `Отличные новости! Ваше бронирование ${f} подтверждено ✅\n\n📅 ${date}\n🕐 ${time}`,
    he: (f, date, time) => `חדשות מעולות! ההזמנה שלך ל${f} אושרה ✅\n\n📅 ${date}\n🕐 ${time}`,
    de: (f, date, time) => `${f} Buchung bestätigt ✅\n\n📅 ${date}\n🕐 ${time}\n\nBis dann!`,
    fr: (f, date, time) => `Réservation ${f} confirmée ✅\n\n📅 ${date}\n🕐 ${time}\n\nÀ bientôt!`,
    es: (f, date, time) => `¡Reserva de ${f} confirmada! ✅\n\n📅 ${date}\n🕐 ${time}\n\n¡Hasta pronto!`,
  },
  rejected: {
    en: (f, date, time) => `I'm sorry, the ${f} is not available at ${time} on ${date}. Would you like to try a different time? I'd be happy to check availability for you! 😊`,
    ru: (f, date, time) => `К сожалению, ${f} недоступна в ${time} ${date}. Хотите попробовать другое время? 😊`,
    he: (f, date, time) => `מצטער, ${f} לא זמינה בשעה ${time} ב-${date}. תרצה לנסות שעה אחרת? 😊`,
    de: (f, date, time) => `${f} ist leider um ${time} am ${date} nicht verfügbar. Soll ich eine andere Zeit prüfen? 😊`,
    fr: (f, date, time) => `Désolé, ${f} n'est pas disponible à ${time} le ${date}. Souhaitez-vous un autre horaire? 😊`,
    es: (f, date, time) => `Lo siento, ${f} no está disponible a las ${time} del ${date}. ¿Le busco otro horario? 😊`,
  },
  alternative: {
    en: (f, altTime, altDate, note) => `The ${f} at your requested time is taken, but we have availability at ${altTime}${altDate ? ` on ${altDate}` : ''}! 🎾\n\n${note ? `Note: ${note}\n\n` : ''}Would that work for you? Just reply Yes or No.`,
    ru: (f, altTime, altDate, note) => `${f} в запрошенное время занята, но есть место в ${altTime}${altDate ? ` ${altDate}` : ''}! 🎾\n\n${note ? `Примечание: ${note}\n\n` : ''}Вам подходит? Ответьте Да или Нет.`,
    he: (f, altTime, altDate, note) => `${f} בשעה המבוקשת תפוסה, אבל יש מקום בשעה ${altTime}${altDate ? ` ב-${altDate}` : ''}! 🎾\n\n${note ? `הערה: ${note}\n\n` : ''}זה מתאים לך? ענה כן או לא.`,
    de: (f, altTime, altDate, note) => `${f} zur gewünschten Zeit ist belegt, aber um ${altTime}${altDate ? ` am ${altDate}` : ''} ist noch Platz! 🎾\n\n${note ? `Hinweis: ${note}\n\n` : ''}Passt das? Bitte antworten Sie Ja oder Nein.`,
    fr: (f, altTime, altDate, note) => `${f} est prise à l'heure demandée, mais disponible à ${altTime}${altDate ? ` le ${altDate}` : ''}! 🎾\n\n${note ? `Note: ${note}\n\n` : ''}Cela vous convient? Répondez Oui ou Non.`,
    es: (f, altTime, altDate, note) => `${f} está ocupada a la hora solicitada, ¡pero hay disponibilidad a las ${altTime}${altDate ? ` el ${altDate}` : ''}! 🎾\n\n${note ? `Nota: ${note}\n\n` : ''}¿Le viene bien? Responda Sí o No.`,
  },
}

function getMsg(type, lang, ...args) {
  const set = GUEST_MSGS[type]
  const fn  = set[lang] || set.en
  return fn(...args)
}

// GET — list facility bookings
export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_READ.includes(session.role)) return Response.json({ error: 'Access denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId') || session.hotelId
    const status  = searchParams.get('status') || null
    const supabase = getSupabase()

    let query = supabase
      .from('facility_bookings')
      .select(`*, guests(id, name, surname, room, phone, language, stay_status), facilities(id, name, department, contact_phone, contact_name)`)
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (status) query = query.eq('status', status)
    else query = query.in('status', ['pending', 'confirmed', 'alternative'])

    const { data } = await query
    return Response.json({ bookings: data || [] })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

// POST — create facility booking (from staff portal)
export async function POST(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { hotelId, facilityId, facilityName, guestId, date, time, guestsCount, notes, createdBy } = await request.json()
    const supabase = getSupabase()

    // Get facility contact
    const { data: facility } = await supabase
      .from('facilities').select('*').eq('id', facilityId).single()

    // Create booking
    const { data: booking, error } = await supabase
      .from('facility_bookings')
      .insert({
        hotel_id: hotelId || session.hotelId,
        facility_id: facilityId,
        facility_name: facilityName || facility?.name,
        guest_id: guestId || null,
        date, time,
        guests_count: guestsCount || 1,
        notes: notes || null,
        status: 'pending',
        created_by: createdBy || `staff:${session.name}`,
      })
      .select().single()
    if (error) throw error

    // Alert facility contact via WhatsApp if phone configured
    if (facility?.contact_phone) {
      const { data: guest } = guestId
        ? await supabase.from('guests').select('name, surname, room').eq('id', guestId).single()
        : { data: null }

      const alertMsg = [
        `🎾 Booking Request: ${facility.name}`,
        `Date: ${date || 'TBC'} at ${time || 'TBC'}`,
        `Guests: ${guestsCount || 1}`,
        guest ? `Guest: ${guest.name || ''} ${guest.surname || ''}${guest.room ? ` · Room ${guest.room}` : ''}` : '',
        notes ? `Notes: ${notes}` : '',
        ``,
        `Reply ✅ to confirm`,
        `Reply ❌ to reject`,
        `Reply 🕐 + alternative time to suggest another slot`,
      ].filter(Boolean).join('\n')

      try {
        const msg = await sendWhatsApp(facility.contact_phone, alertMsg)
        await supabase.from('facility_bookings').update({ alert_sid: msg.sid }).eq('id', booking.id)
      } catch {}
    }

    // Dashboard notification
    await supabase.from('notifications').insert({
      hotel_id:  hotelId || session.hotelId,
      type:      'facility_booking_request',
      title:     `🎾 Booking Request: ${facility?.name || facilityName}`,
      body:      `${date} at ${time} · ${guestsCount || 1} guest(s)`,
      link_type: 'facility_booking',
      link_id:   booking.id,
    }).catch(() => {})

    return Response.json({ status: 'created', booking })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}

// PATCH — confirm / reject / alternative
export async function PATCH(request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_CONFIRM.includes(session.role)) return Response.json({ error: 'Access denied' }, { status: 403 })

    const { bookingId, action, alternativeTime, alternativeDate, alternativeNote } = await request.json()
    // action: 'confirmed' | 'rejected' | 'alternative'

    const supabase = getSupabase()

    const { data: booking } = await supabase
      .from('facility_bookings')
      .select(`*, guests(phone, language, name), facilities(name)`)
      .eq('id', bookingId).single()

    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 })

    // Update status
    const updates = {
      status:   action,
      ack_by:   session.name || session.email,
      ack_at:   new Date().toISOString(),
    }
    if (action === 'alternative') {
      updates.alternative_time = alternativeTime
      updates.alternative_date = alternativeDate || null
      updates.alternative_note = alternativeNote || null
      updates.status           = 'alternative'
    }
    await supabase.from('facility_bookings').update(updates).eq('id', bookingId)

    // Notify guest via WhatsApp
    const guest   = booking.guests
    const facName = booking.facilities?.name || booking.facility_name
    const lang    = guest?.language || 'en'

    if (guest?.phone) {
      let msg
      if (action === 'confirmed') {
        msg = getMsg('confirmed', lang, facName, booking.date || '', booking.time || '')
      } else if (action === 'rejected') {
        msg = getMsg('rejected', lang, facName, booking.date || '', booking.time || '')
      } else if (action === 'alternative') {
        msg = getMsg('alternative', lang, facName, alternativeTime, alternativeDate, alternativeNote)
      }

      if (msg) {
        try {
          await sendWhatsApp(guest.phone, msg)
          await supabase.from('facility_bookings').update({ guest_notified: true }).eq('id', bookingId)

          // Append to conversation
          const { data: conv } = await supabase
            .from('conversations').select('id')
            .eq('guest_id', guest.id || booking.guest_id)
            .in('status', ['active','escalated'])
            .order('created_at', { ascending: false }).limit(1).single()
          if (conv) {
            await supabase.from('messages').insert({
              conversation_id: conv.id,
              hotel_id:        booking.hotel_id,
              role:            'assistant',
              content:         msg,
              sent_by:         'facility_confirmation',
            }).catch(() => {})
          }
        } catch (e) { console.error('Guest notify failed:', e.message) }
      }
    }

    // Mark dashboard notification read
    await supabase.from('notifications').update({ read: true })
      .eq('link_id', bookingId).eq('type', 'facility_booking_request').catch(() => {})

    return Response.json({ status: 'ok', action })
  } catch (err) { return Response.json({ error: err.message }, { status: 500 }) }
}
