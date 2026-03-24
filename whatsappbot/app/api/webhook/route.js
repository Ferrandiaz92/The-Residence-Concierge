export async function POST(request) {
  try {
    const text = await request.text()
    const body = Object.fromEntries(new URLSearchParams(text))
    const from = body.From?.replace('whatsapp:', '')

    const { handleInboundWhatsApp } = await import('../../../src/webhooks/whatsapp-inbound.js')
    const { handlePartnerReply } = await import('../../../src/webhooks/partner-reply.js')
    const { supabase } = await import('../../../src/lib/supabase.js')

    const isPartner = await checkIfPartner(from, supabase)
    if (isPartner) {
      await handlePartnerReply(body)
    } else {
      await handleInboundWhatsApp(body)
    }

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

export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'The Residence Concierge',
    timestamp: new Date().toISOString()
  })
}

async function checkIfPartner(phone, supabase) {
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
