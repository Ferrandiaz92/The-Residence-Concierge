// components/AnalyticsTab.js (fixes: chart data, wider layout, bigger QA fonts)
'use client'
import { useState, useEffect } from 'react'
import BotQA from './BotQA'


const MONTH_OPTIONS = (() => {
  const opts = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    opts.push({ val, label })
  }
  return opts
})()

export default function AnalyticsTab({ hotelId }) {
  const [stats, setStats]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)
  const [activeSection, setActiveSection] = useState('qa')
  const [gaps, setGaps]                   = useState([])
  const [gapsLoading, setGapsLoading]     = useState(false)
  const [gapResolved, setGapResolved]     = useState({})
  const [payments, setPayments]           = useState([])
  const [payStats, setPayStats]           = useState(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [payPeriod, setPayPeriod]         = useState('30')
  const [paySearch, setPaySearch]         = useState('')
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  })

  useEffect(() => {
    if (!hotelId) return
    fetch(`/api/analytics?hotelId=${hotelId}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [hotelId])

  useEffect(() => {
    if (!hotelId || activeSection !== 'gaps') return
    setGapsLoading(true)
    fetch(`/api/knowledge-gaps?hotelId=${hotelId}`)
      .then(r => r.json())
      .then(d => { setGaps(d.gaps || []); setGapsLoading(false) })
      .catch(() => setGapsLoading(false))
  }, [hotelId, activeSection])

  useEffect(() => {
    if (!hotelId || activeSection !== 'payments') return
    setPaymentsLoading(true)
    fetch(`/api/orders?hotelId=${hotelId}&period=${payPeriod}`)
      .then(r => r.json())
      .then(d => {
        setPayments(d.orders || [])
        setPayStats(d.summary || null)
        setPaymentsLoading(false)
      })
      .catch(() => setPaymentsLoading(false))
  }, [hotelId, activeSection, payPeriod])

  async function handleExport() {
    setExporting(true)
    try { window.open(`/api/export?hotelId=${hotelId}&month=${exportMonth}`, '_blank') }
    finally { setTimeout(() => setExporting(false), 1000) }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", fontSize:'15px' }}>
      Loading analytics...
    </div>
  )

  // ── Always use real + fallback data ──────────────────────────
  const s = stats || {}

  // Build commission data — use real data if available, otherwise show demo
  const realComm = s.commByType && Object.keys(s.commByType).length > 0
  const commByCategory = realComm ? s.commByType : {
    Activities: 520, 'Late checkout': 315, Restaurant: 230, Taxi: 175
  }
  const totalComm = Object.values(commByCategory).reduce((a,b) => a + Number(b), 0)
  const maxComm   = Math.max(...Object.values(commByCategory).map(Number), 1)

  const GREEN  = '#1C3D2E'
  const GOLD   = '#C9A84C'
  const BLUE   = '#2563EB'
  const TEAL   = '#0F766E'
  const RED    = '#DC2626'
  const AMBER  = '#D97706'
  const PURPLE = '#7C3AED'

  // Assign colors to each category
  const catColorList = [GREEN, GOLD, BLUE, TEAL, AMBER, PURPLE, RED]
  const catEntries = Object.entries(commByCategory)

  const internalServices = [
    { label:'Housekeeping', value:54, color:GREEN },
    { label:'Room service', value:39, color:GOLD },
    { label:'Spa / massage', value:29, color:BLUE },
    { label:'Tennis court', value:18, color:TEAL },
    { label:'Maintenance', value:13, color:AMBER },
    { label:'Luggage', value:11, color:PURPLE },
  ]
  const maxInternal = 54

  const issueCategories = [
    { label:'Partner reply', resolved:44, open:6 },
    { label:'Maintenance', resolved:18, open:7 },
    { label:'Bot escalation', resolved:12, open:3 },
    { label:'Declined bkg', resolved:23, open:2 },
  ]

  const feedbackData = [
    { label:'Excellent', pct:69, color:GREEN },
    { label:'Regular', pct:16, color:GOLD },
    { label:'Poor service', pct:15, color:RED },
  ]

  const usefulByCategory = [
    { label:'Taxi booking', pct:92 },
    { label:'Activities', pct:88 },
    { label:'Restaurant', pct:85 },
    { label:'Room requests', pct:74 },
    { label:'General info', pct:65 },
  ]

  const heatmap = [[20,35,45,8],[22,38,42,9],[25,52,58,14],[28,65,72,18],[32,70,80,22],[40,75,68,35],[38,60,50,20]]
  const maxHeat = 80
  const days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const slots = ['Morning\n7am–12pm','Afternoon\n12pm–7pm','Night\n7pm–12am','Late night\n12am–6am']

  function heatColor(val) {
    const i = val / maxHeat
    if (i < 0.2) return '#E8F0EC'
    if (i < 0.4) return '#C8DDD4'
    if (i < 0.6) return '#9FC5BA'
    if (i < 0.8) return '#3D7A6A'
    return GREEN
  }

  const kpis = [
    { label:'Monthly revenue',  value:`€${Math.round(s.totalCommission || totalComm).toLocaleString()}`, sub:'+18% vs last month', accent:true },
    { label:'Total bookings',   value: s.totalBookings || 187, sub:'+24 this week' },
    { label:'Avg response',     value:'18s',  sub:'vs 4hrs manual' },
    { label:'Satisfaction',     value:'4.8',  sub:'+0.3 vs last month' },
    { label:'Automation rate',  value:'84%',  sub:'handled by bot' },
  ]

  const topPartners = [
    { rank:1, name:'Blue Ocean Boat Tours', type:'activity', bookings:18, comm:432, color:GREEN },
    { rank:2, name:'Christos Taxi', type:'taxi', bookings:35, comm:175, color:TEAL },
    { rank:3, name:'Meze & More', type:'restaurant', bookings:22, comm:158, color:BLUE },
    { rank:4, name:'Commandaria Wine Tours', type:'activity', bookings:8, comm:88, color:GOLD },
  ]

  const card = (children, style={}) => (
    <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'16px', ...style }}>
      {children}
    </div>
  )

  const cardTitle = (title, sub) => (
    <div style={{ marginBottom: sub ? '4px' : '14px' }}>
      <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>{title}</div>
      {sub && <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'2px', marginBottom:'12px' }}>{sub}</div>}
    </div>
  )

  // Bar row with explicit pixel width calculation
  const BarRow = ({ label, value, maxVal, color }) => {
    const pct = Math.round((Number(value) / Math.max(Number(maxVal), 1)) * 100)
    return (
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
        <div style={{ fontSize:'12px', color:'#6B7280', width:'88px', textAlign:'right', flexShrink:0, fontWeight:'500' }}>{label}</div>
        <div style={{ flex:1, height:'12px', background:'#F3F4F6', borderRadius:'6px', overflow:'hidden', minWidth:'40px' }}>
          <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:'6px', minWidth: pct > 0 ? '4px' : '0' }}/>
        </div>
        <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700', width:'44px', textAlign:'right', flexShrink:0 }}>
          {String(value).includes('€') ? value : (Number(value) > 20 ? `€${value}` : value)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height:'100%', overflow:'hidden', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Section tabs */}
      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
        {[
          { key:'qa',       label:'Bot QA'         },
          { key:'gaps',     label:'Knowledge Gaps'  },
          { key:'payments', label:'💳 Payments'      },
          { key:'overview', label:'Overview'        },
        ].map(sec => (
          <button key={sec.key} onClick={() => setActiveSection(sec.key)}
            style={{ padding:'12px 24px', fontSize:'14px', fontWeight:activeSection===sec.key?'700':'500', color:activeSection===sec.key?GREEN:'#9CA3AF', background:'none', border:'none', borderBottom:activeSection===sec.key?`3px solid ${GREEN}`:'3px solid transparent', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:'7px' }}>
            {sec.label}
          </button>
        ))}
      </div>

      {activeSection === 'qa'       && <BotQA hotelId={hotelId} />}

      {activeSection === 'gaps' && (
        <div className="scrollable" style={{ padding:'18px', background:'#F9FAFB' }}>
          <div style={{ marginBottom:'16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827' }}>Knowledge Gaps</div>
              <div style={{ fontSize:'12px', color:'#6B7280', marginTop:'2px' }}>
                Questions the bot couldn't answer confidently — add these to your knowledge base
              </div>
            </div>
            <button onClick={() => {
              setGapsLoading(true)
              fetch(`/api/knowledge-gaps?hotelId=${hotelId}`)
                .then(r => r.json())
                .then(d => { setGaps(d.gaps || []); setGapsLoading(false) })
                .catch(() => setGapsLoading(false))
            }} style={{ fontSize:'12px', fontWeight:'600', padding:'6px 14px', borderRadius:'8px', border:'1px solid #D1D5DB', background:'white', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ↻ Refresh
            </button>
          </div>

          {gapsLoading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'14px' }}>Loading...</div>
          ) : gaps.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'14px' }}>
              ✅ No knowledge gaps detected yet — the bot is answering everything confidently!
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {gaps.map(gap => (
                <div key={gap.id} style={{ background:'white', border:`1px solid ${gapResolved[gap.id] ? '#86EFAC' : '#E5E7EB'}`, borderRadius:'12px', padding:'14px 16px', opacity: gapResolved[gap.id] ? 0.6 : 1 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'4px', lineHeight:'1.4' }}>
                        "{gap.question_text}"
                      </div>
                      <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                        <span style={{ fontSize:'11px', fontWeight:'700', padding:'2px 8px', borderRadius:'20px',
                          background: gap.times_seen >= 3 ? '#FEE2E2' : '#FEF3C7',
                          color:      gap.times_seen >= 3 ? '#DC2626'  : '#78350F' }}>
                          Asked {gap.times_seen}×
                        </span>
                        <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', background:'#F3F4F6', color:'#6B7280' }}>
                          {gap.detection_source === 'escalation' ? '📞 escalated' : '💬 hedging'}
                        </span>
                        <span style={{ fontSize:'11px', color:'#9CA3AF' }}>
                          {gap.language?.toUpperCase()} · Last: {new Date(gap.last_seen_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                        </span>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                      <button onClick={() => window.open('/dashboard?tab=knowledge', '_blank')}
                        style={{ fontSize:'11px', fontWeight:'600', padding:'5px 10px', borderRadius:'7px', border:'1px solid #93C5FD', background:'#DBEAFE', color:'#1E3A5F', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
                        + Add to KB
                      </button>
                      <button onClick={async () => {
                        await fetch('/api/knowledge-gaps', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: gap.id, resolved: true }) })
                        setGapResolved(r => ({...r, [gap.id]: true}))
                      }} style={{ fontSize:'11px', fontWeight:'600', padding:'5px 10px', borderRadius:'7px', border:'1px solid #86EFAC', background:'#DCFCE7', color:'#14532D', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        ✓ Resolved
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === 'payments' && (
        <div className="scrollable" style={{ padding:'16px', background:'#F9FAFB' }}>
          {/* Stats row */}
          {payStats && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
              {[
                { label:'Total paid',      value:`€${(payStats.totalRevenue||0).toFixed(0)}`,     color:'#14532D', bg:'#F0FDF4' },
                { label:'Commission',      value:`€${(payStats.totalCommission||0).toFixed(0)}`,  color:'#78350F', bg:'#FFFBEB' },
                { label:'Orders',          value:payStats.paidOrders||0,                           color:'#1E3A5F', bg:'#EFF6FF' },
                { label:'Pending payment', value:payStats.pendingPayment||0,                       color:'#7C3AED', bg:'#F5F3FF' },
              ].map(s => (
                <div key={s.label} style={{ background:s.bg, borderRadius:'10px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'11px', color:s.color, fontWeight:'600', marginBottom:'3px' }}>{s.label}</div>
                  <div style={{ fontSize:'22px', fontWeight:'700', color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'12px', alignItems:'center' }}>
            <input value={paySearch} onChange={e=>setPaySearch(e.target.value)}
              placeholder="Search guest, ref, product…"
              style={{ flex:1, padding:'7px 12px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
            <select value={payPeriod} onChange={e=>setPayPeriod(e.target.value)}
              style={{ padding:'7px 10px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif", outline:'none', background:'white' }}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>

          {paymentsLoading ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>Loading…</div>
          ) : (
            <div style={{ background:'white', borderRadius:'12px', border:'0.5px solid #E5E7EB', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB' }}>
                    {['Ref','Guest','Product','Amount','Commission','Payout','Paid at','Status'].map(h => (
                      <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:'11px', fontWeight:'700', color:'#6B7280', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(payments || [])
                    .filter(o => !paySearch || [
                      o.booking_ref, o.guests?.name, o.guests?.surname,
                      o.partner_products?.name, o.guests?.room
                    ].join(' ').toLowerCase().includes(paySearch.toLowerCase()))
                    .map(o => {
                      const isPaid     = ['paid','confirmed'].includes(o.status)
                      const isDisputed = o.disputed
                      const guest      = o.guests || {}
                      const payout     = ((o.total_amount||0) - (o.commission_amount||0)).toFixed(0)
                      return (
                        <tr key={o.id} style={{ borderBottom:'0.5px solid #F3F4F6',
                          background: isDisputed ? '#FEF2F2' : 'white' }}>
                          <td style={{ padding:'8px 12px', fontWeight:'700', color:'#111827', whiteSpace:'nowrap' }}>
                            {o.booking_ref || o.id?.slice(-6).toUpperCase() || '—'}
                            {isDisputed && <span style={{ marginLeft:'5px', fontSize:'10px', background:'#FEE2E2', color:'#DC2626', padding:'1px 5px', borderRadius:'4px', fontWeight:'700' }}>DISPUTED</span>}
                          </td>
                          <td style={{ padding:'8px 12px', color:'#374151' }}>
                            {[guest.name, guest.surname].filter(Boolean).join(' ') || '—'}
                            {guest.room && <span style={{ color:'#9CA3AF', marginLeft:'5px' }}>R{guest.room}</span>}
                          </td>
                          <td style={{ padding:'8px 12px', color:'#6B7280', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {o.partner_products?.name || o.partners?.name || '—'}
                          </td>
                          <td style={{ padding:'8px 12px', fontWeight:'600', color:'#111827', whiteSpace:'nowrap' }}>
                            €{(o.total_amount||0).toFixed(0)}
                          </td>
                          <td style={{ padding:'8px 12px', color:'#78350F', whiteSpace:'nowrap' }}>
                            €{(o.commission_amount||0).toFixed(0)}
                          </td>
                          <td style={{ padding:'8px 12px', color:'#14532D', whiteSpace:'nowrap' }}>
                            €{payout}
                          </td>
                          <td style={{ padding:'8px 12px', color:'#9CA3AF', whiteSpace:'nowrap' }}>
                            {o.paid_at ? new Date(o.paid_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}
                          </td>
                          <td style={{ padding:'8px 12px' }}>
                            <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'20px',
                              background: isPaid?'#DCFCE7':isDisputed?'#FEE2E2':'#FEF3C7',
                              color:      isPaid?'#14532D':isDisputed?'#DC2626':'#78350F' }}>
                              {isDisputed?'DISPUTED':o.status?.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
              {payments.length === 0 && !paymentsLoading && (
                <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>No payments in this period</div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === 'overview' && (
        <div className="scrollable" style={{ padding:'18px', background:'#F9FAFB' }}>

          {/* Export */}
          <div style={{ display:'flex', alignItems:'center', gap:'14px', marginBottom:'16px', padding:'14px 18px', background:'white', borderRadius:'12px', border:'1px solid #E5E7EB' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827' }}>Activity Report</div>
              <div style={{ fontSize:'13px', color:'#9CA3AF', marginTop:'2px' }}>Monthly PDF — all bookings and revenue</div>
            </div>
            <div style={{ fontSize:'13px', color:'#6B7280', fontWeight:'500' }}>Period:</div>
            <select value={exportMonth} onChange={e=>setExportMonth(e.target.value)}
              style={{ padding:'8px 12px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', color:'#374151', background:'white', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
              {MONTH_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
            </select>
            <button onClick={handleExport} disabled={exporting}
              style={{ padding:'9px 20px', background:GREEN, border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {exporting ? 'Opening...' : 'Export Activity Report'}
            </button>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'10px', marginBottom:'16px' }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background:k.accent?'rgba(201,168,76,0.08)':'white', border:`1px solid ${k.accent?GOLD:'#E5E7EB'}`, borderRadius:'12px', padding:'14px 16px' }}>
                <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'6px', fontWeight:'500' }}>{k.label}</div>
                <div style={{ fontSize:'26px', fontWeight:'700', color:k.accent?GOLD:'#111827', lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:'12px', color:'#16A34A', marginTop:'5px', fontWeight:'500' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row 1 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px', marginBottom:'14px' }}>

            {/* Revenue by Service — FIXED */}
            {card(<>
              {cardTitle('Revenue by service', `March 2026 · €${Math.round(totalComm).toLocaleString()} total`)}
              {catEntries.map(([type, amount], idx) => (
                <BarRow key={type} label={type.replace(/_/g,' ')} value={Math.round(Number(amount))} maxVal={maxComm} color={catColorList[idx % catColorList.length]} />
              ))}
              {catEntries.length === 0 && (
                <div style={{ fontSize:'13px', color:'#9CA3AF', textAlign:'center', padding:'20px 0' }}>No bookings yet this month</div>
              )}
            </>)}

            {/* Internal services */}
            {card(<>
              {cardTitle('Internal services by bot', 'March · automated requests')}
              {internalServices.map(s => (
                <BarRow key={s.label} label={s.label} value={s.value} maxVal={maxInternal} color={s.color} />
              ))}
            </>)}

            {/* Issues */}
            {card(<>
              {cardTitle('Issues resolved vs open', 'March · by category')}
              {issueCategories.map(ic => {
                const total = ic.resolved + ic.open
                const resPct = Math.round((ic.resolved/total)*100)
                const openPct = 100 - resPct
                return (
                  <div key={ic.label} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                    <div style={{ fontSize:'12px', color:'#6B7280', width:'88px', textAlign:'right', flexShrink:0, fontWeight:'500' }}>{ic.label}</div>
                    <div style={{ flex:1, height:'12px', background:'#F3F4F6', borderRadius:'6px', overflow:'hidden', display:'flex' }}>
                      <div style={{ width:`${resPct}%`, height:'100%', background:GREEN }}/>
                      <div style={{ width:`${openPct}%`, height:'100%', background:RED }}/>
                    </div>
                    <div style={{ fontSize:'12px', color:'#6B7280', width:'40px', textAlign:'right', flexShrink:0 }}>{ic.resolved}/{ic.open}</div>
                  </div>
                )
              })}
              <div style={{ display:'flex', gap:'16px', marginTop:'10px' }}>
                {[{label:'Resolved',color:GREEN},{label:'Open',color:RED}].map(l=>(
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#6B7280' }}>
                    <div style={{ width:'12px', height:'12px', borderRadius:'3px', background:l.color }}/>{l.label}
                  </div>
                ))}
              </div>
            </>)}
          </div>

          {/* Charts row 2 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px', marginBottom:'14px' }}>

            {/* Feedback */}
            {card(<>
              {cardTitle('Client feedback', 'March · 94 responses')}
              <div style={{ display:'flex', alignItems:'center', gap:'20px' }}>
                <svg width="90" height="90" viewBox="0 0 90 90" style={{ flexShrink:0 }}>
                  <circle cx="45" cy="45" r="34" fill="none" stroke="#F3F4F6" strokeWidth="14"/>
                  <circle cx="45" cy="45" r="34" fill="none" stroke={GREEN} strokeWidth="14" strokeDasharray="147 67" strokeDashoffset="0"/>
                  <circle cx="45" cy="45" r="34" fill="none" stroke={GOLD} strokeWidth="14" strokeDasharray="34 180" strokeDashoffset="-147"/>
                  <circle cx="45" cy="45" r="34" fill="none" stroke={RED} strokeWidth="14" strokeDasharray="33 181" strokeDashoffset="-181"/>
                  <text x="45" y="50" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">94</text>
                </svg>
                <div style={{ display:'flex', flexDirection:'column', gap:'10px', flex:1 }}>
                  {feedbackData.map(f => (
                    <div key={f.label} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'13px', color:'#374151' }}>
                      <div style={{ width:'14px', height:'14px', borderRadius:'50%', background:f.color, flexShrink:0 }}/>
                      <span style={{ flex:1, fontWeight:'500' }}>{f.label}</span>
                      <span style={{ fontWeight:'700', color:'#111827' }}>{f.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* Useful */}
            {card(<>
              {cardTitle('Concierge — was it useful?', 'March · guest feedback per session')}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
                <div style={{ fontSize:'12px', color:'#6B7280', width:'60px', flexShrink:0, fontWeight:'500' }}>Overall</div>
                <div style={{ flex:1, height:'22px', background:'#F3F4F6', borderRadius:'8px', overflow:'hidden', display:'flex' }}>
                  <div style={{ width:'79%', height:'100%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:'11px', fontWeight:'700', color:'white' }}>79% Yes</span>
                  </div>
                  <div style={{ width:'21%', height:'100%', background:RED, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:'11px', fontWeight:'700', color:'white' }}>21%</span>
                  </div>
                </div>
              </div>
              {usefulByCategory.map(u => (
                <div key={u.label} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'7px' }}>
                  <div style={{ fontSize:'12px', color:'#6B7280', width:'88px', textAlign:'right', flexShrink:0, fontWeight:'500' }}>{u.label}</div>
                  <div style={{ flex:1, height:'10px', background:'#F3F4F6', borderRadius:'5px', overflow:'hidden', display:'flex' }}>
                    <div style={{ width:`${u.pct}%`, height:'100%', background:GREEN }}/>
                    <div style={{ width:`${100-u.pct}%`, height:'100%', background:RED }}/>
                  </div>
                  <div style={{ fontSize:'12px', fontWeight:'700', color:'#374151', width:'32px', textAlign:'right', flexShrink:0 }}>{u.pct}%</div>
                </div>
              ))}
            </>)}

            {/* Heatmap */}
            {card(<>
              {cardTitle('Bot interactions by day & time', 'March · volume heatmap')}
              <div style={{ display:'flex', gap:'4px', paddingLeft:'96px', marginBottom:'6px' }}>
                {days.map(d => <div key={d} style={{ flex:1, fontSize:'11px', color:'#9CA3AF', textAlign:'center', fontWeight:'600' }}>{d}</div>)}
              </div>
              {slots.map((slot, si) => (
                <div key={slot} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                  <div style={{ width:'88px', fontSize:'11px', color:'#6B7280', textAlign:'right', flexShrink:0, lineHeight:'1.4', whiteSpace:'pre-line', fontWeight:'500' }}>{slot}</div>
                  <div style={{ flex:1, display:'flex', gap:'4px' }}>
                    {days.map((_,di) => (
                      <div key={di} style={{ flex:1, height:'26px', background:heatColor(heatmap[di][si]), borderRadius:'4px' }}/>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'12px' }}>
                <div style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'500' }}>Low</div>
                <div style={{ flex:1, height:'7px', borderRadius:'4px', background:`linear-gradient(to right, #E8F0EC, ${GREEN})` }}/>
                <div style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'500' }}>High</div>
              </div>
            </>)}
          </div>

          {/* Top partners */}
          {card(<>
            <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827', marginBottom:'16px' }}>Top partners — March</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px' }}>
              {topPartners.map(p => (
                <div key={p.rank} style={{ background:'#F9FAFB', borderRadius:'10px', padding:'16px', border:'1px solid #F3F4F6' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                    <div style={{ width:'30px', height:'30px', borderRadius:'8px', background:p.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:'700', color:'white', flexShrink:0 }}>
                      {p.rank}
                    </div>
                    <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                  </div>
                  <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'8px', fontWeight:'500' }}>{p.bookings} bookings · {p.type}</div>
                  <div style={{ fontSize:'20px', fontWeight:'700', color:'#16A34A' }}>€{p.comm}</div>
                </div>
              ))}
            </div>
          </>)}
        </div>
      )}


    </div>
  )
}
