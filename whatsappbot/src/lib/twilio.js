// src/lib/twilio.js
// Sends WhatsApp messages via Twilio

import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const FROM = process.env.TWILIO_WHATSAPP_NUMBER // e.g. 'whatsapp:+35799000001'

// ── SEND MESSAGE ──────────────────────────────────────────────────────────────

export async function sendWhatsApp(to, body) {
  // Ensure number has whatsapp: prefix
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  try {
    const message = await client.messages.create({
      from: FROM,
      to:   toFormatted,
      body
    })
    console.log(`WhatsApp sent to ${to} — SID: ${message.sid}`)
    return message
  } catch (err) {
    console.error(`Failed to send WhatsApp to ${to}:`, err.message)
    throw err
  }
}

// ── VERIFY TWILIO SIGNATURE ───────────────────────────────────────────────────
// Verifies that incoming webhooks are genuinely from Twilio

export function validateTwilioSignature(req, url) {
  const signature = req.headers['x-twilio-signature']
  if (!signature) return false

  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  )
}

// ── PARSE INCOMING WEBHOOK ────────────────────────────────────────────────────

export function parseIncomingMessage(body) {
  return {
    from:        body.From?.replace('whatsapp:', ''),  // guest phone e.g. +447700900123
    to:          body.To?.replace('whatsapp:', ''),    // hotel number e.g. +35799000001
    message:     body.Body || '',
    messageSid:  body.MessageSid,
    mediaUrls:   body.NumMedia > 0 ? [body.MediaUrl0] : [],
    profileName: body.ProfileName || null,             // WhatsApp display name
  }
}
