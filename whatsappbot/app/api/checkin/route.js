// app/api/checkin/route.js
// ============================================================
// Guest check-in / check-out with stay_status transitions
//
// POST  → check in (prospect/pre_arrival → active)
//         sends welcome WhatsApp if sendWelcome = true
//         queues feedback survey for 24h after check_out
// PATCH → check out (active → checked_out)
//         queues feedback survey immediately
// GET   → get rooms for a guest
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import twilio           from 'twilio'

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

// ── WELCOME MESSAGES ──────────────────────────────────────────
function buildWelcomeMessage(guestName, hotelName, rooms, checkOut, language) {
  const roomList = rooms?.length > 1
    ? `Rooms ${rooms.map(r => r.room).join(' & ')}`
    : `Room ${rooms?.[0]?.room || ''}`

  const firstName = guestName?.split(' ')[0] || guestName || 'there'

  const msgs = {
    en: `Good morning ${firstName}! Welcome to ${hotelName} 🌴\n\nI'm your personal concierge — think of me as your local friend at the hotel. Need a table tonight, a taxi, local tips, or anything at all? Just message me here anytime.\n\n${roomList} · Check-out: ${checkOut || ''}`,
    ru: `Доброе утро, ${firstName}! Добро пожаловать в ${hotelName} 🌴\n\nЯ ваш персональный консьерж — пишите мне в любое время. Ресторан, такси, советы по местным достопримечательностям — всё что угодно.\n\n${roomList} · Выезд: ${checkOut || ''}`,
    he: `בוקר טוב ${firstName}! ברוך הבא ל${hotelName} 🌴\n\nאני הקונסיירז' האישי שלך — אפשר לפנות אליי בכל עת. מסעדה, מונית, טיפים מקומיים — כל מה שתצטרך.\n\n${roomList} · צ'ק-אאוט: ${checkOut || ''}`,
    de: `Guten Morgen ${firstName}! Willkommen im ${hotelName} 🌴\n\nIch bin Ihr persönlicher Concierge — schreiben Sie mir jederzeit. Restaurant, Taxi, lokale Tipps — alles was Sie brauchen.\n\n${roomList} · Checkout: ${checkOut || ''}`,
    fr: `Bonjour ${firstName}! Bienvenue au ${hotelName} 🌴\n\nJe suis votre concierge personnel — écrivez-moi à tout moment. Restaurant, taxi, conseils locaux — tout ce dont vous avez besoin.\n\n${roomList} · Check-out: ${checkOut || ''}`,
    es: `¡Buenos días ${firstName}! Bienvenido/a al ${hotelName} 🌴\n\nSoy tu conserje personal — escríbeme cuando quieras. Restaurante, taxi, consejos locales — lo que necesites.\n\n${roomList} · Check-out: ${checkOut || ''}`,
  }
  return msgs[language] || msgs.en
}

// ── POST — CHECK IN ───────────────────────────────────────────
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      guestId,
      hotelId,
      name,
      surname,
      phone,
      language,
      rooms,
      sendWelcome,
    } = await request.json()

    const supabase = getSupabase()

    // 1. Create or update guest
    let guest
    const now = new Date().toISOString()

    if (guestId) {
      const { data } = await supabase
        .from('guests')
        .update({
          name, surname, language,
          stay_status:   'active',
          checked_in_at: now,
          room: rooms?.find(r => r.primary_room)?.room || rooms?.[0]?.room,
          check_in:  rooms?.[0]?.check_in,
          check_out: rooms?.[0]?.check_out,
        })
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

      const primaryRoom = rooms?.find(r => r.primary_room) || rooms?.[0]
      const guestData = {
        name, surname,
        language:      language || 'en',
        stay_status:   'active',
        checked_in_at: now,
        room:          primaryRoom?.room,
        check_in:      primaryRoom?.check_in,
        check_out:     primaryRoom?.check_out,
      }

      if (existing) {
        const { data } = await supabase
          .from('guests')
          .update(guestData)
          .eq('id', existing.id)
          .select()
          .single()
        guest = data
      } else {
        const { data } = await supabase
          .from('guests')
          .insert({ hotel_id: hotelId, phone, ...guestData })
          .select()
          .single()
        guest = data
      }
    }

    if (!guest) return Response.json({ error: 'Failed to create guest' }, { status: 500 })

    // 2. Add rooms to guest_rooms table
    if (rooms && rooms.length > 0) {
      await supabase.from('guest_rooms').delete().eq('guest_id', guest.id)
      await supabase.from('guest_rooms').insert(
        rooms.map(r => ({
          guest_id:     guest.id,
          hotel_id:     hotelId,
          room:         r.room,
          room_type:    r.room_type || null,
          check_in:     r.check_in,
          check_out:    r.check_out,
          primary_room: r.primary_room || false,
        }))
      )
    }

    // 3. Queue feedback survey for 24h after check_out
    const checkOutDate = rooms?.[0]?.check_out
    if (checkOutDate && guest.phone) {
      const checkOutTs   = new Date(checkOutDate)
      checkOutTs.setHours(12, 0, 0, 0)             // assume 12:00 checkout
      const feedbackDue  = new Date(checkOutTs.getTime() + 24 * 60 * 60 * 1000)

      await supabase.from('feedback_queue').upsert({
        hotel_id:  hotelId,
        guest_id:  guest.id,
        send_at:   feedbackDue.toISOString(),
        sent_at:   null,
      }, { onConflict: 'guest_id' })

      await supabase
        .from('guests')
        .update({ feedback_due_at: feedbackDue.toISOString() })
        .eq('id', guest.id)
    }

    // 4. Send welcome WhatsApp
    if (sendWelcome && phone) {
      const { data: hotel } = await supabase
        .from('hotels')
        .select('name, config')
        .eq('id', hotelId)
        .single()

      const welcomeMsg = buildWelcomeMessage(
        `${name || ''} ${surname || ''}`.trim(),
        hotel.name,
        rooms,
        rooms?.[0]?.check_out,
        language || 'en'
      )

      try {
        const client      = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        const toFormatted = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`
        await client.messages.create({
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to:   toFormatted,
          body: welcomeMsg,
        })
        await supabase
          .from('guests')
          .update({ welcome_sent_at: now })
          .eq('id', guest.id)
      } catch (e) {
        console.error('Welcome message failed:', e.message)
      }
    }

    // 5. Load rooms for response
    const { data: guestRooms } = await supabase
      .from('guest_rooms')
      .select('*')
      .eq('guest_id', guest.id)
      .order('primary_room', { ascending: false })

    return Response.json({
      status: 'ok',
      guest:  { ...guest, rooms: guestRooms || [] }
    })

  } catch (err) {
    console.error('Check-in error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH — CHECK OUT ─────────────────────────────────────────
export async function PATCH(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { guestId, hotelId } = await request.json()
    if (!guestId) return Response.json({ error: 'guestId required' }, { status: 400 })

    const supabase    = getSupabase()
    const now         = new Date()
    const feedbackDue = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Update stay status
    const { data: guest } = await supabase
      .from('guests')
      .update({
        stay_status:      'checked_out',
        checked_out_at:   now.toISOString(),
        feedback_due_at:  feedbackDue.toISOString(),
      })
      .eq('id', guestId)
      .select()
      .single()

    if (!guest) return Response.json({ error: 'Guest not found' }, { status: 404 })

    // Queue feedback survey
    await supabase.from('feedback_queue').upsert({
      hotel_id: hotelId || guest.hotel_id,
      guest_id: guestId,
      send_at:  feedbackDue.toISOString(),
      sent_at:  null,
    }, { onConflict: 'guest_id' })

    // Close active conversations for this guest
    await supabase
      .from('conversations')
      .update({ status: 'resolved' })
      .eq('guest_id', guestId)
      .eq('status', 'active')

    return Response.json({ status: 'checked_out', guest, feedback_due_at: feedbackDue.toISOString() })

  } catch (err) {
    console.error('Check-out error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── GET — get rooms for a guest ───────────────────────────────
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
