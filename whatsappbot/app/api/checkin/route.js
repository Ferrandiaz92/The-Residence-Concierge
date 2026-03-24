// app/api/checkin/route.js
// Handles guest check-in from dashboard:
// - Creates/updates guest record
// - Adds room(s)
// - Sends welcome WhatsApp message

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import twilio from 'twilio'

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

// POST — check in a guest, optionally send welcome message
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      guestId,       // existing guest or null for new
      hotelId,
      name,
      surname,
      phone,
      language,
      rooms,         // array of { room, room_type, check_in, check_out, primary_room }
      sendWelcome,   // boolean
    } = await request.json()

    const supabase = getSupabase()

    // 1. Create or update guest
    let guest
    if (guestId) {
      const { data } = await supabase
        .from('guests')
        .update({ name, surname, language })
        .eq('id', guestId)
        .select()
        .single()
      guest = data
    } else {
      // Check if guest with this phone already exists
      const { data: existing } = await supabase
        .from('guests')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('phone', phone)
        .single()

      if (existing) {
        const { data } = await supabase
          .from('guests')
          .update({ name, surname, language,
            check_in:  rooms?.[0]?.check_in,
            check_out: rooms?.[0]?.check_out,
            room:      rooms?.find(r => r.primary_room)?.room || rooms?.[0]?.room,
          })
          .eq('id', existing.id)
          .select()
          .single()
        guest = data
      } else {
        const primaryRoom = rooms?.find(r => r.primary_room) || rooms?.[0]
        const { data } = await supabase
          .from('guests')
          .insert({
            hotel_id:  hotelId,
            phone,
            name,
            surname,
            language:  language || 'en',
            room:      primaryRoom?.room,
            check_in:  primaryRoom?.check_in,
            check_out: primaryRoom?.check_out,
          })
          .select()
          .single()
        guest = data
      }
    }

    if (!guest) return Response.json({ error: 'Failed to create guest' }, { status: 500 })

    // 2. Add rooms to guest_rooms table
    if (rooms && rooms.length > 0) {
      // Remove existing rooms for this stay
      await supabase
        .from('guest_rooms')
        .delete()
        .eq('guest_id', guest.id)

      // Insert all rooms
      await supabase
        .from('guest_rooms')
        .insert(rooms.map(r => ({
          guest_id:     guest.id,
          hotel_id:     hotelId,
          room:         r.room,
          room_type:    r.room_type || null,
          check_in:     r.check_in,
          check_out:    r.check_out,
          primary_room: r.primary_room || false,
        })))
    }

    // 3. Send welcome WhatsApp if requested
    if (sendWelcome && phone) {
      const { data: hotel } = await supabase
        .from('hotels')
        .select('name, config')
        .eq('id', hotelId)
        .single()

      const roomList = rooms?.length > 1
        ? `Rooms ${rooms.map(r => r.room).join(' & ')}`
        : `Room ${rooms?.[0]?.room || ''}`

      const langMessages = {
        en: `Welcome to ${hotel.name}, ${name}! 🌴\n\nI'm your personal concierge — available 24/7 for restaurant bookings, taxis, activities and anything you need during your stay.\n\n${roomList} · Check-out: ${rooms?.[0]?.check_out || ''}\n\nSave this number to reach me anytime. How can I help you today?`,
        ru: `Добро пожаловать в ${hotel.name}, ${name}! 🌴\n\nЯ ваш персональный консьерж — доступен 24/7 для бронирования ресторанов, такси, экскурсий и всего остального.\n\n${roomList} · Выезд: ${rooms?.[0]?.check_out || ''}\n\nСохраните этот номер. Чем могу помочь?`,
        he: `ברוך הבא ל${hotel.name}, ${name}! 🌴\n\nאני הקונסיירז' האישי שלך — זמין 24/7 להזמנות מסעדות, מוניות, פעילויות וכל מה שתצטרך.\n\n${roomList} · צ'ק-אאוט: ${rooms?.[0]?.check_out || ''}\n\nשמור את המספר הזה. איך אוכל לעזור?`,
      }

      const welcomeMsg = langMessages[language || 'en'] || langMessages.en

      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        const toFormatted = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`
        await client.messages.create({
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to:   toFormatted,
          body: welcomeMsg,
        })

        // Mark welcome as sent
        await supabase
          .from('guests')
          .update({ welcome_sent_at: new Date().toISOString() })
          .eq('id', guest.id)
      } catch (e) {
        console.error('Welcome message failed:', e.message)
      }
    }

    // 4. Load all rooms for this guest
    const { data: guestRooms } = await supabase
      .from('guest_rooms')
      .select('*')
      .eq('guest_id', guest.id)
      .order('primary_room', { ascending: false })

    return Response.json({
      status: 'ok',
      guest: { ...guest, rooms: guestRooms || [] }
    })
  } catch (err) {
    console.error('Check-in error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// GET — get all rooms for a guest
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const guestId = searchParams.get('guestId')
    if (!guestId) return Response.json({ error: 'guestId required' }, { status: 400 })

    const supabase = getSupabase()
    const { data } = await supabase
      .from('guest_rooms')
      .select('*')
      .eq('guest_id', guestId)
      .order('primary_room', { ascending: false })

    return Response.json({ rooms: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
