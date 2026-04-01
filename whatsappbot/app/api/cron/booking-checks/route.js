// app/api/cron/booking-checks/route.js
// ============================================================
// Fix #13 — Partner no response
// Runs every 5 minutes via Vercel cron
// If a partner hasn't replied in 15 minutes, sends the guest
// a "still confirming" message so they don't feel ignored
// ============================================================

import { createClient } from '@supabase/supabase-js'
import twilio           from 'twilio'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

const STILL_CONFIRMING = {
  en: `Just following up — I'm still waiting for confirmation from our partner. I'll update you as soon as I hear back! 🙏`,
  ru: `Уточняю — ожидаю подтверждения от партнёра. Сообщу сразу, как получу ответ! 🙏`,
  he: `עוד ממתין לאישור מהשותף שלנו. אעדכן אותך ברגע שאקבל תשובה! 🙏`,
  de: `Ich warte noch auf die Bestätigung unseres Partners. Ich melde mich sobald ich Antwort habe! 🙏`,
  fr: `J'attends toujours la confirmation de notre partenaire. Je vous tiens au courant dès que j'ai une réponse! 🙏`,
  es: `Sigo esperando confirmación de nuestro socio. ¡Te aviso en cuanto tenga respuesta! 🙏`,
}

export async function GET(request) {
  // Verify this is a legitimate cron call
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now      = new Date().toISOString()

  // Find pending checks that are due and not yet sent
  const { data: checks } = await supabase
    .from('booking_pending_checks')
    .select('*, bookings(status)')
    .lte('check_at', now)
    .eq('sent', false)
    .limit(20)

  if (!checks || checks.length === 0) {
    console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_done', ts: new Date().toISOString() }))
    return Response.json({ status: 'ok', sent: 0 })
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )

  let sent = 0

  for (const check of checks) {
    // Only send if booking is still pending (partner hasn't replied yet)
    if (check.bookings?.status !== 'pending') {
      // Booking already resolved — just mark as sent
      await supabase
        .from('booking_pending_checks')
        .update({ sent: true, sent_at: now })
        .eq('id', check.id)
      continue
    }

    const cronName = request.url.split('/api/cron/')[1]?.split('?')[0] || 'unknown'
  const runId    = Date.now()
  console.log(JSON.stringify({ level:'info', cron: cronName, runId, event:'cron_start', ts: new Date().toISOString() }))
  try {
      const msg     = STILL_CONFIRMING[check.guest_lang] || STILL_CONFIRMING.en
      const toPhone = check.guest_phone.startsWith('whatsapp:')
        ? check.guest_phone
        : `whatsapp:${check.guest_phone}`

      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to:   toPhone,
        body: msg,
      })

      await supabase
        .from('booking_pending_checks')
        .update({ sent: true, sent_at: now })
        .eq('id', check.id)

      sent++
    } catch (err) {
      console.error(`Failed to send pending check for booking ${check.booking_id}:`, err.message)
    }
  }

  return Response.json({ status: 'ok', sent })
}
