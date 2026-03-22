// src/lib/claude.js
// Calls the Anthropic Claude API

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const MODEL      = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024

// ── CALL CLAUDE ───────────────────────────────────────────────────────────────

export async function callClaude(systemPrompt, conversationHistory, newMessage) {
  // Build messages array from history + new message
  const messages = [
    ...conversationHistory.map(m => ({
      role:    m.role,    // 'user' | 'assistant'
      content: m.content
    })),
    { role: 'user', content: newMessage }
  ]

  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages
    })

    return response.content[0]?.text || ''
  } catch (err) {
    console.error('Claude API error:', err.message)
    throw err
  }
}

// ── EXTRACT BOOKING INTENT ────────────────────────────────────────────────────
// Uses a lightweight Claude call to classify if a message contains a booking

export async function classifyIntent(message) {
  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 100,
    system:     'Classify the intent of this hotel guest WhatsApp message. Reply with one word only: taxi | restaurant | activity | info | complaint | other',
    messages:   [{ role: 'user', content: message }]
  })
  return response.content[0]?.text?.trim().toLowerCase() || 'other'
}
