// app/api/webhook/route.js
// ─────────────────────────────────────────────────────────────
// FIX #1: Twilio webhook signature validation
//
// Every message Twilio sends is signed with HMAC-SHA1 using your
// auth token. We now validate that signature before doing anything.
// An invalid or missing signature returns 403 immediately.
//
// Required env var (add to .env.local and Vercel):
//   WEBHOOK_FULL_URL=https://yourapp.vercel.app/api/webhook
// ─────────────────────────────────────────────────────────────

import twilio from 'twilio'

// ── Per-phone rate limiter (prevents individual abuse) ───────
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000  // 1 minute
const RATE_LIMIT_MAX       = 30      // max 30 messages per minute per phone

function isRateLimited(phone) {
  const now    = Date.now()
  const record = rateLimitMap.get(phone) || { count: 0, windowStart: now }
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(phone, { count: 1, windowStart: now })
    return false
  }
  record.count++
  rateLimitMap.set(phone, record)
  if (record.count > RATE_LIMIT_MAX) {
    console.warn(JSON.stringify({ level:'warn', event:'rate_limited_phone', phone: phone.slice(-4), count: record.count, ts: new Date().toISOString() }))
    return true
  }
  return false
}

// ── Per-hotel rate limiter (prevents coordinated abuse / Anthropic budget protection)
const hotelRateLimitMap = new Map()
const HOTEL_RATE_WINDOW_MS = 60_000   // 1 minute
const HOTEL_RATE_MAX       = 200      // max 200 messages per minute per hotel

function isHotelRateLimited(hotelNumber) {
  const now    = Date.now()
  const record = hotelRateLimitMap.get(hotelNumber) || { count: 0, windowStart: now }
  if (now - record.windowStart > HOTEL_RATE_WINDOW_MS) {
    hotelRateLimitMap.set(hotelNumber, { count: 1, windowStart: now })
    return false
  }
  record.count++
  hotelRateLimitMap.set(hotelNumber, record)
  if (record.count > HOTEL_RATE_MAX) {
    console.warn(JSON.stringify({ level:'warn', event:'rate_limited_hotel', hotel: hotelNumber, count: record.count, ts: new Date().toISOString() }))
    return true
  }
  return false
}

export async function POST(request) {
  const text = await request.text()

  // ── FIX #1: Validate Twilio signature ────────────────────
  const twilioSignature = request.headers.get('x-twilio-signature')

  if (!twilioSignature) {
    console.warn('[webhook] Rejected — no x-twilio-signature header')
    return new Response('Forbidden', { status: 403 })
  }

  const webhookUrl = process.env.WEBHOOK_FULL_URL
  if (!webhookUrl) {
    // Fail loudly in dev so you notice immediately
    console.error('[webhook] WEBHOOK_FULL_URL env var is not set!')
    return new Response('Server misconfiguration', { status: 500 })
  }

  // Signature is computed over the sorted key=value pairs
  // so we must parse BEFORE validating — order matters here
  const params  = new URLSearchParams(text)
  const rawBody = Object.fromEntries(params)

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    webhookUrl,
    rawBody
  )

  if (!isValid) {
    console.warn(`[webhook] Invalid Twilio signature — From: ${rawBody.From || 'unknown'}`)
    return new Response('Forbidden', { status: 403 })
  }
  // ─────────────────────────────────────────────────────────

  // Structured log — no full message body in production logs
  console.log(JSON.stringify({ level:'info', event:'webhook_received', from: (rawBody.From||'').slice(-4), ts: new Date().toISOString() }))

  // Rate limit — max 30 messages/min per sender
  const senderPhone = rawBody.From || ''
  if (senderPhone && isRateLimited(senderPhone)) {
    console.warn(JSON.stringify({ level:'warn', event:'rate_limited', phone: senderPhone.slice(-4), ts: new Date().toISOString() }))
    return new Response('Too Many Requests', { status: 429 })
  }

  // Per-hotel global rate limit — protects Anthropic budget against coordinated abuse
  const hotelNumber = rawBody.To || ''
  if (hotelNumber && isHotelRateLimited(hotelNumber)) {
    console.warn(JSON.stringify({ level:'warn', event:'rate_limited_hotel', ts: new Date().toISOString() }))
    return new Response('Too Many Requests', { status: 429 })
  }

  try {
    const from = rawBody.From?.replace('whatsapp:', '')

    const { handleInboundWhatsApp } = await import('../../../src/webhooks/whatsapp-inbound.js')
    const { handlePartnerReply }    = await import('../../../src/webhooks/partner-reply.js')
    const { supabase }              = await import('../../../src/lib/supabase.js')

    const isPartner = await checkIfPartner(from, supabase)

    if (isPartner) {
      await handlePartnerReply(rawBody)
    } else {
      await handleInboundWhatsApp(rawBody)
    }

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
