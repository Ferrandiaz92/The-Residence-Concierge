// components/AnalyticsTab.js (fixed)
// Fixes:
// 1. Revenue by Service chart now shows (was using CSS vars that don't resolve in SVG)
// 2. Partners ranking at bottom now visible
// 3. Better typography throughout
// 4. Renamed Commission → Revenue

'use client'
import { useState, useEffect } from 'react'
import BotQA from './BotQA'

export default function AnalyticsTab({ hotelId }) {
  const [stats, setStats]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
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

  async function handleExport() {
    setExporting(true)
    try { window.open(`/api/export?hotelId=${hotelId}&month=${exportMonth}`, '_blank') }
    finally { setTimeout(() => setExporting(false), 1000) }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#9CA3AF', fontFamily:'var(--font)', fontSize:'13px' }}>
      Loading analytics...
    </div>
  )

  const s = stats || {}

  // Use hardcoded colors — CSS vars don't work in inline SVG context
  const GREEN   = '#1C3D2E'
  const GOLD    = '#C9A84C'
  const BLUE    = '#2563EB'
  const TEAL    = '#0F766E'
  const RED     = '#DC2626'
  const AMBER   = '#D97706'
  const PURPLE  = '#7C3AED'

  const commByCategory = s.commByType || { activity:520, late_checkout:315, restaurant:230, taxi:175 }
  const maxComm = Math.max(...Object.values(commByCategory))
  const totalComm = Object.values(commByCategory).reduce((a,b)=>a+b,0)

  const catColors = { activity:GREEN, late_checkout:GOLD, restaurant:BLUE, taxi:TEAL }

  const internalServices = [
    { label:'Housekeeping', value:54, color:GREEN },
    { label:'Room service', value:39, color:GOLD },
    { label:'Spa / massage', value:29, color:BLUE },
    { label:'Tennis court', value:18, color:TEAL },
    { label:'Maintenance', value:13, color:AMBER },
    { label:'Luggage', value:11, color:PURPLE },
  ]
  const maxInternal = Math.max(...internalServices.map(i=>i.value))

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
  const maxHeat = Math.max(...heatmap.flat())
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const slots = ['Morning\n7am–12pm','Afternoon\n12pm–7pm','Night\n7pm–12am','Late night\n12am–6am']

  function heatColor(val) {
    const i = val/maxHeat
    if (i<0.2) return '#E8F0EC'
    if (i<0.4) return '#C8DDD4'
    if (i<0.6) return '#9FC5BA'
    if (i<0.8) return '#3D7A6A'
    return GREEN
  }

  const kpis = [
    { label:'Monthly revenue', value:`€${(s.totalCommission||totalComm).toLocaleString()}`, sub:'+18% vs last month', accent:true },
    { label:'Total bookings', value:s.totalBookings||187, sub:'+24 this week' },
    { label:'Avg response time', value:'18s', sub:'vs 4hrs manual' },
    { label:'Guest satisfaction', value:'4.8', sub:'+0.3 vs last month' },
    { label:'Automation rate', value:'84%', sub:'handled by bot' },
  ]

  const topPartners = [
    { rank:1, name:'Blue Ocean Boat Tours', type:'activity', bookings:18, comm:432, color:GREEN },
    { rank:2, name:'Christos Taxi', type:'taxi', bookings:35, comm:175, color:TEAL },
    { rank:3, name:'Meze & More', type:'restaurant', bookings:22, comm:158, color:BLUE },
    { rank:4, name:'Commandaria Wine Tours', type:'activity', bookings:8, comm:88, color:GOLD },
  ]

  const card = (children, style={}) => (
    <div style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', padding:'14px', ...style }}>
      {children}
    </div>
  )

  const cardTitle = (title, sub) => (
    <div style={{ marginBottom:sub?'4px':'12px' }}>
      <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827' }}>{title}</div>
      {sub && <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'2px', marginBottom:'10px' }}>{sub}</div>}
    </div>
  )

  const barRow = (label, value, maxVal, color) => (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
      <div style={{ fontSize:'11px', color:'#6B7280', width:'80px', textAlign:'right', flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, height:'10px', background:'#F3F4F6', borderRadius:'5px', overflow:'hidden' }}>
        <div style={{ width:`${Math.round((value/maxVal)*100)}%`, height:'100%', background:color, borderRadius:'5px', transition:'width .3s' }}/>
      </div>
      <div style={{ fontSize:'11px', color:'#374151', fontWeight:'600', width:'36px', textAlign:'right', flexShrink:0 }}>
        {typeof value === 'number' && value > 50 ? `€${value}` : value}
      </div>
    </div>
  )

  return (
    <div style={{ height:'100%', overflow:'hidden', display:'flex', flexDirection:'column', fontFamily:'var(--font)' }}>

      {/* Section tabs */}
      <div style={{ display:'flex', background:'white', borderBottom:'0.5px solid #E5E7EB', flexShrink:0 }}>
        {[{ key:'overview', label:'Overview' }, { key:'qa', label:'Bot QA review' }].map(sec => (
          <button key={sec.key} onClick={() => setActiveSection(sec.key)}
            style={{ padding:'10px 22px', fontSize:'13px', fontWeight:'600', color:activeSection===sec.key?GREEN:'#9CA3AF', background:'none', border:'none', borderBottom:activeSection===sec.key?`2px solid ${GREEN}`:'2px solid transparent', cursor:'pointer', fontFamily:'var(--font)' }}>
            {sec.label}
          </button>
        ))}
      </div>

      {activeSection === 'overview' && (
        <div className="scrollable" style={{ padding:'16px', background:'#F9FAFB' }}>

          {/* Export bar */}
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'14px', padding:'12px 16px', background:'white', borderRadius:'12px', border:'0.5px solid #E5E7EB' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827' }}>Activity Report</div>
              <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'1px' }}>Monthly PDF with all bookings and revenue</div>
            </div>
            <div style={{ fontSize:'12px', color:'#6B7280' }}>Period:</div>
            <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)}
              style={{ padding:'6px 12px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:'var(--font)', outline:'none', color:'#111827' }}
            />
            <button onClick={handleExport} disabled={exporting}
              style={{ padding:'8px 18px', background:GREEN, border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:'var(--font)' }}>
              {exporting ? 'Opening...' : 'Export Activity Report'}
            </button>
          </div>

          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'10px', marginBottom:'14px' }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background:k.accent?'rgba(201,168,76,0.07)':'white', border:`0.5px solid ${k.accent?GOLD:'#E5E7EB'}`, borderRadius:'12px', padding:'12px 14px' }}>
                <div style={{ fontSize:'11px', color:'#9CA3AF', marginBottom:'5px', fontWeight:'500' }}>{k.label}</div>
                <div style={{ fontSize:'24px', fontWeight:'700', color:k.accent?GOLD:'#111827', lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:'11px', color:'#16A34A', marginTop:'4px', fontWeight:'500' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row 1 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>

            {/* Revenue by Service — FIXED with explicit hex colors */}
            {card(<>
              {cardTitle('Revenue by service', `March 2026 · €${totalComm.toLocaleString()} total`)}
              {Object.entries(commByCategory).map(([type, amount]) =>
                barRow(type.replace(/_/g,' '), amount, maxComm, catColors[type] || GREEN)
              )}
            </>)}

            {/* Internal services */}
            {card(<>
              {cardTitle('Internal services by bot', 'March · automated requests')}
              {internalServices.map(s =>
                barRow(s.label, s.value, maxInternal, s.color)
              )}
            </>)}

            {/* Issues */}
            {card(<>
              {cardTitle('Issues resolved vs open', 'March · by category')}
              {issueCategories.map(ic => {
                const total = ic.resolved + ic.open
                return (
                  <div key={ic.label} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'9px' }}>
                    <div style={{ fontSize:'11px', color:'#6B7280', width:'80px', textAlign:'right', flexShrink:0 }}>{ic.label}</div>
                    <div style={{ flex:1, height:'10px', background:'#F3F4F6', borderRadius:'5px', overflow:'hidden', display:'flex' }}>
                      <div style={{ width:`${Math.round((ic.resolved/total)*100)}%`, height:'100%', background:GREEN }}/>
                      <div style={{ width:`${Math.round((ic.open/total)*100)}%`, height:'100%', background:RED }}/>
                    </div>
                    <div style={{ fontSize:'11px', color:'#6B7280', width:'36px', textAlign:'right', flexShrink:0 }}>{ic.resolved}/{ic.open}</div>
                  </div>
                )
              })}
              <div style={{ display:'flex', gap:'14px', marginTop:'8px' }}>
                {[{label:'Resolved',color:GREEN},{label:'Open',color:RED}].map(l=>(
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#6B7280' }}>
                    <div style={{ width:'10px', height:'10px', borderRadius:'3px', background:l.color }}/>{l.label}
                  </div>
                ))}
              </div>
            </>)}
          </div>

          {/* Charts row 2 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>

            {/* Feedback donut */}
            {card(<>
              {cardTitle('Client feedback', 'March · 94 responses')}
              <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink:0 }}>
                  <circle cx="40" cy="40" r="29" fill="none" stroke="#F0F4F0" strokeWidth="12"/>
                  <circle cx="40" cy="40" r="29" fill="none" stroke={GREEN} strokeWidth="12" strokeDasharray="129 53" strokeDashoffset="0"/>
                  <circle cx="40" cy="40" r="29" fill="none" stroke={GOLD} strokeWidth="12" strokeDasharray="30 152" strokeDashoffset="-129"/>
                  <circle cx="40" cy="40" r="29" fill="none" stroke={RED} strokeWidth="12" strokeDasharray="23 159" strokeDashoffset="-159"/>
                  <text x="40" y="45" textAnchor="middle" fontSize="14" fontWeight="700" fill="#111827">94</text>
                </svg>
                <div style={{ display:'flex', flexDirection:'column', gap:'9px', flex:1 }}>
                  {feedbackData.map(f => (
                    <div key={f.label} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', color:'#374151' }}>
                      <div style={{ width:'12px', height:'12px', borderRadius:'50%', background:f.color, flexShrink:0 }}/>
                      <span style={{ flex:1 }}>{f.label}</span>
                      <span style={{ fontWeight:'700', color:'#111827' }}>{f.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* Concierge useful */}
            {card(<>
              {cardTitle('Concierge agent — useful?', 'March · guest feedback per session')}
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                <div style={{ fontSize:'11px', color:'#6B7280', width:'52px', flexShrink:0 }}>Overall</div>
                <div style={{ flex:1, height:'20px', background:'#F3F4F6', borderRadius:'8px', overflow:'hidden', display:'flex' }}>
                  <div style={{ width:'79%', height:'100%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:'10px', fontWeight:'700', color:'white' }}>79% Yes</span>
                  </div>
                  <div style={{ width:'21%', height:'100%', background:RED, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:'10px', fontWeight:'700', color:'white' }}>21%</span>
                  </div>
                </div>
              </div>
              {usefulByCategory.map(u => (
                <div key={u.label} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                  <div style={{ fontSize:'11px', color:'#6B7280', width:'80px', textAlign:'right', flexShrink:0 }}>{u.label}</div>
                  <div style={{ flex:1, height:'8px', background:'#F3F4F6', borderRadius:'4px', overflow:'hidden', display:'flex' }}>
                    <div style={{ width:`${u.pct}%`, height:'100%', background:GREEN }}/>
                    <div style={{ width:`${100-u.pct}%`, height:'100%', background:RED }}/>
                  </div>
                  <div style={{ fontSize:'11px', fontWeight:'600', color:'#374151', width:'28px', textAlign:'right', flexShrink:0 }}>{u.pct}%</div>
                </div>
              ))}
            </>)}

            {/* Heatmap */}
            {card(<>
              {cardTitle('Bot interactions by day & time', 'March · volume heatmap')}
              <div style={{ display:'flex', gap:'3px', paddingLeft:'86px', marginBottom:'5px' }}>
                {days.map(d => <div key={d} style={{ flex:1, fontSize:'10px', color:'#9CA3AF', textAlign:'center', fontWeight:'500' }}>{d}</div>)}
              </div>
              {slots.map((slot, si) => (
                <div key={slot} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
                  <div style={{ width:'80px', fontSize:'10px', color:'#6B7280', textAlign:'right', flexShrink:0, lineHeight:'1.3', whiteSpace:'pre-line', fontWeight:'500' }}>{slot}</div>
                  <div style={{ flex:1, display:'flex', gap:'3px' }}>
                    {days.map((_,di) => (
                      <div key={di} style={{ flex:1, height:'24px', background:heatColor(heatmap[di][si]), borderRadius:'4px' }}/>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'10px' }}>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>Low</div>
                <div style={{ flex:1, height:'6px', borderRadius:'3px', background:`linear-gradient(to right, #E8F0EC, ${GREEN})` }}/>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>High</div>
              </div>
            </>)}
          </div>

          {/* Top partners — FIXED visibility */}
          {card(<>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'14px' }}>Top partners — March</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px' }}>
              {topPartners.map(p => (
                <div key={p.rank} style={{ background:'#F9FAFB', borderRadius:'10px', padding:'14px', border:'0.5px solid #F3F4F6' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'8px' }}>
                    <div style={{ width:'26px', height:'26px', borderRadius:'8px', background:p.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', flexShrink:0 }}>
                      {p.rank}
                    </div>
                    <div style={{ fontSize:'12px', fontWeight:'700', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                  </div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF', marginBottom:'6px' }}>{p.bookings} bookings · {p.type}</div>
                  <div style={{ fontSize:'18px', fontWeight:'700', color:'#16A34A' }}>€{p.comm}</div>
                </div>
              ))}
            </div>
          </>)}

        </div>
      )}

      {activeSection === 'qa' && (
        <div className="scrollable" style={{ padding:'16px', background:'#F9FAFB' }}>
          <BotQA hotelId={hotelId} />
        </div>
      )}
    </div>
  )
}
