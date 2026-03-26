// app/api/orders/route.js
// Read orders + commission summary for the dashboard

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth:{ persistSession:false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}

export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error:'Unauthorized' }, { status:401 })

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    const period  = searchParams.get('period') || '30' // days
    if (!hotelId) return Response.json({ orders:[], summary:{} })

    const supabase = getSupabase()
    const since    = new Date(Date.now() - parseInt(period) * 86400000).toISOString()

    const { data: orders, error } = await supabase
      .from('guest_orders')
      .select(`
        *,
        partner_products ( name, category ),
        partners         ( name, type ),
        guests           ( name, surname, room )
      `)
      .eq('hotel_id', hotelId)
      .gte('created_at', since)
      .order('created_at', { ascending:false })
      .limit(200)

    if (error) return Response.json({ error:error.message }, { status:500 })

    const paid = (orders||[]).filter(o => ['paid','confirmed'].includes(o.status))

    const summary = {
      totalOrders:      orders?.length || 0,
      paidOrders:       paid.length,
      totalRevenue:     paid.reduce((s,o) => s + (o.total_amount||0), 0),
      totalCommission:  paid.reduce((s,o) => s + (o.commission_amount||0), 0),
      pendingPayment:   (orders||[]).filter(o => o.status==='pending_payment').length,
      // By product
      byProduct: paid.reduce((acc, o) => {
        const name = o.partner_products?.name || 'Unknown'
        if (!acc[name]) acc[name] = { count:0, revenue:0, commission:0 }
        acc[name].count      += o.quantity || 1
        acc[name].revenue    += o.total_amount    || 0
        acc[name].commission += o.commission_amount || 0
        return acc
      }, {}),
    }

    return Response.json({ orders: orders||[], summary })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}
