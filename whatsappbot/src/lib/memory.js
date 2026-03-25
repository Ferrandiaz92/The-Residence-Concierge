// src/lib/memory.js
// Loads guest memory across stays and formats it for the bot

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── LOAD GUEST MEMORY ─────────────────────────────────────────
export async function loadGuestMemory(guestId) {
  const supabase = getSupabase()

  // Load guest with preferences
  const { data: guest } = await supabase
    .from('guests')
    .select('*')
    .eq('id', guestId)
    .single()

  if (!guest) return null

  // Load previous stays
  const { data: stays } = await supabase
    .from('guest_stays')
    .select('*')
    .eq('guest_id', guestId)
    .order('check_in', { ascending: false })
    .limit(5)

  // Load all past bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('type, details, partners(name, type), created_at, status')
    .eq('guest_id', guestId)
    .in('status', ['confirmed', 'completed'])
    .order('created_at', { ascending: false })
    .limit(20)

  // Load past feedback
  const { data: feedback } = await supabase
    .from('guest_feedback')
    .select('rating, comment, created_at')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
    .limit(3)

  // Calculate favourite services
  const serviceCounts = {}
  ;(bookings || []).forEach(b => {
    const key = b.partners?.name || b.type
    serviceCounts[key] = (serviceCounts[key] || 0) + 1
  })
  const favourites = Object.entries(serviceCounts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)

  return {
    guest,
    previousStays:  stays || [],
    pastBookings:   bookings || [],
    feedback:       feedback || [],
    favourites,
    isReturning:    (guest.visit_count || 1) > 1,
    visitCount:     guest.visit_count || 1,
  }
}

// ── FORMAT MEMORY FOR SYSTEM PROMPT ──────────────────────────
export function formatMemoryForPrompt(memory, lang) {
  if (!memory || !memory.isReturning) return ''

  const { guest, previousStays, pastBookings, feedback, favourites, visitCount } = memory

  const ordinal = { en: ['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'],
    ru: ['','1-й','2-й','3-й','4-й','5-й'], es: ['','1ª','2ª','3ª','4ª','5ª'],
    de: ['','1.','2.','3.','4.','5.'], fr: ['','1ère','2ème','3ème','4ème','5ème'],
    it: ['','1°','2°','3°','4°','5°'], pt: ['','1ª','2ª','3ª','4ª','5ª'],
  }
  const ord = (ordinal[lang] || ordinal.en)[Math.min(visitCount, 10)] || `${visitCount}th`

  let text = `\nGUEST MEMORY — RETURNING GUEST (${ord} visit):\n`
  text += `This is ${guest.name}'s ${ord} stay at this hotel.\n`

  if (previousStays.length > 0) {
    const lastStay = previousStays[0]
    if (lastStay.check_in) {
      const lastDate = new Date(lastStay.check_in).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      text += `Last visit: ${lastDate}`
      if (lastStay.room) text += ` (Room ${lastStay.room})`
      text += '\n'
    }
  }

  if (favourites.length > 0) {
    text += `Favourite services from previous stays: ${favourites.join(', ')}\n`
  }

  if (pastBookings.length > 0) {
    const recentBookings = pastBookings.slice(0, 5)
    text += `Previous bookings: ${recentBookings.map(b => b.partners?.name || b.type).join(', ')}\n`
  }

  if (feedback.length > 0 && feedback[0].rating) {
    text += `Previous feedback rating: ${feedback[0].rating}/5\n`
    if (feedback[0].comment) text += `Comment: "${feedback[0].comment}"\n`
  }

  if (guest.preferences && Object.keys(guest.preferences).length > 0) {
    const prefs = Object.entries(guest.preferences)
      .map(([k,v]) => `${k}: ${v}`).join(', ')
    text += `Noted preferences: ${prefs}\n`
  }

  if (guest.notes) {
    text += `Staff notes: ${guest.notes}\n`
  }

  // Instructions for how to use this
  text += `\nHOW TO USE THIS MEMORY:
- Greet them warmly as a returning guest — acknowledge this isn't their first visit
- If they booked services before, proactively suggest them again
- Reference their previous experience naturally but don't be creepy about it
- Example: "Welcome back ${guest.name}! Lovely to have you with us again 🌴 Last time you enjoyed the boat tour — shall I arrange it again?"
- Adapt to their language and communication style from previous conversations\n`

  return text
}

// ── DETECT RETURNING GUEST ────────────────────────────────────
// Called when a new message arrives — checks if this phone number
// has stayed before and links the guest records

export async function detectReturningGuest(phone, hotelId) {
  const supabase = getSupabase()

  // Find all guest records for this phone at this hotel
  const { data: guests } = await supabase
    .from('guests')
    .select('*')
    .eq('phone', phone)
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })

  if (!guests || guests.length === 0) return null

  // Most recent guest record
  const currentGuest = guests[0]

  // If they have previous stays, count them
  const { data: stayCount } = await supabase
    .from('guest_stays')
    .select('id', { count: 'exact' })
    .eq('guest_id', currentGuest.id)

  const previousStayCount = stayCount?.length || 0

  if (previousStayCount > 0 || (currentGuest.visit_count || 1) > 1) {
    return {
      isReturning: true,
      guest:       currentGuest,
      stayCount:   previousStayCount + 1,
    }
  }

  return { isReturning: false, guest: currentGuest, stayCount: 1 }
}

// ── UPDATE PREFERENCES AFTER BOOKING ─────────────────────────
// Called after a booking is confirmed — learns guest preferences

export async function updateGuestPreferences(guestId, bookingType, partnerName) {
  const supabase = getSupabase()

  const { data: guest } = await supabase
    .from('guests').select('favourite_services, total_bookings').eq('id', guestId).single()
  if (!guest) return

  const current    = guest.favourite_services || []
  const bookingKey = partnerName || bookingType

  // Add to favourites if not already there
  if (!current.includes(bookingKey)) {
    current.push(bookingKey)
  }

  await supabase.from('guests').update({
    favourite_services: current.slice(-10), // keep last 10
    total_bookings: (guest.total_bookings || 0) + 1,
  }).eq('id', guestId)
}

// ── SAVE STAY ON CHECKOUT ─────────────────────────────────────
// Archives the current stay to guest_stays table

export async function archiveCurrentStay(guestId) {
  const supabase = getSupabase()

  const { data: guest } = await supabase
    .from('guests').select('*').eq('id', guestId).single()
  if (!guest || !guest.check_in) return

  // Count bookings this stay
  const { data: bookings } = await supabase
    .from('bookings')
    .select('type, partners(name)')
    .eq('guest_id', guestId)
    .gte('created_at', guest.check_in)
    .in('status', ['confirmed','completed'])

  const servicesUsed = [...new Set((bookings||[]).map(b => b.partners?.name || b.type))]

  // Get feedback for this stay
  const { data: feedback } = await supabase
    .from('guest_feedback')
    .select('rating')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Archive
  await supabase.from('guest_stays').upsert({
    hotel_id:      guest.hotel_id,
    guest_id:      guestId,
    room:          guest.room,
    check_in:      guest.check_in,
    check_out:     guest.check_out,
    bookings_made: bookings?.length || 0,
    services_used: servicesUsed,
    rating:        feedback?.rating || null,
    notes:         guest.notes,
  }, { onConflict: 'guest_id,check_in' })

  // Update visit count and last stay
  await supabase.from('guests').update({
    visit_count:  (guest.visit_count || 1),
    last_stay_at: guest.check_in,
    first_stay_at: guest.first_stay_at || guest.check_in,
  }).eq('id', guestId)
}
