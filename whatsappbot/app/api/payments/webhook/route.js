// app/api/payments/webhook/route.js
// Stripe sends events here when payments complete or fail
// Add this URL in Stripe Dashboard → Webhooks:
//   https://your-domain.vercel.app/api/payments/webhook
// Events to listen for: checkout.session.completed, payment_intent.payment_failed

import Stripe         from 'stripe'
import { createClient } from '@supabase/supabase-js'
import twilio         from 'twilio'

function getStripe()   { return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion:'2024-04-10' }) }
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth:{ persistSession:false } }) }

function sendWhatsApp(to, body) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const fmt    = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER, to: fmt, body })
}

export async function POST(request) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message)
    return new Response('Webhook signature invalid', { status: 400 })
  }

  const supabase = getSupabase()

  try {
    if (event.type === 'checkout.session.completed') {
      const session   = event.data.object
      const orderId   = session.metadata?.order_id
      const hotelId   = session.metadata?.hotel_id
      const guestId   = session.metadata?.guest_id

      if (!orderId) return new Response('ok', { status: 200 })

      // Update order to paid
      const { data: order } = await supabase
        .from('guest_orders')
        .update({ status:'paid', paid_at: new Date().toISOString(), stripe_payment_intent: session.payment_intent })
        .eq('id', orderId)
        .select('*, partner_products(name, tiers, available_times, partners(name, phone))')
        .single()

      if (!order) return new Response('ok', { status: 200 })

      // Update partner payout to ready
      await supabase.from('partner_payouts').update({ status:'ready' }).eq('order_id', orderId)

      // Get guest phone
      const { data: guest } = await supabase.from('guests').select('phone, name, language').eq('id', guestId).single()
      if (!guest?.phone) return new Response('ok', { status: 200 })

      // Confirmation messages per language
      const CONFIRMATIONS = {
        en: (p, t, q, total) => `✅ *Booking confirmed!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\nYou're all set! Have a wonderful time 🎉`,
        es: (p, t, q, total) => `✅ *¡Reserva confirmada!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\n¡Todo listo! Que lo disfrutes mucho 🎉`,
        fr: (p, t, q, total) => `✅ *Réservation confirmée!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\nVous êtes prêt(e)! Profitez-en bien 🎉`,
        de: (p, t, q, total) => `✅ *Buchung bestätigt!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\nAlles bereit! Viel Spaß 🎉`,
        it: (p, t, q, total) => `✅ *Prenotazione confermata!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\nSiete pronti! Buon divertimento 🎉`,
        ru: (p, t, q, total) => `✅ *Бронирование подтверждено!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\nВсё готово! Приятного времяпрепровождения 🎉`,
        he: (p, t, q, total) => `✅ *ההזמנה אושרה!*\n\n${p}\n${q > 1 ? `${q}× ` : ''}${t} — €${total}\n\nהכל מוכן! תיהנו 🎉`,
      }

      const productName = order.partner_products?.name || 'Your experience'
      const total       = order.total_amount.toFixed(0)
      const confirmFn   = CONFIRMATIONS[guest.language] || CONFIRMATIONS.en
      const confirmMsg  = confirmFn(productName, order.tier_name, order.quantity, total)

      await sendWhatsApp(guest.phone, confirmMsg)

      // Notify hotel (create internal notification)
      await supabase.from('notifications').insert({
        hotel_id:  hotelId,
        type:      'payment_received',
        title:     `💰 Payment received — ${productName}`,
        body:      `${session.metadata?.guest_name || 'Guest'} · €${total} · Commission: €${order.commission_amount?.toFixed(0)}`,
        link_type: 'order',
        link_id:   orderId,
      }).catch(() => {}) // non-fatal

      // Notify partner via WhatsApp if they have a phone
      const partnerPhone = order.partner_products?.partners?.phone
      if (partnerPhone) {
        const partnerMsg = [
          `🎟 New booking from ${order.partner_products?.partners?.name || 'The hotel'}`,
          `Product: ${productName}`,
          `Tier: ${order.tier_name}${order.quantity > 1 ? ` × ${order.quantity}` : ''}`,
          `Guest: ${session.metadata?.guest_name || 'Guest'}`,
          `Total paid: €${total}`,
          `Your payout: €${(order.total_amount - order.commission_amount).toFixed(0)}`,
          ``,
          `Please confirm availability and contact the hotel if any issues.`,
        ].join('\n')
        sendWhatsApp(partnerPhone, partnerMsg).catch(e => console.error('Partner notify error:', e.message))
      }

      console.log(`Order ${orderId} confirmed — €${total}`)
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      const orderId = session.metadata?.order_id
      if (orderId) {
        await supabase.from('guest_orders').update({ status:'cancelled' }).eq('id', orderId)
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message)
  }

  return new Response('ok', { status: 200 })
}

// Stripe requires raw body — disable Next.js body parsing
export const config = { api: { bodyParser: false } }
