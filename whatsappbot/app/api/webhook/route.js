export async function POST(request) {
  const text = await request.text()
  const body = Object.fromEntries(new URLSearchParams(text))
  
  console.log('=== WEBHOOK HIT ===')
  console.log('From:', body.From)
  console.log('To:', body.To)
  console.log('Body:', body.Body)

  try {
    const from = body.From?.replace('whatsapp:', '')

    console.log('Step 1: importing modules...')
    const { handleInboundWhatsApp } = await import('../../../src/webhooks/whatsapp-inbound.js')
    console.log('Step 2: imported whatsapp-inbound')
    const { handlePartnerReply }    = await import('../../../src/webhooks/partner-reply.js')
    console.log('Step 3: imported partner-reply')
    const { supabase }              = await import('../../../src/lib/supabase.js')
    console.log('Step 4: imported supabase')

    const isPartner = await checkIfPartner(from, supabase)
    console.log('Step 5: isPartner =', isPartner)

    if (isPartner) {
      await handlePartnerReply(body)
    } else {
      await handleInboundWhatsApp(body)
    }
    console.log('Step 6: handler completed successfully')

  } catch (err) {
    console.error('=== WEBHOOK CRASH ===')
    console.error('Error:', err.message)
    console.error('Stack:', err.stack)
  }

  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  )
}

export async function GET() {
  return Response.json({
    status:    'ok',
    service:   'The Residence Concierge',
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
