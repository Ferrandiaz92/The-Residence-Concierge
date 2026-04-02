// app/api/flag/route.js
// Flag a bot message for QA review

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

function getSession() {
  try {
    const c = cookies().get('session')
    return c ? JSON.parse(c.value) : null
  } catch { return null }
}

// POST — flag a message
export async function POST(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { hotelId, conversationId, messageIndex, messageContent, flagType, note, correctAnswer } = await request.json()
  if (hotelId && session.hotelId && hotelId !== session.hotelId) return Response.json({ error: 'Access denied' }, { status: 403 })

    if (!hotelId || !conversationId || messageIndex === undefined || !flagType) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('qa_flags')
      .insert({
        hotel_id:        hotelId,
        conversation_id: conversationId,
        message_index:   messageIndex,
        message_content: messageContent,
        flag_type:       flagType,
        note:            note || null,
        correct_answer:  correctAnswer || null,
        flagged_by:      session.name || session.email,
      })
      .select()
      .single()

    if (error) throw error
    return Response.json({ status: 'flagged', flag: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — resolve a flag
export async function PATCH(request) {
  try {
    const { flagId, resolutionNote } = await request.json()
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('qa_flags')
      .update({ resolved: true, resolution_note: resolutionNote || null })
      .eq('id', flagId)
      .select()
      .single()
    if (error) throw error
    return Response.json({ status: 'resolved', flag: data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — remove a flag
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const flagId = searchParams.get('id')
    if (!flagId) return Response.json({ error: 'id required' }, { status: 400 })
    const supabase = getSupabase()
    await supabase.from('qa_flags').delete().eq('id', flagId)
    return Response.json({ status: 'deleted' })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
