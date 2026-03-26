// app/api/payments/confirm/route.js
// Stripe redirects here after successful payment
// Confirms the order and redirects to a success page

// app/api/payments/confirm/route.js - kept for backwards compat but
// success_url now goes directly to /payment-success
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const base = process.env.NEXT_PUBLIC_BASE_URL || ''
  return Response.redirect(`${base}/payment-success`, 302)
}
