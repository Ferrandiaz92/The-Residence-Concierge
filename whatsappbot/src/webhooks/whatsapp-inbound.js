// src/webhooks/whatsapp-inbound.js (updated — guest memory)
import {
  getHotelByWhatsappNumber, getOrCreateGuest, updateGuest,
  getOrCreateConversation, appendMessage, getConversationHistory,
  getPartners, createBooking, supabase,
} from '../lib/supabase.js'
import { sendWhatsApp, parseIncomingMessage } from '../lib/twilio.js'
import { detectLanguage, parseBookingRequest, formatPartnerAlert } from '../lib/language.js'
import { callClaude } from '../lib/claude.js'
import { handleTicketReply } from '../lib/ticketing.js'
import { buildSystemPromptWithKB } from '../lib/knowledge.js'
import { getFacilities, formatFacilitiesForPrompt, parseFacilityRequest } from '../lib/facilities.js'
import { handleFeedbackReply } from '../lib/scheduled.js'
import { loadGuestMemory, formatMemoryForPrompt, updateGuestPreferences } from '../lib/memory.js'
import { notifyReceptionEscalation, notifyReceptionMessage } from '../lib/push.js'
import { getAvailableProducts, formatProductsForPrompt, parseProductOrder, createGuestOrder } from '../lib/stripe.js'

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName, mediaUrls } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}" media:${mediaUrls?.length || 0}`)

  // Allow through if there's an image even with no text
  if (!message.trim() && (!mediaUrls || mediaUrls.length === 0)) return

  // 1. Ticket reply check
  const isTicketReply = await handleTicketReply(from, message)
  if (isTicketReply) return

  // 2. Load hotel
  let hotel
  try { hotel = await getHotelByWhatsappNumber(to) }
  catch { console.error(`No hotel for: ${to}`); return }

  // 3. Guest — create or load
  const guest = await getOrCreateGuest(hotel.id, from)
  if (!guest.name && profileName) {
    const parts = profileName.trim().split(' ')
    await updateGuest(guest.id, { name: parts[0]||null, surname: parts.slice(1).join(' ')||null })
    guest.name = parts[0]||null; guest.surname = parts.slice(1).join(' ')||null
  }

  // 4. Language detection
  const lang = detectLanguage(message)
  if (lang !== guest.language) { await updateGuest(guest.id, { language: lang }); guest.language = lang }

  // 5. Feedback reply check
  const isFeedback = await handleFeedbackReply(from, message, hotel.id)
  if (isFeedback) return

  // 6. Conversation — reuse existing
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('*')
    .eq('guest_id', guest.id)
    .in('status', ['active','escalated'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let conv = existingConv
  if (!conv) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({ guest_id: guest.id, hotel_id: hotel.id, messages: [], status: 'active' })
      .select().single()
    conv = newConv
  }
  if (conv.status === 'escalated') {
    await supabase.from('conversations').update({ status: 'active' }).eq('id', conv.id)
  }

  const history = (conv.messages || []).slice(-20)

  // 7. Load guest memory (previous stays + preferences)
  const memory = await loadGuestMemory(guest.id)

  // 8. Build system prompt with KB + facilities + memory
  const partners    = await getPartners(hotel.id)
  const facilities  = await getFacilities(hotel.id)
  let systemPrompt  = await buildSystemPromptWithKB(hotel, guest, partners)

  // ── FIX #5: Stay status context ──────────────────────────────
  const stayStatus = guest.stay_status || 'prospect'
  if (stayStatus === 'checked_out') {
    systemPrompt += `\n\n[STAY CONTEXT] This guest has ALREADY CHECKED OUT. Their stay is over. ` +
      `Do NOT offer active hotel services (room service, housekeeping, activity bookings). ` +
      `Only help with: post-stay questions, lost items, invoice queries, or future rebooking enquiries. ` +
      `Be warm and grateful for their stay.`
  } else if (stayStatus === 'pre_arrival') {
    systemPrompt += `\n\n[STAY CONTEXT] Guest has a booking but has NOT checked in yet. ` +
      `Check-in date: ${guest.check_in}. Help them prepare for arrival. ` +
      `You can answer questions and arrange things for when they arrive.`
  } else if (stayStatus === 'active') {
    systemPrompt += `\n\n[STAY CONTEXT] Guest is currently checked in. Room: ${guest.room}. ` +
      `Check-out: ${guest.check_out}. Provide full concierge service.`
  }

  // Add facilities
  const facilityText = formatFacilitiesForPrompt(facilities)
  if (facilityText) systemPrompt += `\n\n${facilityText}`

  // Add guest memory if returning guest
  const memoryText = formatMemoryForPrompt(memory, guest.language || 'en')
  if (memoryText) systemPrompt += memoryText

  // Add today's available products (experiences, events, etc.)
  const products    = await getAvailableProducts(hotel.id)
  const productText = formatProductsForPrompt(products, guest.language || 'en')
  if (productText) systemPrompt += productText

  // ── IMAGE HANDLING INSTRUCTIONS ──────────────────────────────
  // Tell Claude how to handle images and when to proactively ask for one
  systemPrompt += `\n\nIMAGE HANDLING:
You can see images sent by guests. When a guest sends a photo:
- Describe what you see and use it to help them directly
- For maintenance issues: identify the problem from the photo, create an urgent ticket, tell the guest what you see and what you're doing about it
- For location/taxi problems: read visible street signs, shop names, landmarks and relay the exact location to the driver
- For device confusion (remote controls, panels, buttons): describe exactly which button to press using position and any symbols you can see
- For restaurant/place photos: identify the establishment if visible and offer to book or provide info

PROACTIVELY ASK FOR A PHOTO when it would solve the problem faster:
- Guest reports taxi can't find them → "Can you send me a quick photo of where you are? A shop front or street sign would help 📸"
- Guest reports a maintenance problem → "Could you send a photo of the issue? It helps me send the right person 📸"  
- Guest describes a lost item → "Do you have a photo of it? It'll help housekeeping find it much faster 📸"
- Guest asks about a place they can see → "Feel free to send a photo — I can identify it for you 📸"

Always phrase the photo request naturally and explain why it helps.`

  // 9. Detect upsell context
  const lastBotMsg = [...(conv.messages||[])].reverse().find(m => m.role === 'assistant')
  const isRespondingToUpsell = lastBotMsg?.sent_by === 'scheduled' &&
    (lastBotMsg?.content?.includes('book') || lastBotMsg?.content?.includes('arrange') ||
     lastBotMsg?.content?.includes('réserv') || lastBotMsg?.content?.includes('buchen') ||
     lastBotMsg?.content?.includes('reserv') || lastBotMsg?.content?.includes('prenotare'))

  if (isRespondingToUpsell) {
    systemPrompt += '\n\nCONTEXT: Guest is responding to your activity suggestions. If they show interest, book immediately.'
  }

  // 10. Save user message + notification
  // If the guest sent photos, append a visible indicator so reception
  // can see in the dashboard that an image was involved.
  const hasMedia      = mediaUrls && mediaUrls.length > 0
  const mediaLabel    = hasMedia
    ? `📷 [Guest sent ${mediaUrls.length} photo${mediaUrls.length > 1 ? 's' : ''}]`
    : ''
  const savedMessage  = [message.trim(), mediaLabel].filter(Boolean).join('\n')

  await appendMessage(conv.id, 'user', savedMessage)
  await createNotification(hotel.id, {
    type:      'guest_message',
    title:     `${guest.name || 'Guest'} · Room ${guest.room || '?'}${hasMedia ? ' · 📷 Photo' : ''}`,
    body:      savedMessage.slice(0, 100),
    link_type: 'conversation',
    link_id:   conv.id,
  })

  // 11. Claude — pass images if present
  let aiResponse
  try { aiResponse = await callClaude(systemPrompt, history, message, mediaUrls || []) }
  catch {
    const fb = {
      en:'I\'m having a brief issue. Please try again.',
      ru:'Временная ошибка.',
      he:'שגיאה זמנית.',
      es:'Un momento, por favor. Inténtalo de nuevo.',
      de:'Kurzer Fehler. Bitte versuchen Sie es nochmal.',
      fr:'Un instant. Veuillez réessayer.',
      it:'Un momento. Riprova.',
      pt:'Um momento. Tente novamente.',
      zh:'请稍候，请重试。',
      ar:'خطأ مؤقت. حاول مرة أخرى.',
      nl:'Even een fout. Probeer het opnieuw.',
      pl:'Chwilowy błąd. Spróbuj ponownie.',
      sv:'Ett kortvarigt fel. Försök igen.',
      fi:'Lyhyt virhe. Yritä uudelleen.',
      uk:'Тимчасова помилка.',
      el:'Σφάλμα. Δοκιμάστε ξανά.',
      ca:'Un moment. Torna-ho a intentar.',
    }
    await sendWhatsApp(from, fb[guest.language]||fb.en); return
  }

  // 12. Handoff check
  const isHandoff = aiResponse.toLowerCase().includes('[handoff]') ||
    aiResponse.toLowerCase().includes('connect you with our') ||
    aiResponse.toLowerCase().includes('connect you with reception') ||
    aiResponse.toLowerCase().includes('te pongo en contacto') ||
    aiResponse.toLowerCase().includes('je vous mets en contact') ||
    aiResponse.toLowerCase().includes('verbinde sie mit') ||
    aiResponse.toLowerCase().includes('vi metto in contatto')

  if (isHandoff) {
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conv.id)
    await createNotification(hotel.id, {
      type:      'bot_handoff',
      title:     `Handoff — ${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
      body:      `"${message.slice(0, 80)}"`,
      link_type: 'conversation',
      link_id:   conv.id,
    })
    // 🔔 Push reception immediately
    notifyReceptionEscalation({
      hotelId:   hotel.id,
      guestName: `${guest.name||''} ${guest.surname||''}`.trim() || 'Guest',
      room:      guest.room || null,
      convId:    conv.id,
    }).catch(e => console.error('Push escalation error:', e))

    // ── FIX #10: Guest acknowledgement on escalation ──────────
    // Guest knows a human is coming — no awkward silence
    const receptionHours = hotel.config?.reception_hours || '08:00–23:00'
    const ackMsgs = {
      en: `I've passed your message to our team and someone will be with you shortly. Our reception is available ${receptionHours}. Thank you for your patience 🙏`,
      ru: `Я передал ваше сообщение нашей команде, скоро с вами свяжутся. Ресепшен работает ${receptionHours}. Спасибо за терпение 🙏`,
      he: `העברתי את הבקשה שלך לצוות שלנו, מישהו יצור איתך קשר בקרוב. הקבלה פתוחה ${receptionHours}. תודה על הסבלנות 🙏`,
      de: `Ich habe Ihre Nachricht an unser Team weitergeleitet. Jemand wird sich bald bei Ihnen melden. Rezeption: ${receptionHours}. Vielen Dank für Ihre Geduld 🙏`,
      fr: `J'ai transmis votre message à notre équipe, quelqu'un vous contactera bientôt. Réception disponible ${receptionHours}. Merci pour votre patience 🙏`,
      es: `He pasado su mensaje a nuestro equipo, alguien le atenderá en breve. Recepción disponible ${receptionHours}. Gracias por su paciencia 🙏`,
    }
    const ackMsg = ackMsgs[guest.language] || ackMsgs.en
    await sendWhatsApp(from, ackMsg)
    await appendMessage(conv.id, 'assistant', ackMsg)
  }

  // 13. Facility request check
  const { hasFacility, facility, cleanResponse: facilityClean } = parseFacilityRequest(aiResponse)
  if (hasFacility && facility) {
    await processFacilityRequest(facility, hotel, guest, conv.id)
    await sendWhatsApp(from, facilityClean)
    await appendMessage(conv.id, 'assistant', facilityClean)
    return
  }

  // 14. Parse BOTH booking and product order tags BEFORE sending to guest
  const { hasBooking, booking, cleanResponse: afterBooking } = parseBookingRequest(aiResponse)
  const { hasOrder, order: productOrder, cleanResponse: finalReply } = parseProductOrder(afterBooking || aiResponse)

  // Send the clean response (all tags stripped)
  const replyText = finalReply || afterBooking || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  if (hasBooking && booking) {
    const source = isRespondingToUpsell ? 'upsell' : 'guest_request'
    await processBooking(booking, hotel, guest, partners, source)

    const partner = partners.find(p =>
      p.name.toLowerCase().includes((booking.partner||'').toLowerCase()) || p.type === booking.type)
    if (partner || booking.type) {
      await updateGuestPreferences(guest.id, booking.type, partner?.name)
    }
  }

  // 15. Product order — send payment link
  if (hasOrder && productOrder) {
    await processProductOrder(productOrder, hotel, guest, conv.id, products, from)
  }
}

async function createNotification(hotelId, { type, title, body, link_type, link_id }) {
  try {
    await supabase.from('notifications').insert({ hotel_id: hotelId, type, title, body, link_type, link_id })
  } catch(e) { console.error('Notification error:', e.message) }
}

async function processFacilityRequest(facility, hotel, guest, convId) {
  try {
    const description = `FACILITY BOOKING REQUEST\nFacility: ${facility.facility}\nDate: ${facility.date||'TBC'}\nTime: ${facility.time||'TBC'}\nGuests: ${facility.guests||1}\n\nGuest: ${guest.name||''} ${guest.surname||''} · Room ${guest.room||'?'}\nPlease check availability and confirm with guest via WhatsApp.`
    await supabase.from('internal_tickets').insert({
      hotel_id: hotel.id, guest_id: guest.id,
      department: 'concierge', category: 'facility_booking',
      description, room: guest.room, priority: 'normal',
      status: 'pending', created_by: 'bot',
    })
    await createNotification(hotel.id, {
      type: 'guest_message',
      title: `Facility booking — ${facility.facility}`,
      body: `${guest.name||'Guest'} · Room ${guest.room} · ${facility.date} at ${facility.time}`,
      link_type: 'conversation', link_id: convId,
    })
  } catch(e) { console.error('Facility request error:', e.message) }
}

async function processBooking(booking, hotel, guest, partners, source = 'guest_request') {
  const partner = partners.find(p =>
    p.name.toLowerCase().includes((booking.partner||'').toLowerCase()) || p.type === booking.type)
  if (!partner) return
  const base = booking.details?.price || (partner.details?.price_per_person
    ? partner.details.price_per_person * (booking.details?.passengers||1) : 0)
  const comm = base > 0 ? +(base * partner.commission_rate / 100).toFixed(2) : 0
  const { data: saved } = await supabase.from('bookings').insert({
    hotel_id: hotel.id, guest_id: guest.id, partner_id: partner.id,
    type: booking.type, details: booking.details||{},
    commission_amount: comm, status: 'pending', source,
  }).select().single()
  if (!saved) return
  try {
    const msg = await sendWhatsApp(partner.phone, formatPartnerAlert(booking, guest, hotel))
    await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
  } catch(e) { console.error('Partner alert failed:', e.message) }
}

async function processProductOrder(orderData, hotel, guest, convId, products, guestPhone) {
  console.log('processProductOrder called:', JSON.stringify(orderData))

  // Find the product
  const product = products.find(p => p.id === orderData.product_id)
  if (!product) {
    console.error('processProductOrder: product not found:', orderData.product_id)
    console.error('Available product IDs:', products.map(p => p.id))
    return
  }

  // Find the tier — case-insensitive
  const tier = (product.tiers || []).find(t =>
    t.name.toLowerCase() === orderData.tier_name.toLowerCase()
  )
  if (!tier) {
    console.error('processProductOrder: tier not found:', orderData.tier_name)
    console.error('Available tiers:', (product.tiers||[]).map(t => t.name))
    return
  }

  const quantity = orderData.quantity || 1
  console.log(`Creating order: ${product.name} / ${tier.name} x${quantity} @ €${tier.price}`)

  try {
    const { order, paymentUrl } = await createGuestOrder({
      hotelId: hotel.id,
      guestId: guest.id,
      convId,
      product,
      tier,
      quantity,
      hotel,
      guest,
    })

    console.log('Order created:', order.id, 'Payment URL:', paymentUrl)

    const total      = (tier.price * quantity).toFixed(0)
    const tierLabel  = quantity > 1 ? `${quantity}× ${tier.name}` : tier.name
    const paymentMsg = [
      `💳 *${product.name} — ${tierLabel}*`,
      `Total: €${total}`,
      ``,
      `Your secure payment link:`,
      paymentUrl,
      ``,
      `⏱ Valid for 24 hours. Once paid I'll send your confirmation immediately.`,
    ].join('\n')

    await sendWhatsApp(guestPhone, paymentMsg)
    await appendMessage(convId, 'assistant', paymentMsg, { sent_by: 'payment_bot' })
    console.log(`✅ Payment link sent for order ${order.id}: €${total}`)

  } catch(e) {
    console.error('processProductOrder FAILED:', e.message)
    console.error(e.stack)
    // Send a fallback message so guest isn't left hanging
    try {
      await sendWhatsApp(guestPhone,
        `I'm arranging your payment link — please give me just a moment or ask reception to assist. 🙏`
      )
    } catch {}
  }
}
