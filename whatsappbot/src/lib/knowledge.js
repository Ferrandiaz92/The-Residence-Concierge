// src/lib/knowledge.js
// Loads hotel knowledge base from Supabase and injects into system prompt

import { supabase } from './supabase.js'

const CATEGORY_LABELS = {
  schedule:   'Schedule & Hours',
  facilities: 'Facilities',
  policies:   'Policies',
  pricing:    'Pricing',
  local_tips: 'Local Tips',
  custom:     'Other Information',
}

export async function getKnowledgeBase(hotelId) {
  const { data } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('active', true)
    .order('category')
    .order('sort_order')
  return data || []
}

export function formatKnowledgeForPrompt(entries) {
  if (!entries || entries.length === 0) return ''

  // Group by category
  const grouped = {}
  entries.forEach(e => {
    if (!grouped[e.category]) grouped[e.category] = []
    grouped[e.category].push(e)
  })

  let text = 'HOTEL KNOWLEDGE BASE — use these exact answers for guest questions:\n\n'

  Object.entries(grouped).forEach(([cat, items]) => {
    const label = CATEGORY_LABELS[cat] || cat
    text += `[${label}]\n`
    items.forEach(item => {
      text += `${item.question}: ${item.answer}\n`
    })
    text += '\n'
  })

  text += 'IMPORTANT: Always use the information above when answering guest questions. Never guess or make up hotel-specific facts. If you are unsure about something not in the knowledge base, say you will check with the team and escalate to reception.'

  return text
}

// Updated buildSystemPrompt — call this instead of the one in language.js
export async function buildSystemPromptWithKB(hotel, guest, partners) {
  const { buildSystemPrompt } = await import('./language.js')
  const kbEntries = await getKnowledgeBase(hotel.id)
  const kbText    = formatKnowledgeForPrompt(kbEntries)

  const basePrompt = buildSystemPrompt(hotel, guest, partners)
  return kbText ? `${basePrompt}\n\n${kbText}` : basePrompt
}
