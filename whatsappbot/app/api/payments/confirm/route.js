// app/api/payments/confirm/route.js
// Stripe redirects here after successful payment
// Confirms the order and redirects to a success page

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth:{ persistSession:false } })
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')
  const orderId   = searchParams.get('order_id')

  if (sessionId) {
    const supabase = getSupabase()
    await supabase
      .from('guest_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: sessionId })
      .eq('id', orderId)
      .eq('status', 'pending_payment')
  }

  // Redirect to a simple success page
  const base = process.env.NEXT_PUBLIC_BASE_URL || ''
  return Response.redirect(`${base}/payment-success`, 302)
}
