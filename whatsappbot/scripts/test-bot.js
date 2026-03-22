#!/usr/bin/env node
// scripts/test-bot.js
// ============================================================
// LOCAL TEST SCRIPT
// Simulates WhatsApp messages so you can test the bot
// without needing a real phone or Twilio account.
//
// Usage:
//   node scripts/test-bot.js
//   node scripts/test-bot.js "I need a taxi to the airport"
//   node scripts/test-bot.js --lang ru "Мне нужно такси"
// ============================================================

import 'dotenv/config'
import { callClaude }      from '../src/lib/claude.js'
import { buildSystemPrompt, detectLanguage, parseBookingRequest } from '../src/lib/language.js'
import { supabase }        from '../src/lib/supabase.js'

// ── MOCK DATA ─────────────────────────────────────────────────────────────────

const TEST_HOTEL = {
  id:   'test-hotel-id',
  name: 'Four Seasons Limassol Test',
  system_prompt: 'You are the concierge at a luxury hotel in Limassol, Cyprus.',
  config: {
    address:       'Amathus Ave, Limassol',
    checkin_time:  '15:00',
    checkout_time: '12:00',
    restaurant: {
      name:      'Sea Breeze Restaurant',
      hours:     '07:00 - 23:00',
      breakfast: '07:00 - 10:30',
      lunch:     '12:00 - 15:00',
      dinner:    '18:30 - 23:00',
    }
  }
}

const TEST_GUEST = {
  id:       'test-guest-id',
  name:     'Ferran',
  surname:  'Diaz',
  room:     '312',
  phone:    '+34600000000',
  language: 'en',
}

const TEST_PARTNERS = [
  {
    id:              'p1',
    hotel_id:        'test-hotel-id',
    name:            'Christos Taxi',
    type:            'taxi',
    phone:           '+35799000010',
    commission_rate: 10,
    details:         { car: 'Mercedes E-Class', plate: 'MMN 43343' },
    active:          true,
  },
  {
    id:              'p2',
    hotel_id:        'test-hotel-id',
    name:            'Meze & More Restaurant',
    type:            'restaurant',
    phone:           '+35799000011',
    commission_rate: 8,
    details:         { cuisine: 'Cypriot', address: '12 Anexartisias St' },
    active:          true,
  },
  {
    id:              'p3',
    hotel_id:        'test-hotel-id',
    name:            'Blue Ocean Boat Tours',
    type:            'activity',
    phone:           '+35799000012',
    commission_rate: 12,
    details:         { type: 'boat_tour', price_per_person: 65 },
    active:          true,
  },
]

// ── INTERACTIVE CHAT LOOP ─────────────────────────────────────────────────────

async function runTestChat() {
  const args = process.argv.slice(2)

  // Single message mode
  if (args.length > 0 && !args[0].startsWith('--')) {
    const message = args.join(' ')
    await testSingleMessage(message)
    return
  }

  // Language override
  const langFlag = args.indexOf('--lang')
  if (langFlag > -1 && args[langFlag + 1]) {
    TEST_GUEST.language = args[langFlag + 1]
    console.log(`Language set to: ${TEST_GUEST.language}\n`)
  }

  // Interactive mode
  console.log('┌─────────────────────────────────────────────────┐')
  console.log('│  THE RESIDENCE CONCIERGE — Bot Test Environment  │')
  console.log('│  Type messages as a guest. Ctrl+C to exit.       │')
  console.log('└─────────────────────────────────────────────────┘')
  console.log(`Hotel: ${TEST_HOTEL.name}`)
  console.log(`Guest: ${TEST_GUEST.name} ${TEST_GUEST.surname}, Room ${TEST_GUEST.room}`)
  console.log(`Language: ${TEST_GUEST.language}\n`)

  const history = []
  const { createInterface } = await import('readline')
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const ask = () => {
    rl.question('You: ', async (input) => {
      if (!input.trim()) { ask(); return }
      if (input.toLowerCase() === 'exit') { rl.close(); return }

      // Auto-detect language
      const lang = detectLanguage(input)
      if (lang !== TEST_GUEST.language) {
        TEST_GUEST.language = lang
        console.log(`   [Language switched to ${lang}]`)
      }

      const systemPrompt = buildSystemPrompt(TEST_HOTEL, TEST_GUEST, TEST_PARTNERS)

      try {
        console.log('   [calling Claude...]')
        const response = await callClaude(systemPrompt, history, input)
        const { hasBooking, booking, cleanResponse } = parseBookingRequest(response)

        console.log(`\nConcierge: ${cleanResponse}\n`)

        if (hasBooking) {
          console.log('━━━ BOOKING DETECTED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          console.log(`Type:    ${booking.type}`)
          console.log(`Partner: ${booking.partner}`)
          console.log(`Details: ${JSON.stringify(booking.details, null, 2)}`)
          console.log('─────────────────────────────────────────────────')
          console.log(`[Would send WhatsApp alert to partner]`)
          console.log(`[Commission would be logged in Supabase]`)
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
        }

        history.push({ role: 'user',      content: input       })
        history.push({ role: 'assistant', content: cleanResponse })

        // Keep history manageable
        if (history.length > 20) history.splice(0, 2)
      } catch (err) {
        console.error('Error:', err.message)
      }
      ask()
    })
  }
  ask()
}

async function testSingleMessage(message) {
  const systemPrompt = buildSystemPrompt(TEST_HOTEL, TEST_GUEST, TEST_PARTNERS)
  console.log(`Testing: "${message}"\n`)
  const response = await callClaude(systemPrompt, [], message)
  const { hasBooking, booking, cleanResponse } = parseBookingRequest(response)
  console.log(`Response: ${cleanResponse}`)
  if (hasBooking) {
    console.log(`\nBooking detected:`, JSON.stringify(booking, null, 2))
  }
}

runTestChat().catch(console.error)
