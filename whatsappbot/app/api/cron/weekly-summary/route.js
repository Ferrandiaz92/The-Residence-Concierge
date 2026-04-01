// app/api/cron/weekly-summary/route.js
// ============================================================
// Runs every Monday at 09:00 via Vercel Cron.
// Sends a bot performance summary to:
//   1. Manager WhatsApp (staff_digest_phone)
//   2. Dashboard notification (visible to communications role)
//
// Add to vercel.json crons:
//   { "path": "/api/cron/weekly-summary", "schedule": "0 9 * * 1" }
// ============================================================

import { createClient } from '@supabase/supabase-js'
import twilio           from 'twilio'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

function getTwilio() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

export async function GET(request) {
  const runId = Date.now()
  console.log(JSON.stringify({ level:'info', cron:'weekly-summary', runId, event:'cron_start', ts: new Date().toISOString() }))

  // Auth check
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = getSupabase()
  const now       = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  weekStart.setHours(0, 0, 0, 0)
  const weekStartISO = weekStart.toISOString()

  // Load all active hotels
  const { data: hotels } = await supabase
    .from('hotels').select('id, name, config').eq('active', true)

  if (!hotels?.length) {
    return Response.json({ status: 'ok', message: 'no hotels' })
  }

  const results = []

  for (const hotel of hotels) {
    try {
      const hId = hotel.id

      // ── 1. Conversation stats ───────────────────────────────
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, status, created_at')
        .eq('hotel_id', hId)
        .gte('last_message_at', weekStartISO)

      const totalConvs    = convs?.length || 0
      const escalated     = convs?.filter(c => c.status === 'escalated').length || 0
      const escalationPct = totalConvs > 0 ? Math.round((escalated / totalConvs) * 100) : 0

      // ── 2. Message count ────────────────────────────────────
      const convIds = (convs || []).map(c => c.id)
      let totalMsgs = 0, botMsgs = 0
      if (convIds.length > 0) {
        const { count: allCount } = await supabase
          .from('messages').select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
        const { count: botCount } = await supabase
          .from('messages').select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds).eq('role', 'assistant')
        totalMsgs = allCount || 0
        botMsgs   = botCount || 0
      }
      const avgMsgs = totalConvs > 0 ? (totalMsgs / totalConvs).toFixed(1) : 0

      // ── 3. Language breakdown ───────────────────────────────
      const { data: guestLangs } = await supabase
        .from('conversations')
        .select('guests(language)')
        .eq('hotel_id', hId)
        .gte('last_message_at', weekStartISO)
      const langCounts = {}
      for (const c of (guestLangs || [])) {
        const l = c.guests?.language || 'en'
        langCounts[l] = (langCounts[l] || 0) + 1
      }
      const langStr = Object.entries(langCounts)
        .sort((a,b) => b[1]-a[1])
        .slice(0, 5)
        .map(([l, n]) => `${l.toUpperCase()} ${n}`)
        .join(' · ')

      // ── 4. BotQA flags this week ────────────────────────────
      const { data: flags } = await supabase
        .from('qa_flags')
        .select('flag_type')
        .eq('hotel_id', hId)
        .eq('resolved', false)
        .gte('created_at', weekStartISO)
      const flagCount = flags?.length || 0

      // ── 5. Knowledge gaps — top unanswered questions ─────────
      const { data: gaps } = await supabase
        .from('knowledge_gaps')
        .select('question_text, times_seen, language, detection_source')
        .eq('hotel_id', hId)
        .eq('resolved', false)
        .gte('last_seen_at', weekStartISO)
        .order('times_seen', { ascending: false })
        .limit(10)

      // ── 6. Bookings + commission ────────────────────────────
      const { data: bookings } = await supabase
        .from('bookings')
        .select('type, status, commission_amount')
        .eq('hotel_id', hId)
        .gte('created_at', weekStartISO)
      const totalBookings = bookings?.length || 0
      const totalComm     = (bookings || [])
        .reduce((s, b) => s + (b.commission_amount || 0), 0)

      // ── 7. Build WhatsApp message ───────────────────────────
      const weekLabel = `${weekStart.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}–${new Date(now.getFullYear(),now.getMonth(),now.getDate()-1).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`

      const gapLines = (gaps || []).slice(0, 7).map((g, i) =>
        `${i+1}. "${g.question_text.slice(0, 70)}${g.question_text.length>70?'…':''}" (${g.times_seen}×)`
      ).join('\n')

      const whatsappMsg = [
        `📊 *Weekly Bot Report — ${hotel.name}*`,
        `_Week of ${weekLabel}_`,
        ``,
        `🤖 Conversations: ${totalConvs}`,
        `📞 Escalated: ${escalated} (${escalationPct}%)`,
        totalBookings > 0 ? `🎟 Bookings: ${totalBookings} · Commission: €${totalComm.toFixed(0)}` : null,
        flagCount > 0 ? `🚩 Flagged responses: ${flagCount}` : null,
        langStr ? `🌍 Languages: ${langStr}` : null,
        `💬 Avg messages/conversation: ${avgMsgs}`,
        ``,
        gaps?.length > 0 ? [
          `❓ *Top unanswered questions this week:*`,
          `_(Add these to your knowledge base!)_`,
          ``,
          gapLines,
        ].join('\n') : `✅ No knowledge gaps detected this week!`,
        ``,
        totalComm > 0 ? `💰 *Total commission this week: €${totalComm.toFixed(0)}*` : null,
      ].filter(l => l !== null).join('\n')

      // ── 8. Send WhatsApp to manager ─────────────────────────
      const managerPhone = hotel.config?.staff_digest_phone
      if (managerPhone && process.env.TWILIO_WHATSAPP_NUMBER) {
        try {
          const client = getTwilio()
          const to = managerPhone.startsWith('whatsapp:') ? managerPhone : `whatsapp:${managerPhone}`
          await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to,
            body: whatsappMsg,
          })
        } catch (e) {
          console.warn(`Weekly summary WhatsApp failed for ${hotel.name}:`, e.message)
        }
      }

      // ── 9. Dashboard notification ────────────────────────────
      const summaryData = {
        totalConvs, escalated, escalationPct, totalBookings,
        totalComm, flagCount, avgMsgs, langCounts,
        topGaps: (gaps || []).slice(0, 10),
        weekStart: weekStartISO,
        weekLabel,
      }

      await supabase.from('notifications').insert({
        hotel_id:   hId,
        type:       'weekly_summary',
        title:      `📊 Weekly bot report — ${weekLabel}`,
        body:       `${totalConvs} conversations · ${escalationPct}% escalated · ${gaps?.length||0} knowledge gaps · €${totalComm.toFixed(0)} commission`,
        link_type:  'weekly_summary',
        link_id:    null,
        department: 'communications',
        urgent:     false,
      }).catch(() => {})

      // ── 10. Save summary to history ─────────────────────────
      await supabase.from('weekly_summaries').insert({
        hotel_id:     hId,
        week_start:   weekStart.toISOString().split('T')[0],
        week_end:     new Date(now.getFullYear(),now.getMonth(),now.getDate()-1).toISOString().split('T')[0],
        summary_data: summaryData,
      }).catch(() => {})

      results.push({ hotel: hotel.name, gaps: gaps?.length||0, convs: totalConvs })
      console.log(JSON.stringify({ level:'info', cron:'weekly-summary', hotel: hotel.name, totalConvs, escalationPct, gaps: gaps?.length||0 }))

    } catch (e) {
      console.error(`Weekly summary failed for ${hotel.name}:`, e.message)
    }
  }

  console.log(JSON.stringify({ level:'info', cron:'weekly-summary', runId, event:'cron_done', ts: new Date().toISOString() }))
  return Response.json({ status: 'ok', processed: results })
}
