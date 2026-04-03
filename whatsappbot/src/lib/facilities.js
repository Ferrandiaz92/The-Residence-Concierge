// src/lib/facilities.js
// ─────────────────────────────────────────────────────────────
// Updated: facility requests now create a facility_booking row
// AND send a WhatsApp alert to the facility contact (if configured).
// The ✅/❌/🕐 confirmation loop is handled by partner-reply.js
// detecting replies from the facility contact's phone number.
// ─────────────────────────────────────────────────────────────

import { supabase } from './supabase.js'
import twilio       from 'twilio'

function getTwilio() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

export async function getFacilities(hotelId) {
  const { data } = await supabase
    .from('facilities')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('active', true)
    .order('department').order('name')
  return data || []
}

export function formatFacilitiesForPrompt(facilities) {
  if (!facilities || facilities.length === 0) return ''

  let text = 'HOTEL FACILITIES — available for guest booking:\n\n'

  facilities.forEach(f => {
    text += `${f.name}:\n`
    if (f.description) text += `${f.description}\n`
    if (f.max_capacity || f.capacity) text += `Capacity: up to ${f.max_capacity || f.capacity} people\n`
    if (f.price_per_hour) text += `Price: €${f.price_per_hour}/hour\n`
    text += '\n'
  })

  text += `FACILITY BOOKING PROCESS:
When a guest wants to book a facility, collect:
1. Which facility they want
2. Preferred date
3. Preferred time
4. Number of people

CRITICAL — tell the guest the REQUEST is SENT, never that it is confirmed/reserved/booked.
Use these exact phrases in the guest_confirmation field:
- English:  "Your [facility] request for [date] at [time] has been sent! We will confirm availability in a few minutes ✅"
- Spanish:  "¡Tu solicitud para [facility] el [date] a las [time] ha sido enviada! Te confirmaremos en unos minutos ✅"
- Russian:  "Ваш запрос на [facility] [date] в [time] отправлен! Подтвердим наличие мест через несколько минут ✅"
- French:   "Votre demande pour [facility] le [date] à [time] a été envoyée! Nous confirmons dans quelques minutes ✅"
- German:   "Ihre Anfrage für [facility] am [date] um [time] wurde gesendet! Wir bestätigen in wenigen Minuten ✅"

NEVER say: confirmado, reservado, booked, confirmed, done, all set — it is a REQUEST pending approval.

Then output: [FACILITY_REQUEST]{"facility":"Tennis Court","date":"2026-03-25","time":"16:00","guests":2,"guest_confirmation":"Your Tennis Court request for 25 Mar at 16:00 has been sent! We will confirm availability in a few minutes ✅"}

Do NOT say the booking is confirmed — it needs reception to check the calendar first.`

  return text
}

export function parseFacilityRequest(aiResponse) {
  const marker = '[FACILITY_REQUEST]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasFacility: false, cleanResponse: aiResponse }

  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim()
    const parsed  = JSON.parse(jsonStr.split('\n')[0])
    return {
      hasFacility:   true,
      facility:      parsed,
      cleanResponse: parsed.guest_confirmation || aiResponse.slice(0, idx).trim()
    }
  } catch (e) {
    return { hasFacility: false, cleanResponse: aiResponse }
  }
}

// ── PROCESS FACILITY REQUEST ──────────────────────────────────
// Called from whatsapp-inbound.js after parsing [FACILITY_REQUEST]
// Creates a facility_booking row + alerts contact via WhatsApp
export async function processFacilityRequest(facility, hotel, guest, convId) {
  try {
    // Find matching facility record
    const { data: facilities } = await supabase
      .from('facilities')
      .select('*')
      .eq('hotel_id', hotel.id)
      .ilike('name', `%${facility.facility}%`)
      .eq('active', true)
      .limit(1)

    const facilityRecord = facilities?.[0] || null

    // Create facility_booking row
    const { data: booking, error } = await supabase
      .from('facility_bookings')
      .insert({
        hotel_id:      hotel.id,
        facility_id:   facilityRecord?.id || null,
        facility_name: facility.facility,
        guest_id:      guest.id,
        date:          facility.date || null,
        time:          facility.time || null,
        guests_count:  facility.guests || 1,
        status:        'pending',
        created_by:    'bot',
      })
      .select().single()

    if (error) {
      console.error('facility_booking insert error:', error.message)
      // Fall back to internal ticket if table doesn't exist yet
      await createFallbackTicket(facility, hotel, guest, convId)
      return
    }

    // Alert facility contact via WhatsApp (if phone configured)
    if (facilityRecord?.contact_phone) {
      const alertMsg = [
        `🎾 Booking Request: ${facility.facility}`,
        `Date: ${facility.date || 'TBC'} at ${facility.time || 'TBC'}`,
        `Guests: ${facility.guests || 1}`,
        `Guest: ${guest.name || ''} ${guest.surname || ''}${guest.room ? ' · Room ' + guest.room : ''}`,
        ``,
        `Reply ✅ to confirm`,
        `Reply ❌ to reject`,
        `Reply 🕐 + alternative time (e.g. "🕐 11:00") to suggest another slot`,
      ].join('\n')

      try {
        const client = getTwilio()
        const fmt    = facilityRecord.contact_phone.startsWith('whatsapp:')
          ? facilityRecord.contact_phone
          : `whatsapp:${facilityRecord.contact_phone}`
        const msg = await client.messages.create({
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to:   fmt,
          body: alertMsg,
        })
        await supabase.from('facility_bookings').update({ alert_sid: msg.sid }).eq('id', booking.id)
      } catch (e) {
        console.error('Facility contact WhatsApp alert failed:', e.message)
      }
    }

    // Dashboard notification
    await supabase.from('notifications').insert({
      hotel_id:  hotel.id,
      type:      'facility_booking_request',
      title:     `🎾 Booking Request: ${facility.facility}`,
      body:      `${guest.name || 'Guest'}${guest.room ? ' · Room ' + guest.room : ''} · ${facility.date || ''} at ${facility.time || ''}`,
      link_type: 'facility_booking',
      link_id:   booking.id,
    })

  } catch (e) {
    console.error('processFacilityRequest error:', e.message)
    await createFallbackTicket(facility, hotel, guest, convId)
  }
}

// Fallback if facility_bookings table doesn't exist yet
async function createFallbackTicket(facility, hotel, guest, convId) {
  const description = `FACILITY BOOKING REQUEST\nFacility: ${facility.facility}\nDate: ${facility.date||'TBC'}\nTime: ${facility.time||'TBC'}\nGuests: ${facility.guests||1}\n\nGuest: ${guest.name||''} ${guest.surname||''} · Room ${guest.room||'?'}\nPlease check availability and confirm with guest via WhatsApp.`
  await supabase.from('internal_tickets').insert({
    hotel_id: hotel.id, guest_id: guest.id,
    department: 'concierge', category: 'facility_booking',
    description, room: guest.room, priority: 'normal',
    status: 'pending', created_by: 'bot',
  })
}
