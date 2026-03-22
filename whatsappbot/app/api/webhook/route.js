// app/api/webhook/route.js
// ============================================================
// TWILIO WHATSAPP WEBHOOK
// Twilio posts here every time a guest or partner sends a message
// URL: https://your-app.vercel.app/api/webhook
// Method: POST
// ============================================================

import { handleInboundWhatsApp } from '../../../src/webhooks/whatsapp-inbound.js'
import { handlePartnerReply }    from '../../../src/webhooks/partner-reply.js'
import { supabase }              from '../../../src/lib/supabase.js'

export async function POST(request) {
  try {
    const text = await request.text()
    const body = Object.fromEntries(new URLSearchParams(text))
    const from = body.From?.replace('whatsapp:', '')

    console.log(`Webhook received from: ${from}`)

    // Check if sender is a registered partner
    const isPartner = await checkIfPartner(from)

    if (isPartner) {
      await handlePartnerReply(body)
    } else {
      await handleInboundWhatsApp(body)
    }

    // Twilio expects 200 with empty TwiML
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }
}

// GET — health check so you can verify the endpoint is live
export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'The Residence Concierge',
    timestamp: new Date().toISOString()
  })
}

async function checkIfPartner(phone) {
  if (!phone) return false
  try {
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
