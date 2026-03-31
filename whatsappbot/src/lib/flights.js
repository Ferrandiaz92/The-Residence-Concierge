// src/lib/flights.js
// ============================================================
// AeroDataBox via RapidAPI — real-time flight status
//
// ENV VAR required: RAPIDAPI_KEY
// Get from: rapidapi.com → search AeroDataBox → Subscribe (free: 500/month)
// Add to Vercel: Project Settings → Environment Variables → RAPIDAPI_KEY
//
// Flight number format: AeroDataBox expects IATA designator with space
// e.g. 'A3 0904'  (Aegean flight 904)
//      'W6 7837'  (Wizz Air flight 7837)
//      'BA 123'   (British Airways flight 123)
// The extraction regex already produces this format (group1 + ' ' + group2).
// ============================================================

// ── FLIGHT NUMBER PATTERN ─────────────────────────────────────
// Matches: A30904→A3+0904, BA123→BA+123, EZY1234→EZY+1234
export const FLIGHT_PATTERN = /\b([A-Z][A-Z0-9]|[A-Z]{3})\s*(\d{1,4}[A-Z]?)\b/

export function extractFlightNumber(text) {
  const FALSE_POSITIVES = new Set(['TV','AC','OK','NO','MY','TO','GO','DO','SO','IT','BE','AM'])
  const re    = new RegExp(FLIGHT_PATTERN.source, 'g')
  const upper = text.toUpperCase()
  let m
  while ((m = re.exec(upper)) !== null) {
    if (!FALSE_POSITIVES.has(m[1])) return `${m[1]} ${m[2]}`
  }
  return null
}

export function extractAllFlightNumbers(text) {
  const FALSE_POSITIVES = new Set(['TV','AC','OK','NO','MY','TO','GO','DO','SO','IT','BE','AM'])
  const re      = new RegExp(FLIGHT_PATTERN.source, 'g')
  const upper   = text.toUpperCase()
  const matches = []
  let m
  while ((m = re.exec(upper)) !== null) {
    // Join with space — this IS the correct IATA designator format for AeroDataBox
    // e.g. group1='A3' group2='0904' → 'A3 0904' (NOT 'A30904')
    if (!FALSE_POSITIVES.has(m[1])) matches.push(`${m[1]} ${m[2]}`)
  }
  return matches
}

function getDateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ── LOCAL TIME FORMATTER ──────────────────────────────────────
function fmtLocal(s) {
  const m = (s || '').match(/(\d{2}:\d{2})/)
  return m ? m[1] : null
}

// ── PARSE AERODATABOX RESPONSE ────────────────────────────────
function parseAeroDataBox(flightDesignator, data) {
  const flight = Array.isArray(data) ? data[0] : data
  if (!flight) return null

  const dep = flight.departure || {}
  const arr = flight.arrival   || {}

  const status   = flight.status?.toLowerCase() || 'scheduled'
  const depDelay = dep.delay || 0
  const arrDelay = arr.delay || 0

  const arrLocal = arr.predictedTime?.local || arr.revisedTime?.local || arr.scheduledTime?.local
  const depLocal = dep.revisedTime?.local   || dep.scheduledTime?.local

  return {
    iata:               flightDesignator,
    status,
    airline:            flight.airline?.name || flight.airline?.iata,
    origin:             dep.airport?.name,
    originIata:         dep.airport?.iata,
    destination:        arr.airport?.name,
    destinationIata:    arr.airport?.iata,
    // Departure
    scheduledDepart:    dep.scheduledTime?.utc || dep.scheduledTime?.local,
    estimatedDepart:    dep.revisedTime?.utc   || dep.revisedTime?.local || dep.scheduledTime?.utc,
    actualDepart:       dep.actualTime?.utc    || dep.actualTime?.local,
    departDelay,
    departTerminal:     dep.terminal,
    departGate:         dep.gate,
    departureTimeLocal: fmtLocal(depLocal),
    // Arrival
    scheduledArrive:    arr.scheduledTime?.utc || arr.scheduledTime?.local,
    estimatedArrive:    arr.revisedTime?.utc   || arr.revisedTime?.local || arr.scheduledTime?.utc,
    actualArrive:       arr.actualTime?.utc    || arr.actualTime?.local,
    arriveDelay:        arrDelay,
    arriveTerminal:     arr.terminal,
    gate:               arr.gate,
    arrivalTimeLocal:   fmtLocal(arrLocal),
  }
}

// ── SINGLE DATE FETCH ─────────────────────────────────────────
// Tries the designator as given, then without the space (e.g. 'W6 4600' then 'W64600')
// because AeroDataBox accepts both forms and we don't know which this instance prefers.
async function fetchOne(key, flightDesignator, date) {
  const formats = [
    flightDesignator,                        // 'W6 4600' — correct IATA format
    flightDesignator.replace(' ', ''),       // 'W64600'  — compact form (what worked before)
  ]
  for (const fmt of formats) {
    try {
      const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(fmt)}/${date}`
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key':  key,
          'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(8000),
      })
      console.log(`AeroDataBox ${fmt} ${date}: HTTP ${res.status}`)
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data) && data.length === 0) {
        console.log(`AeroDataBox ${fmt} ${date}: empty — not operating this date`)
        continue
      }
      const parsed = parseAeroDataBox(flightDesignator, data)
      if (parsed) {
        console.log(`AeroDataBox ${fmt} ${date}: OK — ${parsed.status}`)
        return parsed
      }
    } catch (e) {
      console.warn(`AeroDataBox ${fmt} ${date} error: ${e.message}`)
    }
  }
  return null
}

// ── MAIN EXPORT — tries today, yesterday, tomorrow ────────────
export async function getFlightStatus(flightDesignator) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) {
    console.warn('RAPIDAPI_KEY not set in environment — flight lookup disabled')
    return null
  }

  console.log(`Flight lookup: ${flightDesignator}`)

  // Try today first
  const today = getDateOffset(0)
  const result = await fetchOne(key, flightDesignator, today)
  if (result) return result

  // Try yesterday and tomorrow in parallel (handles midnight edge cases
  // and guests asking about next-day arrivals)
  console.log(`AeroDataBox ${flightDesignator}: today empty, trying ±1 day`)
  const [yesterday, tomorrow] = await Promise.all([
    fetchOne(key, flightDesignator, getDateOffset(-1)),
    fetchOne(key, flightDesignator, getDateOffset(1)),
  ])
  const fallback = yesterday || tomorrow
  if (fallback) {
    console.log(`AeroDataBox ${flightDesignator}: found on adjacent date`)
    return fallback
  }

  console.log(`AeroDataBox ${flightDesignator}: not found on any date`)
  return null
}

// ── TAXI TIME CALCULATOR ──────────────────────────────────────
export function calculateTaxiTime(flight, direction, hotelConfig = {}) {
  if (!flight) return null
  const driveMins = hotelConfig.airport_drive_mins || 30

  if (direction === 'arrival') {
    const landingTime = flight.estimatedArrive || flight.scheduledArrive
    if (!landingTime) return null
    const arrival   = new Date(landingTime)
    const clearance = 30
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
    const departTime = flight.estimatedDepart || flight.scheduledDepart
    if (!departTime) return null
    const depart     = new Date(departTime)
    const bufferMins = 120
    const pickupTime = new Date(depart.getTime() - (bufferMins + driveMins) * 60 * 1000)
    return {
      pickupTime,
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
export function formatFlightStatus(flight, lang = 'en') {
  if (!flight) return null

  const statusEmoji = { scheduled:'🕐', active:'✈️', landed:'✅', cancelled:'❌', diverted:'⚠️' }
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
      delayed:   `${emoji} Рейс ${flight.iata} задержан на ${flight.arriveDelay} минут.`,
      ontime:    `${emoji} Рейс ${flight.iata} выполняется по расписанию.`,
      cancelled: `❌ Рейс ${flight.iata} отменён. Обратитесь в авиакомпанию.`,
    },
    el: {
      landed:    `${emoji} Η πτήση ${flight.iata} έχει προσγειωθεί.`,
      delayed:   `${emoji} Η πτήση ${flight.iata} έχει καθυστέρηση ${flight.arriveDelay} λεπτών.`,
      ontime:    `${emoji} Η πτήση ${flight.iata} είναι στην ώρα της.`,
      cancelled: `❌ Η πτήση ${flight.iata} έχει ακυρωθεί.`,
    },
  }

  const t = templates[lang] || templates.en
  if (flight.status === 'cancelled') return t.cancelled
  if (flight.status === 'landed')    return t.landed
  if (flight.arriveDelay > 15)       return t.delayed
  return t.ontime
}
