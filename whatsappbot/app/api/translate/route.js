// app/api/translate/route.js
// Server-side translation via Claude — browser can't call Anthropic directly
// Used by BotQA to translate non-English conversations to English for review

import { cookies } from 'next/headers'
import Anthropic   from '@anthropic-ai/sdk'

function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function POST(request) {
  const session = getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { transcript, lang } = await request.json()
    if (!transcript) return Response.json({ error: 'transcript required' }, { status: 400 })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',  // fast + cheap for translation
      max_tokens: 4000,
      messages: [{
        role:    'user',
        content: `Translate the following hotel concierge conversation from ${lang || 'the detected language'} to English.\n\nRules:\n- Keep the [N] BOT/GUEST prefix on each line exactly as written\n- Only translate the text after the first colon on each line\n- Preserve line breaks and paragraph spacing\n- Return ONLY the translated transcript, no explanation\n\n${transcript}`,
      }],
    })

    const translated = message.content?.[0]?.text || ''
    return Response.json({ translated })

  } catch (err) {
    console.error('Translation error:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
