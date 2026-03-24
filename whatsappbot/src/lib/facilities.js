// src/lib/facilities.js
// Loads hotel facilities and adds them to the system prompt
// Facility requests go to reception as internal tickets (Option D)

import { supabase } from './supabase.js'

export async function getFacilities(hotelId) {
  const { data } = await supabase
    .from('facilities')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('active', true)
    .order('type')
  return data || []
}

export function formatFacilitiesForPrompt(facilities) {
  if (!facilities || facilities.length === 0) return ''

  let text = 'HOTEL FACILITIES — available for guest booking:\n\n'

  facilities.forEach(f => {
    text += `${f.name}:\n`
    text += `${f.description}\n`
    if (f.capacity) text += `Capacity: up to ${f.capacity} people\n`
    text += '\n'
  })

  text += `FACILITY BOOKING PROCESS:
When a guest wants to book a facility, collect:
1. Which facility they want
2. Preferred date
3. Preferred time
4. Number of people

Then say: "I'll check availability and confirm your booking right away. Our team will reach out to confirm within a few minutes."

Then output: [FACILITY_REQUEST]{"facility":"Tennis Court","date":"2026-03-25","time":"16:00","guests":2,"guest_confirmation":"Your tennis court request for Tuesday at 4pm has been sent to our team. We will confirm within a few minutes!"}

Do NOT say the booking is confirmed — it needs reception to check their calendar first.`

  return text
}

export function parseFacilityRequest(aiResponse) {
  const marker = '[FACILITY_REQUEST]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasFacility: false, cleanResponse: aiResponse }

  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim()
    const parsed  = JSON.parse(jsonStr.split('\n')[0])
    return {
      hasFacility:   true,
      facility:      parsed,
      cleanResponse: parsed.guest_confirmation || aiResponse.slice(0, idx).trim()
    }
  } catch (e) {
    return { hasFacility: false, cleanResponse: aiResponse }
  }
}
