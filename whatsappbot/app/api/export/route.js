// app/api/export/route.js
// Generates monthly commission report as HTML (printable to PDF)
// Returns HTML that the browser can print/save as PDF

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

export async function GET(request) {
  const session = getSession()
  if (!session) {
    const { searchParams } = new URL(request.url)
    console.warn(JSON.stringify({ level:'warn', event:'auth_failure', route: new URL(request.url).pathname, hotelId: searchParams.get('hotelId') || null, ts: new Date().toISOString() }))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotelId')
    const month   = searchParams.get('month') // e.g. '2026-03'

    if (!hotelId || !month) {
      return Response.json({ error: 'hotelId and month required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Load hotel
    const { data: hotel } = await supabase
      .from('hotels').select('name, config').eq('id', hotelId).single()

    // Load bookings for the month
    const monthStart = `${month}-01`
    const monthEnd   = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0)
      .toISOString().split('T')[0]

    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id, type, status, commission_amount, created_at, details,
        guests(name, surname, room),
        partners(name, type)
      `)
      .eq('hotel_id', hotelId)
      .gte('created_at', `${monthStart}T00:00:00`)
      .lte('created_at', `${monthEnd}T23:59:59`)
      .in('status', ['confirmed', 'completed'])
      .order('created_at')

    // Calculate totals
    const totalCommission = (bookings || []).reduce((s, b) => s + (Number(b.commission_amount) || 0), 0)

    // Group by partner
    const byPartner = {}
    ;(bookings || []).forEach(b => {
      const pName = b.partners?.name || b.type
      if (!byPartner[pName]) byPartner[pName] = { name: pName, type: b.partners?.type || b.type, count: 0, commission: 0 }
      byPartner[pName].count++
      byPartner[pName].commission += Number(b.commission_amount) || 0
    })

    // Group by type
    const byType = {}
    ;(bookings || []).forEach(b => {
      if (!byType[b.type]) byType[b.type] = { count: 0, commission: 0 }
      byType[b.type].count++
      byType[b.type].commission += Number(b.commission_amount) || 0
    })

    const monthLabel = new Date(monthStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    // Generate HTML report
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${hotel?.name || 'Hotel'} — Commission Report ${monthLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; color: #1A1916; padding: 40px; max-width: 800px; margin: 0 auto; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #1C3D2E; }
  .logo { font-size: 20px; font-weight: 600; color: #1C3D2E; }
  .logo span { color: #C9A84C; }
  .hotel-name { font-size: 14px; color: #6E6C66; margin-top: 4px; }
  .report-title { text-align: right; }
  .report-title h1 { font-size: 18px; font-weight: 500; color: #1A1916; }
  .report-title .period { font-size: 13px; color: #9E9C95; margin-top: 4px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
  .summary-card { background: #F8F8F6; border-radius: 10px; padding: 16px; }
  .summary-card.accent { background: #1C3D2E; }
  .summary-label { font-size: 10px; color: #9E9C95; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .summary-card.accent .summary-label { color: rgba(255,255,255,0.6); }
  .summary-value { font-size: 26px; font-weight: 500; color: #1A1916; }
  .summary-card.accent .summary-value { color: #C9A84C; }
  h2 { font-size: 13px; font-weight: 500; color: #1A1916; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 0.5px solid #E0DED8; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th { font-size: 10px; font-weight: 500; color: #9E9C95; text-transform: uppercase; letter-spacing: 0.6px; text-align: left; padding: 8px 10px; border-bottom: 1px solid #E0DED8; }
  td { padding: 9px 10px; font-size: 12px; border-bottom: 0.5px solid #F0EFEB; color: #4A4844; }
  tr:last-child td { border-bottom: none; }
  .td-amount { text-align: right; font-weight: 500; color: #16A34A; }
  .td-count { text-align: center; }
  .td-type { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: #F0FDF4; color: #16A34A; display: inline-block; }
  .total-row td { font-weight: 500; color: #1A1916; border-top: 1px solid #E0DED8; padding-top: 12px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 0.5px solid #E0DED8; display: flex; justify-content: space-between; font-size: 11px; color: #9E9C95; }
  .generated { font-size: 10px; color: #C8C6BF; }
  @media print {
    body { padding: 20px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="logo">The <span>Residence</span> Concierge</div>
    <div class="hotel-name">${hotel?.name || 'Hotel'}</div>
  </div>
  <div class="report-title">
    <h1>Commission Report</h1>
    <div class="period">${monthLabel}</div>
  </div>
</div>

<div class="summary">
  <div class="summary-card accent">
    <div class="summary-label">Total commission</div>
    <div class="summary-value">€${totalCommission.toFixed(2)}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">Confirmed bookings</div>
    <div class="summary-value">${(bookings || []).length}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">Active partners</div>
    <div class="summary-value">${Object.keys(byPartner).length}</div>
  </div>
</div>

<h2>Commission by partner</h2>
<table>
  <thead>
    <tr>
      <th>Partner</th>
      <th>Type</th>
      <th class="td-count">Bookings</th>
      <th style="text-align:right">Commission</th>
    </tr>
  </thead>
  <tbody>
    ${Object.values(byPartner).sort((a,b) => b.commission - a.commission).map(p => `
    <tr>
      <td>${p.name}</td>
      <td><span class="td-type">${p.type}</span></td>
      <td class="td-count">${p.count}</td>
      <td class="td-amount">€${p.commission.toFixed(2)}</td>
    </tr>`).join('')}
    <tr class="total-row">
      <td colspan="2">Total</td>
      <td class="td-count">${(bookings || []).length}</td>
      <td class="td-amount">€${totalCommission.toFixed(2)}</td>
    </tr>
  </tbody>
</table>

<h2>All bookings — ${monthLabel}</h2>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Guest</th>
      <th>Room</th>
      <th>Partner</th>
      <th>Type</th>
      <th style="text-align:right">Commission</th>
    </tr>
  </thead>
  <tbody>
    ${(bookings || []).map(b => `
    <tr>
      <td>${new Date(b.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</td>
      <td>${b.guests?.name || ''} ${b.guests?.surname || ''}</td>
      <td>${b.guests?.room || '—'}</td>
      <td>${b.partners?.name || b.type}</td>
      <td><span class="td-type">${b.type}</span></td>
      <td class="td-amount">€${Number(b.commission_amount || 0).toFixed(2)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="footer">
  <div>The Residence Concierge · theresidenceconcierge.com</div>
  <div class="generated">Generated ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</div>
</div>

<div class="no-print" style="text-align:center;margin-top:30px">
  <button onclick="window.print()" style="padding:10px 24px;background:#1C3D2E;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif">
    Save as PDF
  </button>
</div>

</body>
</html>`

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
