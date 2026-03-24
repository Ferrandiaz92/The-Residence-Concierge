// components/AnalyticsTab.js (updated - adds Bot QA section)
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
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--gray-400)',fontFamily:'var(--font)' }}>
      Loading analytics...
    </div>
  )

  const s = stats || {}
  const commByCategory = s.commByType || { activity:520, late_checkout:315, restaurant:230, taxi:175 }
  const internalServices = [
    { label:'Housekeeping', value:54, color:'var(--green-800)' },
    { label:'Room service', value:39, color:'var(--gold)' },
    { label:'Spa / massage', value:29, color:'#2563EB' },
    { label:'Tennis court', value:18, color:'#16A34A' },
    { label:'Maintenance', value:13, color:'#D97706' },
    { label:'Luggage', value:11, color:'#9333EA' },
  ]
  const maxInternal = Math.max(...internalServices.map(i=>i.value))
  const issueCategories = [
    { label:'Partner reply', resolved:44, open:6 },
    { label:'Maintenance', resolved:18, open:7 },
    { label:'Bot escalation', resolved:12, open:3 },
    { label:'Declined bkg', resolved:23, open:2 },
  ]
  const feedbackData = [
    { label:'Excellent', pct:69, color:'var(--green-800)' },
    { label:'Regular', pct:16, color:'var(--gold)' },
    { label:'Poor service', pct:15, color:'#D94040' },
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
    const i=val/maxHeat
    if(i<0.2) return '#E8F0EC'; if(i<0.4) return '#C8DDD4'
    if(i<0.6) return '#9FC5BA'; if(i<0.8) return '#3D7A6A'
    return 'var(--green-800)'
  }
  const totalComm = Object.values(commByCategory).reduce((a,b)=>a+b,0)
  const maxComm   = Math.max(...Object.values(commByCategory))
  const kpis = [
    { label:'Monthly commission', value:`€${(s.totalCommission||totalComm).toLocaleString()}`, sub:'+18% vs last month', accent:true },
    { label:'Total bookings', value:s.totalBookings||187, sub:'+24 this week' },
    { label:'Avg response time', value:'18s', sub:'vs 4hrs manual' },
    { label:'Guest satisfaction', value:'4.8', sub:'+0.3 vs last month' },
    { label:'Automation rate', value:'84%', sub:'handled by bot' },
  ]
  const card = (children, style={}) => (
    <div style={{ background:'white',border:'0.5px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'12px',...style }}>{children}</div>
  )
  const cardTitle = (title,sub) => (
    <div style={{ marginBottom:sub?'4px':'10px' }}>
      <div style={{ fontSize:'11px',fontWeight:'500',color:'var(--gray-900)' }}>{title}</div>
      {sub&&<div style={{ fontSize:'9px',color:'var(--gray-400)',marginTop:'2px',marginBottom:'8px' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ height:'100%',overflow:'hidden',display:'flex',flexDirection:'column',fontFamily:'var(--font)' }}>

      {/* Section tabs */}
      <div style={{ display:'flex',background:'white',borderBottom:'0.5px solid var(--border)',flexShrink:0 }}>
        {[
          { key:'overview', label:'Overview' },
          { key:'qa',       label:'Bot QA review' },
        ].map(sec => (
          <button key={sec.key} onClick={() => setActiveSection(sec.key)}
            style={{ padding:'9px 20px',fontSize:'12px',fontWeight:'500',color:activeSection===sec.key?'var(--green-800)':'var(--gray-400)',background:'none',border:'none',borderBottom:activeSection===sec.key?'2px solid var(--green-800)':'2px solid transparent',cursor:'pointer',fontFamily:'var(--font)' }}>
            {sec.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW SECTION */}
      {activeSection === 'overview' && (
        <div className="scrollable" style={{ padding:'14px',background:'var(--gray-50)' }}>

          {/* Export bar */}
          <div style={{ display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px',padding:'10px 14px',background:'white',borderRadius:'var(--radius-lg)',border:'0.5px solid var(--border)' }}>
            <div style={{ flex:1,fontSize:'12px',fontWeight:'500',color:'var(--gray-900)' }}>Activity Report</div>
            <div style={{ fontSize:'11px',color:'var(--gray-500)' }}>Period:</div>
            <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)}
              style={{ padding:'5px 10px',border:'0.5px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:'11px',fontFamily:'var(--font)',outline:'none',color:'var(--gray-800)' }}
            />
            <button onClick={handleExport} disabled={exporting}
              style={{ padding:'7px 16px',background:'var(--green-800)',border:'none',borderRadius:'var(--radius-sm)',fontSize:'11px',fontWeight:'500',color:'white',cursor:'pointer',fontFamily:'var(--font)' }}>
              {exporting?'Opening...':'Export Activity Report'}
            </button>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginBottom:'12px' }}>
            {kpis.map(k=>(
              <div key={k.label} style={{ background:k.accent?'rgba(201,168,76,0.06)':'white',border:`0.5px solid ${k.accent?'var(--gold)':'var(--border)'}`,borderRadius:'var(--radius-lg)',padding:'10px 12px' }}>
                <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'4px' }}>{k.label}</div>
                <div style={{ fontSize:'22px',fontWeight:'500',color:k.accent?'var(--gold)':'var(--gray-900)',lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:'9px',color:'var(--success)',marginTop:'3px' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row 1 */}
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px' }}>
            {card(<>
              {cardTitle('Commission by category',`March 2026 · €${totalComm.toLocaleString()} total`)}
              {Object.entries(commByCategory).map(([type,amount])=>(
                <div key={type} style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px' }}>
                  <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'72px',textAlign:'right',flexShrink:0 }}>{type.replace(/_/g,' ')}</div>
                  <div style={{ flex:1,height:'8px',background:'var(--gray-100)',borderRadius:'4px',overflow:'hidden' }}><div style={{ width:`${(amount/maxComm)*100}%`,height:'100%',background:'var(--green-800)',borderRadius:'4px' }}/></div>
                  <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'32px',textAlign:'right' }}>€{amount}</div>
                </div>
              ))}
            </>)}
            {card(<>
              {cardTitle('Internal services by bot','March · automated requests')}
              {internalServices.map(s=>(
                <div key={s.label} style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px' }}>
                  <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'72px',textAlign:'right',flexShrink:0 }}>{s.label}</div>
                  <div style={{ flex:1,height:'8px',background:'var(--gray-100)',borderRadius:'4px',overflow:'hidden' }}><div style={{ width:`${(s.value/maxInternal)*100}%`,height:'100%',background:s.color,borderRadius:'4px' }}/></div>
                  <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'24px',textAlign:'right' }}>{s.value}</div>
                </div>
              ))}
            </>)}
            {card(<>
              {cardTitle('Issues resolved vs open','March · by category')}
              {issueCategories.map(ic=>{
                const total=ic.resolved+ic.open
                return(
                  <div key={ic.label} style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px' }}>
                    <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'72px',textAlign:'right',flexShrink:0 }}>{ic.label}</div>
                    <div style={{ flex:1,height:'8px',background:'var(--gray-100)',borderRadius:'4px',overflow:'hidden',display:'flex' }}>
                      <div style={{ width:`${(ic.resolved/total)*100}%`,height:'100%',background:'var(--green-800)' }}/>
                      <div style={{ width:`${(ic.open/total)*100}%`,height:'100%',background:'#D94040' }}/>
                    </div>
                    <div style={{ fontSize:'9px',color:'var(--gray-400)',width:'32px',textAlign:'right' }}>{ic.resolved}/{ic.open}</div>
                  </div>
                )
              })}
              <div style={{ display:'flex',gap:'12px',marginTop:'6px' }}>
                {[{label:'Resolved',color:'var(--green-800)'},{label:'Open',color:'#D94040'}].map(l=>(
                  <div key={l.label} style={{ display:'flex',alignItems:'center',gap:'4px',fontSize:'9px',color:'var(--gray-500)' }}>
                    <div style={{ width:'8px',height:'8px',borderRadius:'2px',background:l.color }}/>{l.label}
                  </div>
                ))}
              </div>
            </>)}
          </div>

          {/* Charts row 2 */}
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px' }}>
            {card(<>
              {cardTitle('Client feedback','March 2026 · 94 responses')}
              <div style={{ display:'flex',alignItems:'center',gap:'14px' }}>
                <svg width="74" height="74" viewBox="0 0 74 74" style={{ flexShrink:0 }}>
                  <circle cx="37" cy="37" r="27" fill="none" stroke="#F0F8F4" strokeWidth="10"/>
                  <circle cx="37" cy="37" r="27" fill="none" stroke="var(--green-800)" strokeWidth="10" strokeDasharray="120 50" strokeDashoffset="0"/>
                  <circle cx="37" cy="37" r="27" fill="none" stroke="var(--gold)" strokeWidth="10" strokeDasharray="28 142" strokeDashoffset="-120"/>
                  <circle cx="37" cy="37" r="27" fill="none" stroke="#D94040" strokeWidth="10" strokeDasharray="22 148" strokeDashoffset="-148"/>
                  <text x="37" y="41" textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--gray-900)">94</text>
                </svg>
                <div style={{ display:'flex',flexDirection:'column',gap:'7px',flex:1 }}>
                  {feedbackData.map(f=>(
                    <div key={f.label} style={{ display:'flex',alignItems:'center',gap:'7px',fontSize:'10px',color:'var(--gray-600)' }}>
                      <div style={{ width:'10px',height:'10px',borderRadius:'50%',background:f.color,flexShrink:0 }}/>
                      <span style={{ flex:1 }}>{f.label}</span>
                      <span style={{ fontWeight:'500',color:'var(--gray-900)' }}>{f.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}
            {card(<>
              {cardTitle('Concierge agent — useful?','March · guest feedback per session')}
              <div style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'10px' }}>
                <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'52px',flexShrink:0 }}>Overall</div>
                <div style={{ flex:1,height:'18px',background:'var(--gray-100)',borderRadius:'var(--radius-sm)',overflow:'hidden',display:'flex' }}>
                  <div style={{ width:'79%',height:'100%',background:'var(--green-800)',display:'flex',alignItems:'center',justifyContent:'center' }}><span style={{ fontSize:'9px',fontWeight:'600',color:'white' }}>79% Yes</span></div>
                  <div style={{ width:'21%',height:'100%',background:'#D94040',display:'flex',alignItems:'center',justifyContent:'center' }}><span style={{ fontSize:'9px',fontWeight:'600',color:'white' }}>21%</span></div>
                </div>
              </div>
              {usefulByCategory.map(u=>(
                <div key={u.label} style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px' }}>
                  <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'72px',textAlign:'right',flexShrink:0 }}>{u.label}</div>
                  <div style={{ flex:1,height:'7px',background:'var(--gray-100)',borderRadius:'4px',overflow:'hidden',display:'flex' }}>
                    <div style={{ width:`${u.pct}%`,height:'100%',background:'var(--green-800)' }}/>
                    <div style={{ width:`${100-u.pct}%`,height:'100%',background:'#D94040' }}/>
                  </div>
                  <div style={{ fontSize:'9px',color:'var(--gray-500)',width:'28px',textAlign:'right' }}>{u.pct}%</div>
                </div>
              ))}
            </>)}
            {card(<>
              {cardTitle('Bot interactions by day & time','March · volume heatmap')}
              <div style={{ display:'flex',gap:'3px',paddingLeft:'76px',marginBottom:'4px' }}>
                {days.map(d=><div key={d} style={{ flex:1,fontSize:'8px',color:'var(--gray-400)',textAlign:'center' }}>{d}</div>)}
              </div>
              {slots.map((slot,si)=>(
                <div key={slot} style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'4px' }}>
                  <div style={{ width:'70px',fontSize:'9px',color:'var(--gray-500)',textAlign:'right',flexShrink:0,lineHeight:'1.3',whiteSpace:'pre-line' }}>{slot}</div>
                  <div style={{ flex:1,display:'flex',gap:'3px' }}>
                    {days.map((_,di)=>(
                      <div key={di} style={{ flex:1,height:'22px',background:heatColor(heatmap[di][si]),borderRadius:'3px' }}/>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display:'flex',alignItems:'center',gap:'6px',marginTop:'8px' }}>
                <div style={{ fontSize:'9px',color:'var(--gray-400)' }}>Low</div>
                <div style={{ flex:1,height:'5px',borderRadius:'3px',background:'linear-gradient(to right,#E8F0EC,var(--green-800))' }}/>
                <div style={{ fontSize:'9px',color:'var(--gray-400)' }}>High</div>
              </div>
            </>)}
          </div>

          {/* Top partners */}
          {card(<>
            <div style={{ fontSize:'11px',fontWeight:'500',color:'var(--gray-900)',marginBottom:'10px' }}>Top partners — March</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px' }}>
              {[
                {rank:1,name:'Blue Ocean Boat Tours',type:'activity',bookings:18,comm:432},
                {rank:2,name:'Christos Taxi',type:'taxi',bookings:35,comm:175},
                {rank:3,name:'Meze & More',type:'restaurant',bookings:22,comm:158},
                {rank:4,name:'Commandaria Wine Tours',type:'activity',bookings:8,comm:88},
              ].map(p=>(
                <div key={p.rank} style={{ background:'var(--gray-50)',borderRadius:'var(--radius-md)',padding:'9px 10px' }}>
                  <div style={{ display:'flex',alignItems:'center',gap:'7px',marginBottom:'5px' }}>
                    <div style={{ width:'20px',height:'20px',borderRadius:'var(--radius-sm)',background:'var(--green-100)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',fontWeight:'700',color:'var(--green-800)',flexShrink:0 }}>{p.rank}</div>
                    <div style={{ fontSize:'11px',fontWeight:'500',color:'var(--gray-900)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</div>
                  </div>
                  <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'4px' }}>{p.bookings} bookings · {p.type}</div>
                  <div style={{ fontSize:'14px',fontWeight:'500',color:'var(--success)' }}>€{p.comm}</div>
                </div>
              ))}
            </div>
          </>)}
        </div>
      )}

      {/* BOT QA SECTION */}
      {activeSection === 'qa' && (
        <div className="scrollable" style={{ padding:'14px',background:'var(--gray-50)' }}>
          <BotQA hotelId={hotelId} />
        </div>
      )}
    </div>
  )
}
