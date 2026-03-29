// app/api/cron/prospect-nurture/route.js
// Runs daily — sends nurture messages to prospects who haven't booked.
// Add to cron-job.org: daily at 10:00am hotel timezone

import { createClient }       from '@supabase/supabase-js'
import { runProspectNurture } from '../../../../src/lib/prospect-nurture.js'
import log                    from '../../../../lib/logger.js'

export const dynamic = 'force-dynamic'

export async function GET(request) {
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

    const { data: hotels } = await supabase
      .from('hotels').select('id, name').eq('active', true)

    const summary = []
    for (const hotel of (hotels || [])) {
      try {
        const results = await runProspectNurture(hotel.id)
        summary.push({ hotel: hotel.name, ...results })
        log.info('Prospect nurture run', { hotelId: hotel.id, ...results })
      } catch (e) {
        await log.error('Prospect nurture failed for hotel', e, { hotelId: hotel.id })
        summary.push({ hotel: hotel.name, error: e.message })
      }
    }

    return Response.json({ status: 'ok', summary })
  } catch (err) {
    await log.error('Prospect nurture cron failed', err, {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}
