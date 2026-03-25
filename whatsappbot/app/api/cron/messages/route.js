// app/api/cron/messages/route.js
// Called every hour by cron-job.org
// Processes all scheduled messages for all hotels

import { createClient } from '@supabase/supabase-js'
import { processScheduledMessages } from '../../../../src/lib/scheduled.js'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    )

    // Get all active hotels
    const { data: hotels } = await supabase
      .from('hotels')
      .select('id, name')
      .eq('active', true)

    const summary = []

    for (const hotel of (hotels || [])) {
      try {
        const results = await processScheduledMessages(hotel.id)
        summary.push({ hotel: hotel.name, ...results })
        console.log(`Scheduled messages — ${hotel.name}:`, results)
      } catch (e) {
        console.error(`Error processing ${hotel.name}:`, e.message)
        summary.push({ hotel: hotel.name, error: e.message })
      }
    }

    return Response.json({ status: 'ok', processed: summary })
  } catch (err) {
    console.error('Cron messages error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
