// app/api/cron/tour-digest/route.js
// ============================================================
// Daily tour briefing — sends a morning WhatsApp to hotel staff
// listing all paid experiences happening today.
//
// Add to vercel.json crons:
//   { "path": "/api/cron/tour-digest", "schedule": "0 8 * * *" }
//
// Configure per-hotel in Supabase:
//   update hotels set config = config || '{"staff_digest_phone":"+357XXXXXXXXX"}' where id = '...';
// ============================================================

import { createClient } from '@supabase/supabase-js'
import twilio           from 'twilio'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
function sendWhatsApp(to, body) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const fmt    = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER, to: fmt, body })
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const today    = new Date().toISOString().split('T')[0]

  const { data: hotels } = await supabase
    .from('hotels')
    .select('id, name, config')
    .eq('active', true)

  if (!hotels?.length) return Response.json({ status: 'ok', sent: 0 })

  let totalSent = 0

  for (const hotel of hotels) {
    const digestPhone = hotel.config?.staff_digest_phone
    if (!digestPhone) continue

    const { data: experiences } = await supabase
      .from('v_todays_experiences')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('experience_date', today)

    if (!experiences?.length) continue

    // Group by product
    const grouped = {}
    for (const exp of experiences) {
      if (!grouped[exp.product_name]) {
        grouped[exp.product_name] = {
          time:          exp.available_times || null,
          meetingPoint:  exp.meeting_point   || null,
          partnerName:   exp.partner_name,
          partnerPhone:  exp.partner_phone,
          partnerContact:exp.partner_contact || null,
          guests:        [],
          totalGuests:   0,
          totalRevenue:  0,
        }
      }
      const g        = grouped[exp.product_name]
      const fullName = [exp.guest_name, exp.guest_surname].filter(Boolean).join(' ') || 'Guest'
      g.guests.push({ name: fullName, room: exp.guest_room, quantity: exp.quantity })
      g.totalGuests  += exp.quantity || 1
      g.totalRevenue += exp.total_amount || 0
    }

    const dateStr     = new Date(today).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })
    const totalOrders = experiences.length
    const totalGuests = Object.values(grouped).reduce((s, g) => s + g.totalGuests, 0)
    const totalRev    = Object.values(grouped).reduce((s, g) => s + g.totalRevenue, 0)

    let msg  = `📋 *Today's experiences — ${dateStr}*\n${hotel.name}\n─────────────────────\n\n`

    for (const [productName, g] of Object.entries(grouped)) {
      msg += `🚢 *${productName}*${g.time ? ` (${g.time})` : ''}\n`
      if (g.meetingPoint) msg += `📍 ${g.meetingPoint}\n`
      msg += `📞 ${g.partnerContact || `${g.partnerName}: ${g.partnerPhone}`}\n\n`
      for (const guest of g.guests) {
        const pax = guest.quantity > 1 ? ` (${guest.quantity} pax)` : ''
        msg += `  • Room ${guest.room || '?'} — ${guest.name}${pax}\n`
      }
      msg += '\n'
    }

    msg += `─────────────────────\n`
    msg += `${totalOrders} experience${totalOrders !== 1 ? 's' : ''} · ${totalGuests} guest${totalGuests !== 1 ? 's' : ''} · €${totalRev.toFixed(0)}`

    try {
      await sendWhatsApp(digestPhone, msg)
      totalSent++
      console.log(`Tour digest sent for ${hotel.name}`)
    } catch (err) {
      console.error(`Digest failed for ${hotel.name}:`, err.message)
    }
  }

  return Response.json({ status: 'ok', sent: totalSent, date: today })
}
