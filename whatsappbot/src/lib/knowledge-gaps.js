// src/lib/knowledge-gaps.js
// ============================================================
// Logs questions the bot couldn't answer confidently.
// Called from whatsapp-inbound.js after Claude responds.
//
// Detection sources:
//   'escalation' — bot output [ESCALATE] tag
//   'hedging'    — Claude used uncertain language in response
//   'flag'       — staff flagged the response in BotQA
//
// Fuzzy matching: normalise → extract keywords → 
//   if ≥60% keyword overlap with existing gap, increment times_seen
//   otherwise create new row
// ============================================================

import { supabase } from './supabase.js'

// ── HEDGING PHRASES (all supported languages) ─────────────────
const HEDGING_PATTERNS = [
  // English
  /\b(i'?m not sure|i don'?t have|i don'?t know|i'?ll need to check|let me check|i'?ll verify|i cannot confirm|i'?m unable to|please contact reception|please ask reception|unfortunately i don'?t|i don'?t have (that |this )?(information|detail)|i'?m not able to|i would need to verify)\b/i,
  // Spanish
  /\b(no estoy seguro|no tengo esa información|necesito verificar|no puedo confirmar|por favor contacte|lamentablemente no|no dispongo de|tendría que comprobar)\b/i,
  // Russian
  /\b(не уверен|не имею информации|нужно уточнить|не могу подтвердить|пожалуйста обратитесь|к сожалению не знаю)\b/i,
  // French
  /\b(je ne suis pas sûr|je n'ai pas cette information|je dois vérifier|je ne peux pas confirmer|veuillez contacter|malheureusement je ne)\b/i,
  // German
  /\b(ich bin nicht sicher|ich habe keine information|ich muss nachprüfen|ich kann nicht bestätigen|bitte wenden sie sich|leider weiß ich nicht)\b/i,
  // Hebrew
  /\b(אני לא בטוח|אין לי מידע|צריך לאמת|אינני יכול לאשר|אנא פנה לקבלה)\b/i,
]

export function detectHedging(text) {
  return HEDGING_PATTERNS.some(p => p.test(text))
}

// ── TEXT NORMALISATION ────────────────────────────────────────
function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

// ── KEYWORD EXTRACTION ────────────────────────────────────────
// Remove stop words, keep meaningful content words
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','i','you','we','they',
  'it','he','she','do','does','did','have','has','had','can',
  'will','would','could','should','may','might','shall',
  'in','on','at','to','for','of','and','or','but','if','as',
  'be','been','being','get','got','my','your','our','their',
  'this','that','these','those','what','when','where','how',
  'me','him','her','us','them','am','so','up','out','about',
  // Spanish
  'el','la','los','las','un','una','es','son','no','si','que',
  'de','en','y','o','pero','para','por','con','del','al',
  // Russian  
  'и','в','на','что','не','это','как','из','по','он','она',
])

function extractKeywords(text) {
  return normalise(text)
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 15)
}

// ── FUZZY MATCH ───────────────────────────────────────────────
// Returns overlap ratio between two keyword arrays
function keywordOverlap(kw1, kw2) {
  if (!kw1.length || !kw2.length) return 0
  const set1 = new Set(kw1)
  const set2 = new Set(kw2)
  const intersection = [...set1].filter(w => set2.has(w)).length
  const union = new Set([...set1, ...set2]).size
  return intersection / union
}

// ── MAIN EXPORT ───────────────────────────────────────────────
// ── CONTEXTUAL / REAL-TIME FILTER ────────────────────────────
// These questions can never be answered from a static knowledge base.
// Logging them as gaps creates noise — skip them entirely.
const REALTIME_PATTERNS = [
  /\b(today|tonight|this evening|right now|currently|at the moment|now|this week|this weekend)\b/i,
  /\b(hoy|esta noche|ahora mismo|actualmente|esta semana|este fin de semana)\b/i,
  /\b(сегодня|сейчас|этим вечером|на этой неделе)\b/i,
  /\b(concert|show|event|performance|happening|on tonight|what'?s on|schedule today)\b/i,
  /\b(concierto|espectáculo|evento|qué hay esta noche|qué pasa hoy)\b/i,
  /\b(weather|forecast|temperature|rain|sunny|clima|tiempo)\b/i,
  /\b(open now|open today|still open|closing time today|hours today)\b/i,
  /\b(available tonight|available today|any availability|last minute)\b/i,
  /\b(flight|gate|delay|arrival|departure|landing|takeoff)\b/i,
  /\b(give me a link|send me a link|send link|whatsapp me|message me)\b/i,
]

function isRealtimeQuestion(text) {
  return REALTIME_PATTERNS.some(p => p.test(text))
}

export async function logKnowledgeGap(hotelId, {
  questionText,
  detectionSource,   // 'escalation' | 'hedging' | 'flag'
  language = 'en',
  conversationId = null,
}) {
  if (!hotelId || !questionText?.trim()) return

  // Don't log very short messages — likely greetings or test messages
  if (questionText.trim().split(/\s+/).length < 3) return

  // Don't log real-time/contextual questions — they can never be in a KB
  if (isRealtimeQuestion(questionText)) return

  try {
    const norm     = normalise(questionText)
    const keywords = extractKeywords(questionText)

    // Fetch recent unresolved gaps for this hotel to check for matches
    const { data: existing } = await supabase
      .from('knowledge_gaps')
      .select('id, question_norm, keywords, times_seen')
      .eq('hotel_id', hotelId)
      .eq('resolved', false)
      .order('last_seen_at', { ascending: false })
      .limit(100)

    if (existing) {
      // Try fuzzy match first (≥60% keyword overlap)
      let matched = null
      for (const gap of existing) {
        const existingKw = gap.keywords || extractKeywords(gap.question_norm)
        if (keywordOverlap(keywords, existingKw) >= 0.6) {
          matched = gap
          break
        }
      }

      // Keyword fallback — if any 2+ keywords match an existing gap
      if (!matched && keywords.length >= 2) {
        for (const gap of existing) {
          const existingKw = new Set(gap.keywords || [])
          const matchCount = keywords.filter(k => existingKw.has(k)).length
          if (matchCount >= 2) { matched = gap; break }
        }
      }

      if (matched) {
        // Increment existing gap
        await supabase
          .from('knowledge_gaps')
          .update({
            times_seen:   matched.times_seen + 1,
            last_seen_at: new Date().toISOString(),
            // Update detection source to most recent
            detection_source: detectionSource,
          })
          .eq('id', matched.id)
        return
      }
    }

    // Create new gap
    await supabase.from('knowledge_gaps').insert({
      hotel_id:         hotelId,
      question_text:    questionText.slice(0, 500),
      question_norm:    norm,
      keywords,
      detection_source: detectionSource,
      language,
      conversation_id:  conversationId,
    })
  } catch (e) {
    console.warn('logKnowledgeGap failed:', e.message)
  }
}
