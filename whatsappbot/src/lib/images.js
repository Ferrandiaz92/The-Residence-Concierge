// src/lib/images.js
// ─────────────────────────────────────────────────────────────
// FEATURE #5: Image sending in bot responses
//
// The bot can already RECEIVE images (Claude vision is wired).
// This adds the ability to SEND images — menus, maps, spa brochures,
// activity photos — via WhatsApp media messages.
//
// Claude emits: [SEND_IMAGE]{"type":"menu","label":"Restaurant menu"}
//
// Image URLs are stored per hotel in the hotel.config.images object:
//   config.images = {
//     menu:         "https://...",
//     spa_menu:     "https://...",
//     map:          "https://...",
//     pool_hours:   "https://...",
//     activities:   "https://...",
//   }
//
// If the hotel hasn't uploaded an image for that type, we fall back
// to a helpful text response and don't error.
// ─────────────────────────────────────────────────────────────

import twilio from 'twilio'
import log    from '../../lib/logger.js'

function getTwilio() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

// ── TAG PARSER ────────────────────────────────────────────────
export function parseSendImage(aiResponse) {
  const marker = '[SEND_IMAGE]'
  const idx    = aiResponse.indexOf(marker)
  if (idx === -1) return { hasSendImage: false, cleanResponse: aiResponse }
  try {
    const jsonStr = aiResponse.slice(idx + marker.length).trim().split('\n')[0]
    const data    = JSON.parse(jsonStr)
    return {
      hasSendImage:  true,
      imageRequest:  data,
      cleanResponse: aiResponse.slice(0, idx).trim(),
    }
  } catch {
    return { hasSendImage: false, cleanResponse: aiResponse }
  }
}

// ── SEND IMAGE ────────────────────────────────────────────────
export async function sendImage(to, imageUrl, caption, hotel) {
  const client     = getTwilio()
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  try {
    const msg = await client.messages.create({
      from:     process.env.TWILIO_WHATSAPP_NUMBER,
      to:       toFormatted,
      mediaUrl: [imageUrl],
      body:     caption || '',
    })
    log.info('Image sent via WhatsApp', { to, imageUrl, sid: msg.sid })
    return msg
  } catch (err) {
    await log.error('sendImage failed', err, { to, imageUrl })
    throw err
  }
}

// ── RESOLVE IMAGE URL FROM HOTEL CONFIG ───────────────────────
export function resolveImageUrl(hotel, imageType) {
  const images = hotel.config?.images || {}

  // Exact match first
  if (images[imageType]) return images[imageType]

  // Fuzzy match for common aliases
  const aliases = {
    menu:         ['restaurant_menu', 'menu', 'food_menu', 'dining_menu'],
    spa_menu:     ['spa_menu', 'spa', 'treatments', 'spa_treatments'],
    map:          ['map', 'hotel_map', 'area_map', 'directions'],
    pool:         ['pool', 'pool_hours', 'swimming_pool'],
    activities:   ['activities', 'excursions', 'tours', 'experiences'],
    wine_list:    ['wine', 'wine_list', 'drinks_menu'],
    room_service: ['room_service', 'in_room_dining'],
  }

  for (const [key, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(imageType) && images[key]) return images[key]
  }

  return null
}

// ── PROCESS IMAGE REQUEST FROM BOT ───────────────────────────
// Called from whatsapp-inbound.js after parsing [SEND_IMAGE] tag
export async function processImageRequest(imageRequest, hotel, guest, guestPhone, convId, appendMessage) {
  const { type, label, caption } = imageRequest
  const imageUrl = resolveImageUrl(hotel, type)

  if (!imageUrl) {
    // Hotel hasn't uploaded this image — log it so they know to add it
    log.info('Image requested but not configured', {
      hotelId:   hotel.id,
      imageType: type,
      hint:      `Add config.images.${type} to hotel config to enable this`,
    })
    // Return false — let the text response handle it instead
    return false
  }

  try {
    const displayCaption = caption || label || ''
    await sendImage(guestPhone, imageUrl, displayCaption, hotel)

    // Append to conversation for dashboard visibility
    if (convId && appendMessage) {
      await appendMessage(convId, 'assistant', `[Image sent: ${label || type}]`, { sent_by: 'bot_image' })
    }

    return true
  } catch (err) {
    // Image send failed — fall back gracefully
    log.warn('processImageRequest failed — falling back to text', { type, error: err.message })
    return false
  }
}

// ── SYSTEM PROMPT INJECTION ───────────────────────────────────
// Call this to tell Claude which images are available for this hotel
export function buildImagePromptSection(hotel) {
  const images = hotel.config?.images || {}
  const available = Object.keys(images).filter(k => images[k])

  if (available.length === 0) return ''

  const lines = available.map(type => {
    const labels = {
      menu:         'Restaurant menu',
      spa_menu:     'Spa treatment menu',
      map:          'Hotel/area map',
      pool:         'Pool information',
      activities:   'Activities & excursions',
      wine_list:    'Wine & drinks list',
      room_service: 'Room service menu',
    }
    return `  - ${type}: ${labels[type] || type}`
  })

  return `
IMAGES YOU CAN SEND:
When a guest asks to see a menu, map, spa treatments, or activities list, you can send them an image directly.
Available images for this hotel:
${lines.join('\n')}

To send an image, output ONLY this tag at the end of your reply (no other text after it):
[SEND_IMAGE]{"type":"menu","label":"Our restaurant menu"}

Replace "menu" with the image type from the list above.
The label is shown as the image caption — keep it short and friendly.
Only send an image when it directly answers what the guest asked for.
Do NOT send images unprompted.`
}
