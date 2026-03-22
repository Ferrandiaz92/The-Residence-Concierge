// src/api/webhook/route.js
// ============================================================
// Next.js App Router API endpoint
// Twilio posts to: POST /api/webhook
//
// SETUP IN TWILIO:
// Twilio Dashboard → Messaging → WhatsApp Sandbox (or your number)
// → When a message comes in → Webhook URL:
//   https://your-app.vercel.app/api/webhook
//   Method: HTTP POST
// ============================================================

import { handleInboundWhatsApp } from '../../webhooks/whatsapp-inbound.js'
import { handlePartnerReply }    from '../../webhooks/partner-reply.js'
import { getPartners }           from '../../lib/supabase.js'

export async function POST(request) {
  try {
    // Parse Twilio's URL-encoded body
    const text   = await request.text()
    const body   = Object.fromEntries(new URLSearchParams(text))
    const from   = body.From?.replace('whatsapp:', '')
    const to     = body.To?.replace('whatsapp:', '')

    console.log(`Webhook: ${from} → ${to}`)

    // ── Determine if this is a partner or a guest ──────────────
    // Partners have a known phone number registered in our DB
    // Everyone else is treated as a guest

    // Quick check: is this sender a registered partner?
    // We do a lightweight DB lookup on the 'from' number
    const isPartner = await checkIfPartner(from)

    if (isPartner) {
      await handlePartnerReply(body)
    } else {
      await handleInboundWhatsApp(body)
    }

    // Twilio expects a 200 response (empty TwiML is fine)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
      }
    )
  } catch (err) {
    console.error('Webhook error:', err)
    // Still return 200 to prevent Twilio retrying
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }
}

// ── PARTNER CHECK ─────────────────────────────────────────────────────────────

async function checkIfPartner(phone) {
  if (!phone) return false
  try {
    const { supabase } = await import('../../lib/supabase.js')
    const { data } = await supabase
      .from('partners')
      .select('id')
      .eq('phone', phone)
      .eq('active', true)
      .single()
    return !!data
  } catch {
    return false
  }
}

// GET — health check
export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'The Residence Concierge',
    timestamp: new Date().toISOString()
  })
}
