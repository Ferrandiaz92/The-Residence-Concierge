// src/lib/flights.js
// ============================================================
// AviationStack real-time flight data
// Used to:
//   1. Correct taxi pickup times based on actual arrival
//   2. Check departure times for outbound pickups
//   3. Detect flight delays proactively
//
// ENV VAR: AVIATIONSTACK_KEY=your_api_key
// Free tier: 100 requests/month
// Paid from $50/month for production
//
// API docs: https://aviationstack.com/documentation
// ============================================================

const BASE_URL = 'https://api.aviationstack.com/v1'

// ── FLIGHT NUMBER PATTERN ─────────────────────────────────────
// Matches: LCA247, LH401, BA 123, EK 007, CY 301
export const FLIGHT_PATTERN = /\b([A-Z][A-Z0-9]|[A-Z]{3})\s*(\d{1,4}[A-Z]?)\b/

export function extractFlightNumber(text) {
  const FALSE_POSITIVES = new Set(['TV', 'AC', 'OK', 'NO', 'MY', 'TO', 'GO', 'DO', 'SO', 'IT', 'BE', 'AM'])
  const re      = new RegExp(FLIGHT_PATTERN.source, 'g')
  const upper   = text.toUpperCase()
  const matches = []
  let m
  while ((m = re.exec(upper)) !== null) {
    const iata = m[1] + m[2]
    if (!FALSE_POSITIVES.has(m[1])) matches.push(iata)
  }
  if (matches.length === 0) return null
  // Return first match (operating carrier for codeshares)
  return matches[0]
}

// Extract ALL flight numbers from text (for codeshares)
export function extractAllFlightNumbers(text) {
  const FALSE_POSITIVES = new Set(['TV', 'AC', 'OK', 'NO', 'MY', 'TO', 'GO', 'DO', 'SO', 'IT', 'BE', 'AM'])
  const re      = new RegExp(FLIGHT_PATTERN.source, 'g')
  const upper   = text.toUpperCase()
  const matches = []
  let m
  while ((m = re.exec(upper)) !== null) {
    const iata = m[1] + m[2]
    if (!FALSE_POSITIVES.has(m[1])) matches.push(iata)
  }
  return matches
}

// ── FETCH FLIGHT STATUS ───────────────────────────────────────
export async function getFlightStatus(flightIata) {
  const key = process.env.AVIATIONSTACK_KEY
  if (!key) {
    console.warn('AVIATIONSTACK_KEY not configured')
    return null
  }

  try {
    const url = `${BASE_URL}/flights?access_key=${key}&flight_iata=${encodeURIComponent(flightIata)}&limit=1`
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      console.error(`AviationStack error: ${res.status}`)
      return null
    }

    const data = await res.json()
    if (data.error || !data.data || data.data.length === 0) {
      console.warn(`Flight ${flightIata} not found`)
      return null
    }

    const flight = data.data[0]

    return {
      iata:              flight.flight?.iata,
      status:            flight.flight_status,          // scheduled | active | landed | cancelled | diverted
      airline:           flight.airline?.name,
      origin:            flight.departure?.airport,
      originIata:        flight.departure?.iata,
      destination:       flight.arrival?.airport,
      destinationIata:   flight.arrival?.iata,
      // Departure
      scheduledDepart:   flight.departure?.scheduled,
      estimatedDepart:   flight.departure?.estimated,
      actualDepart:      flight.departure?.actual,
      departDelay:       flight.departure?.delay || 0,  // minutes
      departTerminal:    flight.departure?.terminal,
      // Arrival
      scheduledArrive:   flight.arrival?.scheduled,
      estimatedArrive:   flight.arrival?.estimated,
      actualArrive:      flight.arrival?.actual,
      arriveDelay:       flight.arrival?.delay || 0,    // minutes
      arriveTerminal:    flight.arrival?.terminal,
      gate:              flight.arrival?.gate,
    }
  } catch (err) {
    console.error('AviationStack fetch failed:', err.message)
    return null
  }
}

// ── CALCULATE CORRECT TAXI TIME ───────────────────────────────
// Given a flight and direction (arrival/departure), returns
// the recommended taxi pickup time accounting for delays
export function calculateTaxiTime(flight, direction, hotelConfig = {}) {
  if (!flight) return null

  const driveMins = hotelConfig.airport_drive_mins || 30  // configurable per hotel

  if (direction === 'arrival') {
    // Guest arriving: use estimated arrival + immigration/baggage time (30 min)
    const landingTime = flight.estimatedArrive || flight.scheduledArrive
    if (!landingTime) return null
    const arrival   = new Date(landingTime)
    const clearance = 30  // minutes for immigration + baggage
    const pickup    = new Date(arrival.getTime() + clearance * 60 * 1000)
    return {
      pickupTime:    pickup,
      pickupTimeStr: pickup.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }),
      delayMins:     flight.arriveDelay,
      isDelayed:     flight.arriveDelay > 15,
      note:          flight.arriveDelay > 15
        ? `Flight delayed ${flight.arriveDelay} min — pickup adjusted to ${pickup.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`
        : null,
    }
  }

  if (direction === 'departure') {
    // Guest departing: work backwards from departure time
    const departTime = flight.estimatedDepart || flight.scheduledDepart
    if (!departTime) return null
    const depart      = new Date(departTime)
    const bufferMins  = 120  // 2h before departure for check-in/security
    const pickupTime  = new Date(depart.getTime() - (bufferMins + driveMins) * 60 * 1000)
    return {
      pickupTime:    pickupTime,
      pickupTimeStr: pickupTime.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }),
      delayMins:     flight.departDelay,
      isDelayed:     flight.departDelay > 15,
      flightDeparts: depart.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }),
      note:          `Recommended pickup: ${pickupTime.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })} (2h before departure + ${driveMins}min drive)`,
    }
  }

  return null
}

// ── FLIGHT STATUS SUMMARY FOR BOT ─────────────────────────────
// Returns a human-readable string the bot can include in its response
export function formatFlightStatus(flight, lang = 'en') {
  if (!flight) return null

  const statusEmoji = {
    scheduled: '🕐',
    active:    '✈️',
    landed:    '✅',
    cancelled: '❌',
    diverted:  '⚠️',
  }

  const emoji = statusEmoji[flight.status] || '✈️'

  const templates = {
    en: {
      landed:    `${emoji} Flight ${flight.iata} has landed. Baggage claim at Terminal ${flight.arriveTerminal || '?'}.`,
      delayed:   `${emoji} Flight ${flight.iata} is delayed by ${flight.arriveDelay} minutes. New estimated arrival: ${new Date(flight.estimatedArrive).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}.`,
      ontime:    `${emoji} Flight ${flight.iata} is on schedule.`,
      cancelled: `❌ Flight ${flight.iata} has been cancelled. Please contact your airline.`,
    },
    ru: {
      landed:    `${emoji} Рейс ${flight.iata} приземлился. Получение багажа в терминале ${flight.arriveTerminal || '?'}.`,
      delayed:   `${emoji} Рейс ${flight.iata} задержан на ${flight.arriveDelay} минут. Новое расчётное время прибытия: ${new Date(flight.estimatedArrive).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}.`,
      ontime:    `${emoji} Рейс ${flight.iata} выполняется по расписанию.`,
      cancelled: `❌ Рейс ${flight.iata} отменён. Обратитесь в авиакомпанию.`,
    },
    es: {
      landed:    `${emoji} El vuelo ${flight.iata} ha aterrizado. Recogida de equipaje en Terminal ${flight.arriveTerminal || '?'}.`,
      delayed:   `${emoji} El vuelo ${flight.iata} tiene un retraso de ${flight.arriveDelay} minutos.`,
      ontime:    `${emoji} El vuelo ${flight.iata} va puntual.`,
      cancelled: `❌ El vuelo ${flight.iata} ha sido cancelado.`,
    },
  }

  const t = templates[lang] || templates.en

  if (flight.status === 'cancelled') return t.cancelled
  if (flight.status === 'landed')    return t.landed
  if (flight.arriveDelay > 15)       return t.delayed
  return t.ontime
}
