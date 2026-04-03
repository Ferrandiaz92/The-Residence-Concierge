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

FACILITY BOOKING FLOW — 2 STEPS:

STEP 1 — COLLECT INFO (ask ONE question at a time, in the guest's language):
  1. Which facility?
  2. What date?
  3. What time?
  4. How many people?
  Only move to Step 2 once you have all 4 answers.

STEP 2 — SHOW SUMMARY (once you have all 4 details):
  Send a clear summary and ask the guest to confirm. Output [FACILITY_SUMMARY] tag.
  The guest_summary field is what you send to the guest — make it clear it needs their confirmation.

  Summary phrases by language:
  - EN: "Here's your request:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] people\n\nReply *YES* to send this request to our team, or tell me what to change."
  - ES: "Aquí está tu solicitud:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] personas\n\nResponde *SÍ* para enviar la solicitud a nuestro equipo, o dime qué cambiar."
  - RU: "Ваш запрос:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] чел.\n\nОтветьте *ДА* для отправки запросу, или скажите что изменить."
  - FR: "Voici votre demande:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] personnes\n\nRépondez *OUI* pour envoyer au notre équipe, ou dites-moi ce à changer."
  - DE: "Ihre Anfrage:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] Personen\n\nAntworten Sie *JA* um die Anfrage zu senden, oder sagen Sie was zu ändern."
  - IT: "Ecco la sua richiesta:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] persone\n\nRisponda *SÌ* per inviare la richiesta, o mi dica cosa cambiare."
  - PT: "O seu pedido:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] pessoas\n\nResponda *SIM* para enviar o pedido, ou diga-me o que mudar."
  - ZH: "您的预订摘要：\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests]人\n\n回复*确认*发送预订请求，或告诉我需要更改什么。"
  - AR: "ملخص طلبكم:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] أشخاص\n\nأرسل *نعم* لإرسال الطلب، أو أخبرني بما تريد تغييره."
  - HE: "הנה הבקשה שלך:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] אנשים\n\nהשב *כן* לשליחת הבקשה, או ספר לי מה לשנות."
  - NL: "Uw aanvraag:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] personen\n\nAntwoord *JA* om de aanvraag te sturen, of vertel wat u wilt wijzigen."
  - EL: "Η αίτησή σας:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] άτομα\n\nΑπαντήστε *ΝΑΙ* για αποστολή, ή πείτε μου τι να αλλάξω."
  - PL: "Twoje zamówienie:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] osób\n\nOdpowiedz *TAK* aby wysłać prośbę, lub powiedz co zmienić."
  - UK: "Ваш запит:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] осіб\n\nВідповідайте *ТАК* щоб надіслати запит, або скажіть що змінити."
  - SV: "Din förfrågan:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] personer\n\nSvara *JA* för att skicka förfrågan, eller berätta vad du vill ändra."
  - TR: "Talebiniz:\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests] kişi\n\nTalebi göndermek için *EVET* yazın, veya değiştirmek istediğinizi söyleyin."
  - JA: "ご予約の内容：\n🏟 [facility]\n📅 [date]\n⏰ [time]\n👥 [guests]名\n\n*はい*と返信すると予約リクエストを送ります。変更がある場合はお知らせください。"

  Output: [FACILITY_SUMMARY]{"facility":"Tennis Court","date":"2026-03-25","time":"16:00","guests":2,"guest_summary":"<summary message in guest language above>"}

  After sending the summary, WAIT for guest confirmation — do NOT output [FACILITY_REQUEST] yet.
  Only when the guest replies YES/SÍ/ДА/OUI/JA/SÌ/SIM/确认/نعم/כן/JA/ΝΑΙ/TAK/ТАК/JA/EVET/はい 
  (or any clear confirmation like "yes please", "go ahead", "do it", "perfect", "sure", "sounds good")
  THEN output: [FACILITY_REQUEST]{"facility":"Tennis Court","date":"2026-03-25","time":"16:00","guests":2,"guest_confirmation":"Your Tennis Court request has been sent to our team! We will confirm availability in a few minutes ✅"}

NEVER say the booking is confirmed or reserved — it is always a REQUEST pending reception approval.
NEVER output [FACILITY_REQUEST] before receiving guest confirmation of the summary.`

  return text
}

export function parseFacilitySummary(aiResponse) {
  const marker = '[FACILITY_SUMMARY]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasSummary: false }
  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim()
    const parsed  = JSON.parse(jsonStr.split('\n')[0])
    return {
      hasSummary:    true,
      summary:       parsed,
      cleanResponse: parsed.guest_summary || aiResponse.slice(0, idx).trim()
    }
  } catch {
    return { hasSummary: false }
  }
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

    // Internal ticket so the booking appears in the Live Tab Booking Requests → Facility tab
    // link_id points to the facility_bookings row so the Confirm button works directly
    const description = `Facility: ${facility.facility}\nDate: ${facility.date||'TBC'} at ${facility.time||'TBC'}\nGuests: ${facility.guests||1}\nGuest: ${guest.name||''} ${guest.surname||''}${guest.room?' · Room '+guest.room:''}`
    await supabase.from('internal_tickets').insert({
      hotel_id:   hotel.id,
      guest_id:   guest.id,
      department: 'concierge',
      category:   'facility_booking',
      description,
      room:       guest.room || null,
      priority:   'normal',
      status:     'pending',
      created_by: 'bot',
      link_id:    booking.id,
      link_type:  'facility_booking',
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
