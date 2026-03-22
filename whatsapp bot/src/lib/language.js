// src/lib/language.js
// Detects guest language and builds the AI system prompt

// ── LANGUAGE DETECTION ────────────────────────────────────────────────────────

const HEBREW_RANGE  = /[\u0590-\u05FF]/
const CYRILLIC_RANGE = /[\u0400-\u04FF]/

export function detectLanguage(text) {
  if (!text) return 'en'
  if (HEBREW_RANGE.test(text))   return 'he'
  if (CYRILLIC_RANGE.test(text)) return 'ru'
  return 'en'
}

export function getLanguageName(code) {
  return { en: 'English', ru: 'Russian', he: 'Hebrew' }[code] || 'English'
}

// ── SYSTEM PROMPT BUILDER ─────────────────────────────────────────────────────

export function buildSystemPrompt(hotel, guest, partners) {
  const lang     = guest?.language || 'en'
  const langName = getLanguageName(lang)
  const config   = hotel.config || {}

  // Format partners by type
  const taxis       = partners.filter(p => p.type === 'taxi')
  const restaurants = partners.filter(p => p.type === 'restaurant')
  const activities  = partners.filter(p => p.type === 'activity')

  const partnerList = [
    taxis.length       ? `TAXI PARTNERS:\n${taxis.map(p =>
      `- ${p.name}: WhatsApp ${p.phone}${p.details?.car ? `, ${p.details.car}` : ''}${p.details?.plate ? `, plate ${p.details.plate}` : ''}`
    ).join('\n')}` : '',

    restaurants.length ? `RESTAURANT PARTNERS:\n${restaurants.map(p =>
      `- ${p.name}: WhatsApp ${p.phone}${p.details?.cuisine ? `, ${p.details.cuisine}` : ''}${p.details?.address ? `, ${p.details.address}` : ''}`
    ).join('\n')}` : '',

    activities.length  ? `ACTIVITY PARTNERS:\n${activities.map(p =>
      `- ${p.name}: WhatsApp ${p.phone}${p.details?.type ? `, ${p.details.type}` : ''}${p.details?.price_per_person ? `, €${p.details.price_per_person}/person` : ''}`
    ).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const guestContext = guest ? [
    guest.name   ? `Guest name: ${guest.name} ${guest.surname || ''}`.trim() : '',
    guest.room   ? `Room: ${guest.room}` : '',
    guest.check_in  ? `Check-in: ${guest.check_in}` : '',
    guest.check_out ? `Check-out: ${guest.check_out}` : '',
  ].filter(Boolean).join('\n') : ''

  return `You are the personal concierge at ${hotel.name} in Limassol, Cyprus.

LANGUAGE: You MUST respond in ${langName}. Detect the guest's language from their message and always match it. Never switch languages mid-conversation.

YOUR PERSONALITY:
- Warm, attentive and genuinely helpful — like a real luxury hotel concierge
- Personal and human — never robotic or generic
- Proactive — anticipate needs, offer relevant extras
- Never say "I'm an AI" or "I'm a chatbot" — you are THE RESIDENCE CONCIERGE

${hotel.system_prompt ? `HOTEL INSTRUCTIONS:\n${hotel.system_prompt}` : ''}

HOTEL INFORMATION:
- Name: ${hotel.name}
- Address: ${config.address || 'Limassol, Cyprus'}
- Check-in: ${config.checkin_time || '15:00'} | Check-out: ${config.checkout_time || '12:00'}
${config.restaurant ? `- Restaurant: ${config.restaurant.name}, open ${config.restaurant.hours}
  Breakfast ${config.restaurant.breakfast}, Lunch ${config.restaurant.lunch}, Dinner ${config.restaurant.dinner}` : ''}
${config.pool ? `- Pool: open ${config.pool.hours}` : ''}
${config.spa ? `- Spa: open ${config.spa.hours}` : ''}

${guestContext ? `CURRENT GUEST:\n${guestContext}` : ''}

${partnerList ? `OUR TRUSTED PARTNERS:\n${partnerList}` : ''}

WHAT YOU CAN DO:
1. ANSWER questions about the hotel — hours, menu, facilities, policies
2. BOOK taxis — collect: destination, date/time, number of passengers
3. BOOK restaurants — collect: date, time, number of guests, any preferences
4. BOOK activities — collect: date, number of people, any preferences
5. HANDLE late checkout requests — check if available, quote the fee
6. GIVE local recommendations — beaches, restaurants, sightseeing, nightlife
7. ESCALATE to human staff — if request is complex or urgent, say "I'll connect you with our team right away"

BOOKING FLOW:
- When a guest wants to book something, collect all needed details first
- Then confirm: "Shall I arrange this for you?" 
- When they confirm, respond with: [BOOKING_REQUEST] followed by a JSON object like:
  [BOOKING_REQUEST]{"type":"taxi","partner":"Christos Taxi","details":{"destination":"Larnaca Airport","time":"18:00","date":"2026-03-25","passengers":2},"guest_confirmation":"Your taxi is confirmed! Christos will be at the hotel entrance at 6pm in a Mercedes E-Class (MMN 43343). Enjoy your journey!"}
- This triggers the automatic partner alert — do not explain this to the guest

IMPORTANT RULES:
- NEVER make up information — if unsure, say you'll check and confirm
- NEVER share other guests' information
- NEVER discuss pricing unless you have it in the partner details
- Keep responses concise — guests are on mobile WhatsApp
- Use line breaks to make messages readable on mobile
- An occasional emoji is fine but don't overdo it`
}

// ── BOOKING PARSER ────────────────────────────────────────────────────────────

export function parseBookingRequest(aiResponse) {
  const marker = '[BOOKING_REQUEST]'
  const idx = aiResponse.indexOf(marker)
  if (idx === -1) return { hasBooking: false, cleanResponse: aiResponse }

  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim()
    // Extract JSON object (handle trailing text)
    const jsonEnd = jsonStr.indexOf('\n', jsonStr.indexOf('}')) 
    const parsed  = JSON.parse(jsonEnd > 0 ? jsonStr.slice(0, jsonEnd + 1) : jsonStr)

    const cleanResponse = aiResponse.slice(0, idx).trim()

    return {
      hasBooking: true,
      booking:    parsed,
      cleanResponse: parsed.guest_confirmation || cleanResponse
    }
  } catch (e) {
    console.error('Failed to parse booking request:', e)
    return { hasBooking: false, cleanResponse: aiResponse }
  }
}

// ── PARTNER ALERT FORMATTER ───────────────────────────────────────────────────

export function formatPartnerAlert(booking, guest, hotel) {
  const { type, details } = booking
  const guestName = guest.name ? `${guest.name} ${guest.surname || ''}`.trim() : 'Hotel Guest'
  const room = guest.room ? `Room ${guest.room}` : ''

  const templates = {
    taxi: `🚗 NEW TAXI BOOKING — ${hotel.name}

Guest: ${guestName}${room ? ` · ${room}` : ''}
Destination: ${details.destination || 'TBC'}
Date: ${details.date || 'Today'}
Time: ${details.time || 'TBC'}
Passengers: ${details.passengers || 1}
${details.notes ? `Notes: ${details.notes}` : ''}

Reply ✅ to confirm or ❌ to decline`,

    restaurant: `🍽️ NEW RESERVATION — ${hotel.name}

Guest: ${guestName}${room ? ` · ${room}` : ''}
Date: ${details.date || 'Today'}
Time: ${details.time || 'TBC'}
Guests: ${details.guests || 2}
${details.preferences ? `Preferences: ${details.preferences}` : ''}

Reply ✅ to confirm, ❌ to decline, or 🕐 to suggest alternative time`,

    activity: `⛵ NEW ACTIVITY BOOKING — ${hotel.name}

Guest: ${guestName}${room ? ` · ${room}` : ''}
Activity: ${details.activity || type}
Date: ${details.date || 'TBC'}
Participants: ${details.participants || details.passengers || 1}
${details.notes ? `Notes: ${details.notes}` : ''}

Reply ✅ to confirm or ❌ to decline`,
  }

  return templates[type] || `📋 NEW BOOKING — ${hotel.name}\n\nGuest: ${guestName}\nType: ${type}\n\nReply ✅ to confirm or ❌ to decline`
}
