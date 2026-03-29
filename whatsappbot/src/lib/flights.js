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

// AeroDataBox via RapidAPI — real-time flight data

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

// ── FETCH FLIGHT STATUS via AeroDataBox (RapidAPI) ───────────
// Free tier: 500 requests/month, real-time data
// Docs: rapidapi.com/aedbx-aedbx/api/aerodatabox
export async function getFlightStatus(flightIata) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) {
    console.warn('RAPIDAPI_KEY not configured')
    return null
  }

  try {
    // AeroDataBox needs today's date for active flights
    const today = new Date().toISOString().split('T')[0]  // YYYY-MM-DD
    const url   = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightIata)}/${today}`

    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key':  key,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(4000),
    })

    console.log(`AeroDataBox ${flightIata} ${today}: status=${res.status}`)

    if (res.status === 404) {
      console.log(`AeroDataBox: trying yesterday/tomorrow for ${flightIata}`)
      const results = await Promise.all([
        fetchAeroDataBox(key, flightIata, getDateOffset(-1)),
        fetchAeroDataBox(key, flightIata, getDateOffset(1)),
      ])
      const found = results.find(r => r !== null)
      console.log(`AeroDataBox fallback result:`, found ? 'found' : 'not found')
      return found || null
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`AeroDataBox error: ${res.status} — ${errText.slice(0,200)}`)
      return null
    }

    const data = await res.json()
    console.log(`AeroDataBox raw data:`, JSON.stringify(data).slice(0, 300))
    const parsed = parseAeroDataBox(flightIata, data)
    console.log(`AeroDataBox parsed:`, JSON.stringify(parsed).slice(0, 200))
    return parsed

  } catch (err) {
    console.error('AeroDataBox fetch failed:', err.message)
    return null
  }
}

function getDateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

async function fetchAeroDataBox(key, flightIata, date) {
  try {
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightIata)}/${date}`
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key':  key,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return parseAeroDataBox(flightIata, data)
  } catch {
    return null
  }
}

function parseAeroDataBox(flightIata, data) {
  // AeroDataBox returns an array of flight legs
  const flight = Array.isArray(data) ? data[0] : data
  if (!flight) return null

  const dep = flight.departure || {}
  const arr = flight.arrival   || {}

  // Determine status
  const status = flight.status?.toLowerCase() || 'scheduled'

  const depDelay = dep.delay || 0
  const arrDelay = arr.delay || 0

  return {
    iata:            flightIata,
    status,
    airline:         flight.airline?.name || flight.airline?.iata,
    origin:          dep.airport?.name,
    originIata:      dep.airport?.iata,
    destination:     arr.airport?.name,
    destinationIata: arr.airport?.iata,
    // Departure
    scheduledDepart: dep.scheduledTime?.utc || dep.scheduledTime?.local,
    estimatedDepart: dep.revisedTime?.utc   || dep.revisedTime?.local || dep.scheduledTime?.utc,
    actualDepart:    dep.actualTime?.utc    || dep.actualTime?.local,
    departDelay:     depDelay,
    departTerminal:  dep.terminal,
    departGate:      dep.gate,
    // Arrival
    scheduledArrive: arr.scheduledTime?.utc || arr.scheduledTime?.local,
    estimatedArrive: arr.revisedTime?.utc   || arr.revisedTime?.local || arr.scheduledTime?.utc,
    actualArrive:    arr.actualTime?.utc    || arr.actualTime?.local,
    arriveDelay:     arrDelay,
    arriveTerminal:  arr.terminal,
    gate:            arr.gate,
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
