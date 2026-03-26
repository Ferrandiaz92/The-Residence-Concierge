// src/lib/stripe.js
// Creates Stripe Payment Links for guest orders
// Uses simple Payment Links API (Option B — no Stripe Connect needed yet)
//
// ENV VARS NEEDED:
//   STRIPE_SECRET_KEY=sk_live_xxx  (or sk_test_xxx for testing)
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
//   NEXT_PUBLIC_BASE_URL=https://your-vercel-domain.vercel.app

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

// ── CREATE PAYMENT LINK FOR A GUEST ORDER ─────────────────────
// Returns the payment URL to send in WhatsApp
export async function createOrderPaymentLink({ orderId, product, tier, quantity, guest, hotel }) {
  const stripe     = getStripe()
  const totalCents = Math.round(tier.price * quantity * 100)
  const baseUrl    = process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000'

  // Create a Stripe Checkout Session (simpler than Payment Links for dynamic amounts)
  const session = await stripe.checkout.sessions.create({
    mode:          'payment',
    currency:      'eur',
    line_items: [{
      quantity,
      price_data: {
        currency:     'eur',
        unit_amount:  Math.round(tier.price * 100),
        product_data: {
          name:        `${product.name} — ${tier.name}`,
          description: [
            product.description,
            product.available_times ? `Time: ${product.available_times}` : null,
          ].filter(Boolean).join(' · '),
          metadata: { hotel: hotel.name, product_id: product.id },
        },
      },
    }],
    customer_email:     guest.phone ? undefined : undefined, // guest may not have email
    // Success & cancel redirect back to a simple confirmation page
    success_url: `${baseUrl}/api/payments/confirm?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
    cancel_url:  `${baseUrl}/api/payments/cancel?order_id=${orderId}`,
    // Store order ID so webhook can find it
    metadata: {
      order_id:  orderId,
      hotel_id:  hotel.id,
      guest_id:  guest.id,
      guest_name: `${guest.name||''} ${guest.surname||''}`.trim(),
    },
    // Link expires in 24 hours
    expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    payment_intent_data: {
      metadata: { order_id: orderId, hotel_id: hotel.id },
    },
  })

  // Save session ID to the order for webhook lookup
  const supabase = getSupabase()
  await supabase
    .from('guest_orders')
    .update({
      stripe_session_id:  session.id,
      stripe_payment_link: session.url,
    })
    .eq('id', orderId)

  return {
    url:       session.url,
    sessionId: session.id,
    expiresAt: session.expires_at,
  }
}

// ── CREATE ORDER IN DB + GENERATE PAYMENT LINK ───────────────
// Main function called by the bot when a guest selects a tier
export async function createGuestOrder({ hotelId, guestId, convId, product, tier, quantity = 1, hotel, guest }) {
  const supabase        = getSupabase()
  const totalAmount     = tier.price * quantity
  const commissionRate  = product.commission_rate || 15
  const commissionAmt   = +(totalAmount * commissionRate / 100).toFixed(2)
  const partnerAmt      = +(totalAmount - commissionAmt).toFixed(2)

  // Create order record
  const { data: order, error } = await supabase
    .from('guest_orders')
    .insert({
      hotel_id:         hotelId,
      guest_id:         guestId,
      product_id:       product.id,
      partner_id:       product.partner_id,
      tier_name:        tier.name,
      quantity,
      unit_price:       tier.price,
      total_amount:     totalAmount,
      commission_rate:  commissionRate,
      commission_amount: commissionAmt,
      status:           'pending_payment',
      conversation_id:  convId || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create order: ${error.message}`)

  // Generate Stripe payment link
  const { url, sessionId, expiresAt } = await createOrderPaymentLink({
    orderId: order.id,
    product,
    tier,
    quantity,
    guest,
    hotel,
  })

  // Create partner payout record (pending until paid)
  await supabase.from('partner_payouts').insert({
    hotel_id:   hotelId,
    partner_id: product.partner_id,
    order_id:   order.id,
    amount:     partnerAmt,
    status:     'pending',
  })

  return { order, paymentUrl: url, expiresAt }
}

// ── CONFIRM PAYMENT (called by Stripe webhook or redirect) ───
export async function confirmOrderPayment({ sessionId, paymentIntent }) {
  const supabase = getSupabase()

  // Find the order
  const query = sessionId
    ? supabase.from('guest_orders').select('*').eq('stripe_session_id', sessionId).single()
    : supabase.from('guest_orders').select('*').eq('stripe_payment_intent', paymentIntent).single()

  const { data: order, error } = await query
  if (error || !order) return null

  if (order.status === 'paid') return order // already processed

  // Update order status
  const { data: updated } = await supabase
    .from('guest_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', order.id)
    .select()
    .single()

  return updated
}

// ── GET TODAY'S AVAILABLE PRODUCTS ───────────────────────────
// Used to inject into the bot's system prompt
export async function getAvailableProducts(hotelId) {
  const supabase = getSupabase()
  const today    = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('partner_products')
    .select('*, partners(name, type, phone)')
    .eq('hotel_id', hotelId)
    .eq('active', true)
    .or(`available_from.is.null,available_from.lte.${today}`)
    .or(`available_to.is.null,available_to.gte.${today}`)
    .order('sort_order')
    .order('created_at')

  return data || []
}

// ── FORMAT PRODUCTS FOR SYSTEM PROMPT ────────────────────────
export function formatProductsForPrompt(products, lang = 'en') {
  if (!products || products.length === 0) return ''

  let text = '\n\nAVAILABLE EXPERIENCES & PRODUCTS — you can sell these to guests:\n\n'

  products.forEach((p, i) => {
    const tiers = (p.tiers || [])
    text += `[${i + 1}] ${p.name}\n`
    if (p.description) text += `Description: ${p.description}\n`
    if (p.available_times) text += `Time: ${p.available_times}\n`
    text += `Partner: ${p.partners?.name || 'Hotel'}\n`
    text += `Pricing tiers:\n`
    tiers.forEach(t => {
      text += `  - ${t.name}: €${t.price}${t.capacity > 1 ? ` (up to ${t.capacity} people)` : ' per person'}\n`
    })
    text += `Product ID: ${p.id}\n`
    text += '\n'
  })

  text += `SELLING PRODUCTS:
When a guest expresses interest in any product above, present the pricing tiers clearly.
When they choose a tier and quantity, output at END of your message (hidden from guest):
[PRODUCT_ORDER]{"product_id":"<id>","tier_name":"<tier name>","quantity":<number>,"unit_price":<price>}

Example flow:
- Guest: "I'd love tickets to the concert"
- You: Present the tiers naturally, ask which they prefer
- Guest: "2 premium tickets please"  
- You: "Perfect! I'll arrange 2 premium tickets for you. Let me generate your secure payment link." 
  + [PRODUCT_ORDER]{"product_id":"xxx","tier_name":"Premium","quantity":2,"unit_price":85}

IMPORTANT: 
- Never make up products not listed above
- Always confirm quantity before generating the order tag
- After outputting [PRODUCT_ORDER], tell the guest their payment link is being prepared
- The payment link will be sent in a follow-up message automatically`

  return text
}

// ── PARSE PRODUCT ORDER FROM AI RESPONSE ─────────────────────
export function parseProductOrder(aiResponse) {
  const marker = '[PRODUCT_ORDER]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasOrder: false, cleanResponse: aiResponse }

  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim().split('\n')[0]
    const order   = JSON.parse(jsonStr)
    return {
      hasOrder:      true,
      order,
      cleanResponse: aiResponse.slice(0, idx).trim(),
    }
  } catch {
    return { hasOrder: false, cleanResponse: aiResponse }
  }
}
