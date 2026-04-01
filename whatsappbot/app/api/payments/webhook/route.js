// app/api/payments/webhook/route.js
// Stripe sends events here when payments complete or fail.
// Add this URL in Stripe Dashboard → Webhooks:
//   https://your-domain.vercel.app/api/payments/webhook
// Events to listen for: checkout.session.completed, checkout.session.expired
//
// ─────────────────────────────────────────────────────────────
// FIX #2: Idempotency guard on checkout.session.completed
//
// Stripe retries webhooks on timeout or 5xx — up to 4 times over 72h.
// Vercel cold starts + Supabase latency spikes mean timeouts happen.
// Without this guard, each retry creates a duplicate order and sends
// another payment link to the guest.
//
// The fix: check if the order is already 'paid' before fulfilling.
// Return 200 (not 4xx) so Stripe stops retrying.
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import Stripe          from 'stripe'
import { createClient } from '@supabase/supabase-js'
import twilio           from 'twilio'

function getStripe()   { return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }) }
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } }) }

function sendWhatsApp(to, body) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const fmt    = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  return client.messages.create({ from: process.env.TWILIO_WHATSAPP_NUMBER, to: fmt, body })
}

// ── RICH CONFIRMATION BUILDER ─────────────────────────────────
function buildRichConfirmation(lang, { productName, tierName, quantity, total, meetingPoint, durationText, whatToBring, cancellationPolicy, partnerContact, bookingRef, guestName }) {
  const qStr    = quantity > 1 ? `${quantity}× ` : ''
  const ref     = bookingRef ? bookingRef.slice(-6).toUpperCase() : null
  // ID verification block — shown in all languages below the reference
  const idBlock = {
    en: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Guest: ${name}\n\n_Please keep this reference safe. At check-in, show this reference and a valid photo ID (passport or national ID) matching the name above. This helps us verify your booking quickly._`,
    ru: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Гость: ${name}\n\n_Сохраните этот номер. При заезде предъявите его вместе с документом, удостоверяющим личность._`,
    he: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 אורח: ${name}\n\n_שמרו את מספר ההפניה. בעת הגעה, הציגו אותו עם תעודת זהות או דרכון._`,
    de: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Gast: ${name}\n\n_Bitte bewahren Sie diese Referenz sicher auf. Zeigen Sie beim Check-in diese Referenz und einen Lichtbildausweis vor._`,
    fr: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Client: ${name}\n\n_Conservez cette référence. À l'arrivée, présentez-la avec une pièce d'identité avec photo au nom indiqué._`,
    es: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Huésped: ${name}\n\n_Conserve esta referencia. Al llegar, preséntela junto con un documento de identidad con foto a nombre del titular._`,
    it: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Ospite: ${name}\n\n_Conserva questo riferimento. All'arrivo, mostralo insieme a un documento d'identità con foto intestato al titolare._`,
    pt: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Hóspede: ${name}\n\n_Guarde esta referência. Na chegada, apresente-a com um documento de identificação com foto em nome do titular._`,
    zh: (name) => `\n\n🎫 *预订编号: #${ref}*\n👤 宾客: ${name}\n\n_请保存此编号。到达时请出示此编号及与预订姓名一致的有效身份证件。_`,
    ar: (name) => `\n\n🎫 *المرجع: #${ref}*\n👤 الضيف: ${name}\n\n_يرجى الاحتفاظ بهذا الرقع المرجعي. عند الوصول، أبرزه مع هوية شخصية تحمل صورة باسم المسجّل._`,
    nl: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Gast: ${name}\n\n_Bewaar deze referentie. Toon bij aankomst deze referentie en een geldig identiteitsbewijs op naam van de gast._`,
    el: (name) => `\n\n🎫 *Ref: #${ref}*\n👤 Επισκέπτης: ${name}\n\n_Κρατήστε αυτή την αναφορά. Κατά την άφιξη, δείξτε την μαζί με ταυτότητα ή διαβατήριο στο όνομα του επισκέπτη._`,
  }
  const refStr = ref && guestName
    ? (idBlock[lang] || idBlock.en)(guestName)
    : ref ? `\n\n🎫 *Ref: #${ref}*` : ''

  function logisticsBlock(labels) {
    const lines = []
    if (meetingPoint)       lines.push(`${labels.where} ${meetingPoint}`)
    if (durationText)       lines.push(`${labels.duration} ${durationText}`)
    if (whatToBring)        lines.push(`${labels.bring} ${whatToBring}`)
    if (partnerContact)     lines.push(`${labels.contact} ${partnerContact}`)
    if (cancellationPolicy) lines.push(`${labels.cancel} ${cancellationPolicy}`)
    return lines.length ? '\n\n' + lines.join('\n') : ''
  }

  const templates = {
    en: () => { const lg = logisticsBlock({ where:'📍', duration:'⏱', bring:'👜', contact:'📞', cancel:'↩️' }); return `✅ *Booking confirmed!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nHave a wonderful time! 🎉` },
    ru: () => { const lg = logisticsBlock({ where:'📍', duration:'⏱', bring:'👜', contact:'📞', cancel:'↩️' }); return `✅ *Бронирование подтверждено!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nПриятного времяпрепровождения! 🎉` },
    he: () => { const lg = logisticsBlock({ where:'📍', duration:'⏱', bring:'👜', contact:'📞', cancel:'↩️' }); return `✅ *ההזמנה אושרה!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nתיהנו! 🎉` },
    de: () => { const lg = logisticsBlock({ where:'📍 Treffpunkt:', duration:'⏱ Dauer:', bring:'👜 Mitbringen:', contact:'📞', cancel:'↩️ Stornierung:' }); return `✅ *Buchung bestätigt!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nViel Spaß! 🎉` },
    fr: () => { const lg = logisticsBlock({ where:'📍 Rendez-vous:', duration:'⏱ Durée:', bring:'👜 À apporter:', contact:'📞', cancel:'↩️ Annulation:' }); return `✅ *Réservation confirmée!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nProfitez-en! 🎉` },
    es: () => { const lg = logisticsBlock({ where:'📍 Punto de encuentro:', duration:'⏱ Duración:', bring:'👜 Qué llevar:', contact:'📞', cancel:'↩️ Cancelación:' }); return `✅ *¡Reserva confirmada!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\n¡Que lo disfrutes! 🎉` },
    it: () => { const lg = logisticsBlock({ where:'📍 Punto di incontro:', duration:'⏱ Durata:', bring:'👜 Cosa portare:', contact:'📞', cancel:'↩️ Cancellazione:' }); return `✅ *Prenotazione confermata!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nBuon divertimento! 🎉` },
    pt: () => { const lg = logisticsBlock({ where:'📍 Ponto de encontro:', duration:'⏱ Duração:', bring:'👜 O que levar:', contact:'📞', cancel:'↩️ Cancelamento:' }); return `✅ *Reserva confirmada!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nDivirta-se! 🎉` },
    zh: () => { const lg = logisticsBlock({ where:'📍 集合地点：', duration:'⏱ 时长：', bring:'👜 建议携带：', contact:'📞', cancel:'↩️ 取消政策：' }); return `✅ *预订已确认！*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\n祝您玩得愉快！🎉` },
    ar: () => { const lg = logisticsBlock({ where:'📍 نقطة الالتقاء:', duration:'⏱ المدة:', bring:'👜 ما تحضره:', contact:'📞', cancel:'↩️ سياسة الإلغاء:' }); return `✅ *تم تأكيد الحجز!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nاستمتع! 🎉` },
    nl: () => { const lg = logisticsBlock({ where:'📍 Ontmoetingspunt:', duration:'⏱ Duur:', bring:'👜 Meenemen:', contact:'📞', cancel:'↩️ Annulering:' }); return `✅ *Boeking bevestigd!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nGeniet ervan! 🎉` },
    el: () => { const lg = logisticsBlock({ where:'📍 Σημείο συνάντησης:', duration:'⏱ Διάρκεια:', bring:'👜 Τι να φέρετε:', contact:'📞', cancel:'↩️ Ακύρωση:' }); return `✅ *Κράτηση επιβεβαιώθηκε!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nΚαλή διασκέδαση! 🎉` },
    pl: () => { const lg = logisticsBlock({ where:'📍 Miejsce zbiórki:', duration:'⏱ Czas trwania:', bring:'👜 Zabrać ze sobą:', contact:'📞', cancel:'↩️ Anulowanie:' }); return `✅ *Rezerwacja potwierdzona!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nMiłej zabawy! 🎉` },
    uk: () => { const lg = logisticsBlock({ where:'📍 Місце зустрічі:', duration:'⏱ Тривалість:', bring:'👜 Що взяти:', contact:'📞', cancel:'↩️ Скасування:' }); return `✅ *Бронювання підтверджено!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nПриємного часу! 🎉` },
    sv: () => { const lg = logisticsBlock({ where:'📍 Mötesplats:', duration:'⏱ Längd:', bring:'👜 Ta med:', contact:'📞', cancel:'↩️ Avbokning:' }); return `✅ *Bokning bekräftad!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nHa det så kul! 🎉` },
    fi: () => { const lg = logisticsBlock({ where:'📍 Kokoontumispaikka:', duration:'⏱ Kesto:', bring:'👜 Ota mukaan:', contact:'📞', cancel:'↩️ Peruutus:' }); return `✅ *Varaus vahvistettu!*\n\n${productName}\n${qStr}${tierName} — €${total}${refStr}${lg}\n\nHyvää huvia! 🎉` },
  }

  return (templates[lang] || templates.en)()
}

// ── PARTNER ALERT BUILDER ─────────────────────────────────────
function buildPartnerAlert({ productName, tierName, quantity, guestName, guestRoom, total, payout, orderId }) {
  const ref = orderId.slice(-6).toUpperCase()
  return [
    `🎟 New booking from The Residence Concierge`,
    ``,
    `📋 ${productName}`,
    `Tier: ${tierName}${quantity > 1 ? ` × ${quantity}` : ''}`,
    ``,
    `🎫 *Ref: #${ref}*`,
    `👤 Guest: ${guestName || 'Guest'}${guestRoom ? ` · Room ${guestRoom}` : ''}`,
    ``,
    `💳 Total paid: €${total}`,
    `💰 Your payout: €${payout}`,
    ``,
    `Guest will present this reference + photo ID on arrival.`,
    `Reply ✅ to confirm you have received this booking.`,
  ].join('\n')
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
    // ── PAYMENT SUCCEEDED ────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const orderId = session.metadata?.order_id
      const hotelId = session.metadata?.hotel_id
      const guestId = session.metadata?.guest_id

      if (!orderId) return new Response('ok', { status: 200 })

      // ── FIX #2: Idempotency guard ─────────────────────────
      // Stripe retries on timeout/5xx. Check if already fulfilled
      // before doing anything — return 200 to stop the retry cycle.
      const { data: alreadyPaid } = await supabase
        .from('guest_orders')
        .select('id, status')
        .eq('id', orderId)
        .eq('status', 'paid')
        .single()

      if (alreadyPaid) {
        console.log(`[stripe] Retry ignored — order ${orderId} already paid`)
        return new Response('already processed', { status: 200 })
      }
      // ─────────────────────────────────────────────────────

      // Mark order paid — pull full product logistics in one query
      const { data: order } = await supabase
        .from('guest_orders')
        .update({
          status:                'paid',
          paid_at:               new Date().toISOString(),
          stripe_payment_intent: session.payment_intent,
          stripe_session_id:     session.id,
        })
        .eq('id', orderId)
        .neq('status', 'paid')   // extra safety: only update if not already paid
        .select(`
          *,
          partner_products (
            name, tiers, available_times,
            meeting_point, duration_text, what_to_bring,
            cancellation_policy, partner_contact,
            partners ( name, phone )
          ),
          guests ( name, surname, room )
        `)
        .single()

      if (!order) return new Response('ok', { status: 200 })

      await supabase.from('partner_payouts').update({ status: 'ready' }).eq('order_id', orderId)

      const { data: guest } = await supabase
        .from('guests')
        .select('phone, name, language')
        .eq('id', guestId)
        .single()

      if (!guest?.phone) return new Response('ok', { status: 200 })

      const product     = order.partner_products || {}
      const productName = product.name || 'Your experience'
      const total       = order.total_amount.toFixed(0)

      // ── Rich confirmation → guest ─────────────────────────
      const fullGuestName = [guest.name, order.guests?.surname].filter(Boolean).join(' ') || 'Guest'
      const confirmMsg = buildRichConfirmation(guest.language || 'en', {
        productName,
        tierName:           order.tier_name,
        quantity:           order.quantity,
        total,
        meetingPoint:       product.meeting_point       || null,
        durationText:       product.duration_text       || product.available_times || null,
        whatToBring:        product.what_to_bring       || null,
        cancellationPolicy: product.cancellation_policy || null,
        partnerContact:     product.partner_contact     || null,
        bookingRef:         orderId,
        guestName:          fullGuestName,
      })

      await sendWhatsApp(guest.phone, confirmMsg)

      // ── Fulfilment push → relevant department ─────────────
      // After payment, the relevant department needs to know to prepare
      const deptMap = {
        spa_treatment: 'wellness', wellness: 'wellness', spa: 'wellness',
        activity:      'concierge', transport: 'concierge', tour: 'concierge',
        dining:        'fnb', birthday: 'fnb', celebration: 'fnb',
      }
      const productCategory = order.partner_products?.category || 'concierge'
      const dept = deptMap[productCategory] || 'concierge'
      await supabase.from('notifications').insert({
        hotel_id:   hotelId,
        type:       'fulfillment_needed',
        title:      `🎟 Paid & confirmed — ${productName}`,
        body:       `${fullGuestName}${order.guests?.room ? ' · Room ' + order.guests.room : ''} · Ref #${orderId.slice(-6).toUpperCase()} · €${total} received. Please prepare for guest arrival.`,
        link_type:  'order',
        link_id:    orderId,
        urgent:     true,
        department: dept,
      }).catch(() => {})

      // ── Internal notification → dashboard ────────────────
      await supabase.from('notifications').insert({
        hotel_id:  hotelId,
        type:      'payment_received',
        title:     `💰 Payment received — ${productName}`,
        body:      `${session.metadata?.guest_name || 'Guest'} · €${total} · Commission: €${order.commission_amount?.toFixed(0)}`,
        link_type: 'order',
        link_id:   orderId,
      }).catch(() => {})

      // ── Alert → partner ───────────────────────────────────
      const partnerPhone = product.partners?.phone
      if (partnerPhone) {
        const payout = (order.total_amount - (order.commission_amount || 0)).toFixed(0)
        sendWhatsApp(partnerPhone, buildPartnerAlert({
          productName,
          tierName:  order.tier_name,
          quantity:  order.quantity,
          guestName: session.metadata?.guest_name || 'Guest',
          guestRoom: order.guests?.room || null,
          total,
          payout,
          orderId,
        })).catch(e => console.error('Partner notify error:', e.message))
      }

      console.log(`[stripe] Order ${orderId} confirmed — €${total}`)
    }

    // ── PAYMENT LINK EXPIRED ─────────────────────────────────
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      const orderId = session.metadata?.order_id
      const guestId = session.metadata?.guest_id

      if (orderId) {
        await supabase.from('guest_orders').update({ status: 'cancelled' }).eq('id', orderId)

        if (guestId) {
          const { data: guest } = await supabase
            .from('guests').select('phone, language, name').eq('id', guestId).single()

          if (guest?.phone) {
            const productName = session.metadata?.product_name || 'your experience'
            const name        = guest.name ? ` ${guest.name}` : ''
            const lang        = guest.language || 'en'
            const EXPIRED = {
              en: `Hi${name}! Your payment link for ${productName} has expired (links are valid for 24 hours).\n\nWould you like me to send a new one? Just reply and I'll sort it right away 😊`,
              ru: `Привет${name}! Ссылка для оплаты ${productName} истекла.\n\nОтправить новую? Просто ответьте 😊`,
              he: `היי${name}! קישור התשלום עבור ${productName} פג תוקפו.\n\nרוצה קישור חדש? פשוט ענה לי 😊`,
              de: `Hallo${name}! Ihr Zahlungslink für ${productName} ist abgelaufen.\n\nNeuen senden? Antworten Sie einfach 😊`,
              fr: `Bonjour${name}! Votre lien de paiement pour ${productName} a expiré.\n\nJe vous en envoie un nouveau? Répondez simplement 😊`,
              es: `¡Hola${name}! Tu enlace de pago para ${productName} ha caducado.\n\n¿Te envío uno nuevo? Solo responde 😊`,
              it: `Ciao${name}! Il link di pagamento per ${productName} è scaduto.\n\nTe ne mando uno nuovo? Rispondi qui 😊`,
              pt: `Olá${name}! O link de pagamento para ${productName} expirou.\n\nEnvio um novo? Responda aqui 😊`,
              zh: `您好${name}！${productName}的支付链接已过期。\n\n需要新链接吗？直接回复即可 😊`,
              ar: `مرحباً${name}! انتهت صلاحية رابط الدفع لـ${productName}.\n\nتريد رابطاً جديداً؟ فقط رد هنا 😊`,
              nl: `Hallo${name}! Uw betaallink voor ${productName} is verlopen.\n\nNieuwe sturen? Antwoord gewoon 😊`,
              el: `Γεια${name}! Ο σύνδεσμος πληρωμής για ${productName} έχει λήξει.\n\nΝα στείλω νέο; Απλώς απάντησε 😊`,
              pl: `Cześć${name}! Link płatności dla ${productName} wygasł.\n\nWysłać nowy? Wystarczy odpowiedzieć 😊`,
              uk: `Привіт${name}! Посилання для оплати ${productName} закінчилось.\n\nНадіслати нове? Просто відповідайте 😊`,
              sv: `Hej${name}! Betalningslänken för ${productName} har gått ut.\n\nSka jag skicka en ny? Svara bara 😊`,
              fi: `Hei${name}! Maksulinkki ${productName} on vanhentunut.\n\nLähetänkö uuden? Vastaa vain 😊`,
            }
            sendWhatsApp(guest.phone, EXPIRED[lang] || EXPIRED.en)
              .catch(e => console.error('Expiry notify failed:', e.message))
          }
        }
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message)
  }

  return new Response('ok', { status: 200 })
}
