// src/lib/local-guide.js
// ============================================================
// Local Guide — query engine and bot prompt formatter
//
// Used by whatsapp-inbound.js to inject relevant local
// knowledge when guests ask about restaurants, beaches,
// attractions, nightlife etc.
// ============================================================

import { supabase } from './supabase.js'

// ── CATEGORY DEFINITIONS ──────────────────────────────────────
export const CATEGORIES = {
  restaurant:     { label:'Restaurant',          emoji:'🍽️' },
  beach:          { label:'Beach',               emoji:'🏖️' },
  museum:         { label:'Museum & Culture',    emoji:'🏛️' },
  nightlife:      { label:'Nightlife & Bar',     emoji:'🍹' },
  cafe:           { label:'Coffee & Café',       emoji:'☕' },
  archaeological: { label:'Archaeological Site', emoji:'🏺' },
  nature:         { label:'Nature & Hiking',     emoji:'🌿' },
  winery:         { label:'Winery',              emoji:'🍷' },
  other:          { label:'Other',               emoji:'📍' },
}

// ── INTENT DETECTION ──────────────────────────────────────────
// Returns which categories the guest message is asking about
export function detectLocalGuideIntent(message) {
  const m = message.toLowerCase()
  const intents = []

  // Restaurant intent
  if (/\b(restaurant|eat|dinner|lunch|breakfast|food|dining|cuisine|meze|tavern|taverna|seafood|sushi|pizza|steak|table|reservation|reserve|book.*table|where.*eat|hungry|meal|taste|dish)\b/.test(m)) {
    intents.push('restaurant')
  }
  // Beach intent
  if (/\b(beach|swim|swimming|sea|coast|sand|sunbathe|sunbed|parasol|shore|water|bay|cove)\b/.test(m)) {
    intents.push('beach')
  }
  // Nightlife intent
  if (/\b(bar|bars|cocktail|drinks|nightlife|club|nightclub|party|dancing|dance|late night|pub|lounge|rooftop.*drink)\b/.test(m)) {
    intents.push('nightlife')
  }
  // Coffee/cafe intent
  if (/\b(coffee|cafe|café|cappuccino|espresso|brunch|pastry|bakery|croissant|latte)\b/.test(m)) {
    intents.push('cafe')
  }
  // Museum/culture intent
  if (/\b(museum|art|gallery|culture|cultural|history|historical|exhibit|exhibition)\b/.test(m)) {
    intents.push('museum')
  }
  // Archaeological intent
  if (/\b(ancient|ruins|archaeological|archaeology|roman|kourion|amathus|temple|mosaic|ancient)\b/.test(m)) {
    intents.push('archaeological')
  }
  // Nature/hiking intent
  if (/\b(hike|hiking|trail|nature|walk|walking|mountain|troodos|forest|park|outdoor|scenic)\b/.test(m)) {
    intents.push('nature')
  }
  // Winery intent
  if (/\b(wine|winery|vineyard|commandaria|tasting|cellar|winemaking)\b/.test(m)) {
    intents.push('winery')
  }

  // General "what to do" / "recommend" / "local" — return all categories
  if (intents.length === 0 && /\b(recommend|suggestion|what.*do|things.*do|local|nearby|around|visit|explore|activities|attraction|sightseeing|guide|tip)\b/.test(m)) {
    intents.push('restaurant', 'beach', 'museum', 'nature')
  }

  return [...new Set(intents)]
}

// ── GUEST PREFERENCE EXTRACTION ───────────────────────────────
// Extracts preferences from message to filter recommendations
function extractPreferences(message) {
  const m = message.toLowerCase()
  const prefs = {}

  // Cuisine preferences
  if (/\b(seafood|fish|shrimp|lobster)\b/.test(m))  prefs.cuisine = 'seafood'
  if (/\b(meze|mezes|mezze|cypriot|traditional|local food)\b/.test(m)) prefs.cuisine = 'cypriot'
  if (/\b(italian|pizza|pasta)\b/.test(m))           prefs.cuisine = 'italian'
  if (/\b(japanese|sushi|asian)\b/.test(m))          prefs.cuisine = 'asian'
  if (/\b(steak|grill|grilled|bbq|meat)\b/.test(m)) prefs.cuisine = 'grill'

  // Vibe preferences
  if (/\b(romantic|anniversary|date|couple|intimate)\b/.test(m))  prefs.vibe = 'romantic'
  if (/\b(family|kids|children|child)\b/.test(m))                  prefs.vibe = 'family'
  if (/\b(business|work|client|meeting|professional)\b/.test(m))   prefs.vibe = 'business'
  if (/\b(lively|fun|energetic|buzzing|vibrant)\b/.test(m))        prefs.vibe = 'lively'
  if (/\b(quiet|calm|relaxed|peaceful|tranquil)\b/.test(m))        prefs.vibe = 'relaxed'

  // Tags
  const tags = []
  if (/\b(view|views|sea view|ocean view|panoramic|sunset)\b/.test(m))  tags.push('sea_view')
  if (/\b(outdoor|outside|terrace|garden|rooftop)\b/.test(m))           tags.push('outdoor')
  if (/\b(vegetarian|vegan|plant.based)\b/.test(m))                     tags.push('vegetarian')
  if (/\b(halal)\b/.test(m))                                             tags.push('halal')
  if (/\b(late|midnight|after midnight|night owl)\b/.test(m))           tags.push('late_night')
  if (tags.length) prefs.tags = tags

  // Price preferences
  if (/\b(cheap|budget|affordable|inexpensive|value)\b/.test(m))        prefs.price = ['$', '$$']
  if (/\b(fine dining|upscale|fancy|luxury|splurge|special|expensive)\b/.test(m)) prefs.price = ['$$$', '$$$$']

  return prefs
}

// ── MAIN QUERY ────────────────────────────────────────────────
// Returns formatted prompt block for the bot
export async function getLocalGuideContext(hotelId, message) {
  const intents = detectLocalGuideIntent(message)
  if (!intents.length) return null

  const prefs = extractPreferences(message)

  try {
    // Get hotel's enabled items for detected categories
    const { data } = await supabase
      .from('local_guide_preferences')
      .select(`
        custom_priority, custom_notes, promoted_by_hotel,
        commission_eligible, commission_percentage,
        partner_id, distance_km, distance_min_walk,
        local_guide_items (
          id, category, name, area, description, vibe, tags,
          cuisine_type, price_range, google_rating, review_count,
          phone, website, reservation_url, booking_method,
          opening_hours, seasonal_notes,
          popular_item, popular_item_description, popular_item_price
        )
      `)
      .eq('hotel_id', hotelId)
      .eq('is_enabled', true)
      .in('local_guide_items.category', intents)
      .order('custom_priority', { ascending: false })

    if (!data?.length) return null

    // Filter by guest preferences
    let items = data.filter(p => p.local_guide_items).map(p => ({
      ...p.local_guide_items,
      custom_priority:      p.custom_priority,
      custom_notes:         p.custom_notes,
      promoted_by_hotel:    p.promoted_by_hotel,
      commission_eligible:  p.commission_eligible,
      partner_id:           p.partner_id,
      distance_km:          p.distance_km,
      distance_min_walk:    p.distance_min_walk,
    }))

    // Apply preference filters
    if (prefs.cuisine) {
      const cuisineMatch = items.filter(i => i.cuisine_type?.toLowerCase().includes(prefs.cuisine))
      if (cuisineMatch.length > 0) items = cuisineMatch
    }
    if (prefs.vibe) {
      const vibeMatch = items.filter(i => i.vibe?.toLowerCase().includes(prefs.vibe))
      if (vibeMatch.length > 0) items = vibeMatch
    }
    if (prefs.tags?.length) {
      const tagMatch = items.filter(i => prefs.tags.some(t => (i.tags||[]).includes(t)))
      if (tagMatch.length > 0) items = tagMatch
    }
    if (prefs.price) {
      const priceMatch = items.filter(i => prefs.price.includes(i.price_range))
      if (priceMatch.length > 0) items = priceMatch
    }

    // Sort: promoted first, then custom_priority, then google_rating
    items.sort((a, b) => {
      if (a.promoted_by_hotel !== b.promoted_by_hotel) return b.promoted_by_hotel ? 1 : -1
      if (b.custom_priority !== a.custom_priority) return b.custom_priority - a.custom_priority
      return (b.google_rating || 0) - (a.google_rating || 0)
    })

    // Limit to top 5 per intent to keep prompt manageable
    const top = items.slice(0, 5)
    if (!top.length) return null

    // Format prompt block
    const lines = []
    const byCategory = {}
    for (const item of top) {
      if (!byCategory[item.category]) byCategory[item.category] = []
      byCategory[item.category].push(item)
    }

    for (const [cat, catItems] of Object.entries(byCategory)) {
      const catInfo = CATEGORIES[cat] || CATEGORIES.other
      lines.push(`\n${catInfo.emoji} ${catInfo.label.toUpperCase()}:`)

      for (const item of catItems) {
        const rating   = item.google_rating ? `${item.google_rating}★` : ''
        const price    = item.price_range   ? ` · ${item.price_range}` : ''
        const area     = item.area          ? ` · ${item.area}` : ''
        const dist     = item.distance_min_walk ? ` · ${item.distance_min_walk}min walk` : item.distance_km ? ` · ${item.distance_km}km` : ''
        const promoted = item.promoted_by_hotel ? ' ⭐ Hotel favourite' : ''

        lines.push(`• ${item.name} ${rating}${price}${area}${dist}${promoted}`)

        if (item.description)      lines.push(`  ${item.description}`)
        if (item.custom_notes)     lines.push(`  Note: ${item.custom_notes}`)
        if (item.popular_item)     lines.push(`  Popular: ${item.popular_item}${item.popular_item_price ? ` — €${item.popular_item_price}` : ''}`)
        if (item.seasonal_notes)   lines.push(`  ${item.seasonal_notes}`)

        // Booking method hint for bot
        if (item.booking_method === 'partner' && item.partner_id) {
          lines.push(`  [BOOKING: offer to arrange via WhatsApp partner alert]`)
        } else if (item.booking_method === 'phone' && item.phone) {
          lines.push(`  [PHONE: ${item.phone}]`)
        } else if (item.booking_method === 'link' && item.reservation_url) {
          lines.push(`  [LINK: ${item.reservation_url}]`)
        } else if (item.booking_method === 'walkin') {
          lines.push(`  [WALKIN: no reservation needed]`)
        }
      }
    }

    return `\n\n[LOCAL GUIDE — ${intents.map(i => i.toUpperCase()).join('/')}]\n` +
      `Use this curated local knowledge to make specific recommendations.\n` +
      `Match to the guest's stated preferences. Recommend 1-3 options max.\n` +
      `If booking_method is PARTNER, offer to arrange it for them.\n` +
      lines.join('\n')

  } catch (e) {
    console.warn('getLocalGuideContext failed:', e.message)
    return null
  }
}

// ── LOG RECOMMENDATION ────────────────────────────────────────
export async function logLocalGuideRecommendation(hotelId, {
  itemIds = [],
  conversationId,
  guestLanguage,
  category,
}) {
  if (!itemIds.length) return
  try {
    await supabase.from('local_guide_logs').insert(
      itemIds.map(itemId => ({
        hotel_id:       hotelId,
        item_id:        itemId,
        conversation_id: conversationId,
        guest_language: guestLanguage,
        category,
      }))
    )
  } catch {}
}
