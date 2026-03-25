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

export async function handleInboundWhatsApp(rawBody) {
  const { from, to, message, profileName } = parseIncomingMessage(rawBody)
  console.log(`Inbound: ${from} → ${to}: "${message.slice(0, 80)}"`)
  if (!message.trim()) return

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

  // Add facilities
  const facilityText = formatFacilitiesForPrompt(facilities)
  if (facilityText) systemPrompt += `\n\n${facilityText}`

  // Add guest memory if returning guest
  const memoryText = formatMemoryForPrompt(memory, guest.language || 'en')
  if (memoryText) systemPrompt += memoryText

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
  await appendMessage(conv.id, 'user', message)
  await createNotification(hotel.id, {
    type:      'guest_message',
    title:     `${guest.name || 'Guest'} · Room ${guest.room || '?'}`,
    body:      message.slice(0, 100),
    link_type: 'conversation',
    link_id:   conv.id,
  })

  // 11. Claude
  let aiResponse
  try { aiResponse = await callClaude(systemPrompt, history, message) }
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
  }

  // 13. Facility request check
  const { hasFacility, facility, cleanResponse: facilityClean } = parseFacilityRequest(aiResponse)
  if (hasFacility && facility) {
    await processFacilityRequest(facility, hotel, guest, conv.id)
    await sendWhatsApp(from, facilityClean)
    await appendMessage(conv.id, 'assistant', facilityClean)
    return
  }

  // 14. Booking check
  const { hasBooking, booking, cleanResponse } = parseBookingRequest(aiResponse)
  const replyText = cleanResponse || aiResponse
  await sendWhatsApp(from, replyText)
  await appendMessage(conv.id, 'assistant', replyText)

  if (hasBooking && booking) {
    const source = isRespondingToUpsell ? 'upsell' : 'guest_request'
    await processBooking(booking, hotel, guest, partners, source)

    // Update guest preferences — learn what they like
    const partner = partners.find(p =>
      p.name.toLowerCase().includes((booking.partner||'').toLowerCase()) || p.type === booking.type)
    if (partner || booking.type) {
      await updateGuestPreferences(guest.id, booking.type, partner?.name)
    }
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
