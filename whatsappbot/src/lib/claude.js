// src/lib/claude.js
// Calls the Anthropic Claude API

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const MODEL      = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024

// ── CALL CLAUDE ───────────────────────────────────────────────────────────────
// imageUrls: optional array of publicly accessible image URLs from Twilio.
// Claude supports JPEG, PNG, GIF, WEBP — Twilio delivers these directly.

export async function callClaude(systemPrompt, conversationHistory, newMessage, imageUrls = []) {
  // Build the content for the latest user message.
  // If images are present, content becomes an array of blocks (text + images).
  // Otherwise it stays a plain string (cheaper, faster).
  let userContent

  if (imageUrls && imageUrls.length > 0) {
    // Fetch each image from Twilio and convert to base64.
    // Twilio requires Basic Auth to access MediaUrl — use account SID + auth token.
    const imageBlocks = await Promise.all(
      imageUrls.filter(Boolean).map(async (url) => {
        try {
          const credentials = Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString('base64')

          const res = await fetch(url, {
            headers: { Authorization: `Basic ${credentials}` },
          })

          if (!res.ok) {
            console.error(`Image fetch failed: ${url} — ${res.status}`)
            return null
          }

          const contentType = res.headers.get('content-type') || 'image/jpeg'
          const buffer      = await res.arrayBuffer()
          const base64      = Buffer.from(buffer).toString('base64')

          // Claude accepts: image/jpeg, image/png, image/gif, image/webp
          const mediaType = contentType.split(';')[0].trim()

          return {
            type:   'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          }
        } catch (err) {
          console.error(`Failed to fetch image ${url}:`, err.message)
          return null
        }
      })
    )

    const validImages = imageBlocks.filter(Boolean)

    userContent = [
      ...validImages,
      // Text goes after images so Claude reads the image first
      { type: 'text', text: newMessage || 'What do you see in this image?' },
    ]
  } else {
    userContent = newMessage
  }

  const messages = [
    ...conversationHistory.map(m => ({
      role:    m.role,
      content: m.content,   // history is always plain text
    })),
    { role: 'user', content: userContent },
  ]

  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages,
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
