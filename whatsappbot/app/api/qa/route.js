// app/api/qa/route.js
// Returns conversations for QA review with filters
// Manager only

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId   = searchParams.get('hotelId')
    const filter    = searchParams.get('filter') || 'all'
    const language  = searchParams.get('language') || 'all'
    const search    = searchParams.get('search') || ''
    const month     = searchParams.get('month') || ''
    const page      = parseInt(searchParams.get('page') || '1')
    const limit     = 20

    if (!hotelId) return Response.json({ error: 'hotelId required' }, { status: 400 })

    const supabase = getSupabase()

    // Base query
    let query = supabase
      .from('conversations')
      .select(`
        id, status, created_at, last_message_at, messages,
        guests(id, room, language, check_in, check_out),
        qa_flags(id, flag_type, resolved, created_at)
      `)
      .eq('hotel_id', hotelId)
      .order('last_message_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    // Filters
    if (filter === 'escalated')  query = query.eq('status', 'escalated')
    if (filter === 'flagged')    query = query.not('qa_flags', 'is', null)
    if (language !== 'all')      query = query.eq('guests.language', language)

    // Month filter
    if (month) {
      const start = `${month}-01T00:00:00`
      const end   = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
        .toISOString().split('T')[0] + 'T23:59:59'
      query = query.gte('created_at', start).lte('created_at', end)
    }

    const { data: conversations, error } = await query
    if (error) throw error

    // Filter by search keyword in messages
    let filtered = conversations || []
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(conv =>
        (conv.messages || []).some(m =>
          m.content?.toLowerCase().includes(searchLower)
        )
      )
    }

    // Get QA summary stats
    const { data: stats } = await supabase
      .from('conversations')
      .select('id, status, messages')
      .eq('hotel_id', hotelId)

    const totalConvs    = stats?.length || 0
    const escalatedConvs = stats?.filter(c => c.status === 'escalated').length || 0
    const totalMessages  = stats?.reduce((s, c) => s + (c.messages?.length || 0), 0) || 0
    const botMessages    = stats?.reduce((s, c) =>
      s + (c.messages || []).filter(m => m.role === 'assistant').length, 0) || 0

    const { data: flagData } = await supabase
      .from('qa_flags')
      .select('id, flag_type, resolved')
      .eq('hotel_id', hotelId)

    const totalFlags    = flagData?.length || 0
    const unresolvedFlags = flagData?.filter(f => !f.resolved).length || 0

    const flagsByType = {}
    flagData?.forEach(f => {
      flagsByType[f.flag_type] = (flagsByType[f.flag_type] || 0) + 1
    })

    return Response.json({
      conversations: filtered,
      stats: {
        totalConvs,
        escalatedConvs,
        escalationRate: totalConvs > 0 ? Math.round((escalatedConvs / totalConvs) * 100) : 0,
        totalMessages,
        botMessages,
        avgMessagesPerConv: totalConvs > 0 ? Math.round(totalMessages / totalConvs) : 0,
        totalFlags,
        unresolvedFlags,
        flagsByType,
      }
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
