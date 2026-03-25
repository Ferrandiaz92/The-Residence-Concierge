// components/VisitorsTab.js
// Day visitor analytics — top visitors, service usage, frequency
'use client'
import { useState, useEffect } from 'react'

const SERVICE_COLORS = {
  tennis:     { color:'#16A34A', bg:'#DCFCE7', icon:'🎾' },
  spa:        { color:'#7C3AED', bg:'#FAF5FF', icon:'💆' },
  restaurant: { color:'#2563EB', bg:'#DBEAFE', icon:'🍽️' },
  conference: { color:'#D97706', bg:'#FEF3C7', icon:'🤝' },
  pool:       { color:'#0891B2', bg:'#ECFEFF', icon:'🏊' },
  golf:       { color:'#15803D', bg:'#F0FDF4', icon:'⛳' },
  other:      { color:'#64748B', bg:'#F1F5F9', icon:'✨' },
}

const STATUS_CONFIG = {
  active:   { label:'Active',   color:'#16A34A', bg:'#DCFCE7', desc:'visited this week' },
  regular:  { label:'Regular',  color:'#2563EB', bg:'#DBEAFE', desc:'visited this month' },
  fading:   { label:'Fading',   color:'#D97706', bg:'#FEF3C7', desc:'3–6 weeks away' },
  inactive: { label:'Inactive', color:'#DC2626', bg:'#FEE2E2', desc:'6+ weeks away' },
  new:      { label:'New',      color:'#64748B', bg:'#F1F5F9', desc:'no visits yet' },
}

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function VisitorsTab({ hotelId }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [section, setSection]   = useState('overview')
  const [filter, setFilter]     = useState('all')
  const [showAdd, setShowAdd]   = useState(false)
  const [newVisitor, setNewVisitor] = useState({ name:'', surname:'', phone:'', language:'en', preferredServices:[] })
  const [saving, setSaving]     = useState(false)
  const [logVisitFor, setLogVisitFor] = useState(null)
  const [logService, setLogService]   = useState('tennis')

  useEffect(() => {
    if (!hotelId) return
    loadData()
  }, [hotelId, filter])

  async function loadData() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/visitors?hotelId=${hotelId}&type=${filter}`)
      const json = await res.json()
      setData(json)
    } finally { setLoading(false) }
  }

  async function handleAddVisitor() {
    setSaving(true)
    try {
      await fetch('/api/visitors', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ hotelId, ...newVisitor }),
      })
      setShowAdd(false)
      setNewVisitor({ name:'', surname:'', phone:'', language:'en', preferredServices:[] })
      loadData()
    } finally { setSaving(false) }
  }

  async function handleLogVisit(guestId) {
    await fetch('/api/visitors', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: guestId, hotelId, logVisit: true, serviceType: logService }),
    })
    setLogVisitFor(null)
    loadData()
  }

  function getVisitorStatus(v) {
    if (!v.last_visit_at) return 'new'
    const days = Math.floor((Date.now() - new Date(v.last_visit_at)) / (1000*60*60*24))
    if (days <= 7) return 'active'
    if (days <= 21) return 'regular'
    if (days <= 42) return 'fading'
    return 'inactive'
  }

  function getServiceConfig(type) {
    return SERVICE_COLORS[type?.toLowerCase()] || SERVICE_COLORS.other
  }

  const s    = data?.stats || {}
  const visitors = data?.visitors || []
  const maxDay   = Math.max(...(s.visitsByDay || [0]), 1)

  const inp = { width:'100%', padding:'9px 12px', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827', background:'white' }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", fontSize:'14px' }}>
      Loading visitor data...
    </div>
  )

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Section tabs */}
      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E5E7EB', flexShrink:0, justifyContent:'space-between', alignItems:'center', paddingRight:'16px' }}>
        <div style={{ display:'flex' }}>
          {[
            { key:'overview', label:'Overview' },
            { key:'visitors', label:'Top visitors' },
          ].map(sec => (
            <button key={sec.key} onClick={() => setSection(sec.key)}
              style={{ padding:'11px 22px', fontSize:'14px', fontWeight:section===sec.key?'700':'500', color:section===sec.key?'#1C3D2E':'#9CA3AF', background:'none', border:'none', borderBottom:section===sec.key?'3px solid #1C3D2E':'3px solid transparent', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {sec.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding:'7px 16px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          + Add visitor
        </button>
      </div>

      {/* Add visitor panel */}
      {showAdd && (
        <div style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB', padding:'16px 20px', flexShrink:0 }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'12px' }}>Add day visitor</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:'10px', alignItems:'end' }}>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>First name *</div>
              <input value={newVisitor.name} onChange={e=>setNewVisitor(v=>({...v,name:e.target.value}))} placeholder="Maria" style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>Last name</div>
              <input value={newVisitor.surname} onChange={e=>setNewVisitor(v=>({...v,surname:e.target.value}))} placeholder="Santos" style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>WhatsApp *</div>
              <input value={newVisitor.phone} onChange={e=>setNewVisitor(v=>({...v,phone:e.target.value}))} placeholder="+35799..." style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>Preferred service</div>
              <select value={newVisitor.preferredServices?.[0]||''} onChange={e=>setNewVisitor(v=>({...v,preferredServices:e.target.value?[e.target.value]:[]}))} style={inp}>
                <option value="">Select...</option>
                {Object.entries(SERVICE_COLORS).filter(([k])=>k!=='other').map(([k,v])=>(
                  <option key={k} value={k}>{v.icon} {k.charAt(0).toUpperCase()+k.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={handleAddVisitor} disabled={saving||!newVisitor.name||!newVisitor.phone}
                style={{ padding:'9px 18px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
                {saving?'Saving...':'Save'}
              </button>
              <button onClick={()=>setShowAdd(false)} style={{ padding:'9px 14px', background:'white', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', color:'#6B7280', cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="scrollable" style={{ padding:'18px', background:'#F9FAFB' }}>

        {/* OVERVIEW */}
        {section === 'overview' && (
          <>
            {/* KPI row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
              {[
                { label:'Total day visitors', value: s.total || 0 },
                { label:'Visits this month', value: s.monthVisits || 0 },
                { label:'Active visitors', value: s.statusCounts?.active || 0, gold: true },
                { label:'Fading (need attention)', value: s.statusCounts?.fading || 0, warn: true },
              ].map(k => (
                <div key={k.label} style={{ background:k.warn?'#FEE2E2':k.gold?'rgba(201,168,76,0.08)':'white', border:`1px solid ${k.warn?'#FCA5A5':k.gold?'rgba(201,168,76,0.3)':'#E5E7EB'}`, borderRadius:'12px', padding:'14px 16px' }}>
                  <div style={{ fontSize:'12px', color:k.warn?'#991B1B':k.gold?'#78350F':'#6B7280', fontWeight:'500', marginBottom:'5px' }}>{k.label}</div>
                  <div style={{ fontSize:'28px', fontWeight:'700', color:k.warn?'#DC2626':k.gold?'#C9A84C':'#111827', lineHeight:1 }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Status breakdown + service usage */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px' }}>

              {/* Status breakdown */}
              <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'14px' }}>Visitor status breakdown</div>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const count = s.statusCounts?.[key] || 0
                  const total = s.total || 1
                  const pct   = Math.round((count/total)*100)
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                      <div style={{ fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'20px', background:cfg.bg, color:cfg.color, width:'68px', textAlign:'center', flexShrink:0 }}>
                        {cfg.label}
                      </div>
                      <div style={{ flex:1, height:'10px', background:'#F3F4F6', borderRadius:'5px', overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:cfg.color, borderRadius:'5px', minWidth:count>0?'4px':'0' }}/>
                      </div>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', width:'28px', textAlign:'right', flexShrink:0 }}>{count}</div>
                      <div style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0, width:'100px' }}>{cfg.desc}</div>
                    </div>
                  )
                })}
              </div>

              {/* Most used services */}
              <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'14px' }}>Most used services</div>
                {(s.topServices || []).length === 0 ? (
                  <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:'13px', padding:'20px' }}>No service data yet</div>
                ) : (
                  (s.topServices || []).map((svc, idx) => {
                    const cfg = getServiceConfig(svc.name)
                    const maxCount = s.topServices[0]?.count || 1
                    return (
                      <div key={svc.name} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'9px' }}>
                        <div style={{ fontSize:'16px', width:'22px', textAlign:'center', flexShrink:0 }}>{cfg.icon}</div>
                        <div style={{ fontSize:'12px', color:'#374151', fontWeight:'500', width:'100px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{svc.name}</div>
                        <div style={{ flex:1, height:'10px', background:'#F3F4F6', borderRadius:'5px', overflow:'hidden' }}>
                          <div style={{ width:`${Math.round((svc.count/maxCount)*100)}%`, height:'100%', background:cfg.color, borderRadius:'5px' }}/>
                        </div>
                        <div style={{ fontSize:'13px', fontWeight:'700', color:'#374151', width:'28px', textAlign:'right', flexShrink:0 }}>{svc.count}</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Visit frequency by day */}
            <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
              <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'16px' }}>Visit frequency by day of week — last 90 days</div>
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-end', height:'80px' }}>
                {(s.visitsByDay || [0,0,0,0,0,0,0]).map((count, idx) => {
                  const pct = Math.round((count/maxDay)*100)
                  return (
                    <div key={idx} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                      <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151' }}>{count}</div>
                      <div style={{ width:'100%', background:`#1C3D2E`, borderRadius:'4px 4px 0 0', height:`${Math.max(pct * 0.5, count > 0 ? 4 : 0)}px`, minHeight: count > 0 ? '4px' : '0', transition:'height .3s' }}/>
                      <div style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'500' }}>{DAYS[idx]}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* TOP VISITORS */}
        {section === 'visitors' && (
          <>
            {/* Filter */}
            <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
              {[
                { key:'all', label:'All visitors' },
                { key:'day_visitor', label:'Day visitors' },
                { key:'event', label:'Event guests' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  style={{ padding:'7px 16px', borderRadius:'20px', fontSize:'13px', fontWeight:filter===f.key?'700':'500', border:`1px solid ${filter===f.key?'#1C3D2E':'#D1D5DB'}`, background:filter===f.key?'#1C3D2E':'white', color:filter===f.key?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {f.label}
                </button>
              ))}
              <div style={{ marginLeft:'auto', fontSize:'13px', color:'#9CA3AF', alignSelf:'center' }}>
                {visitors.length} visitors
              </div>
            </div>

            {/* Visitor list */}
            {visitors.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:'14px' }}>
                No day visitors yet — add your first one above
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {visitors.map((v, idx) => {
                  const status = getVisitorStatus(v)
                  const sc     = STATUS_CONFIG[status]
                  const initials = `${v.name?.[0]||'?'}${v.surname?.[0]||''}`
                  const daysAgo  = v.last_visit_at
                    ? Math.floor((Date.now() - new Date(v.last_visit_at)) / (1000*60*60*24))
                    : null
                  const services = v.preferred_services || []
                  const isLogging = logVisitFor === v.id

                  return (
                    <div key={v.id} style={{ background:'white', border:`1px solid ${status==='fading'?'#FCD34D':status==='inactive'?'#FCA5A5':'#E5E7EB'}`, borderRadius:'12px', overflow:'hidden' }}>
                      <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:'14px' }}>

                        {/* Rank */}
                        <div style={{ fontSize:'13px', fontWeight:'700', color:'#9CA3AF', width:'22px', textAlign:'center', flexShrink:0 }}>
                          {idx + 1}
                        </div>

                        {/* Avatar */}
                        <div style={{ width:'42px', height:'42px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                          {initials}
                        </div>

                        {/* Info */}
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px' }}>
                            <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827' }}>{v.name} {v.surname}</div>
                            <div style={{ fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'20px', background:sc.bg, color:sc.color }}>
                              {sc.label}
                            </div>
                            {v.guest_type === 'event' && (
                              <div style={{ fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'20px', background:'#EDE9FE', color:'#5B21B6' }}>Event</div>
                            )}
                          </div>
                          <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'5px' }}>{v.phone}</div>
                          <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                            {services.map(svc => {
                              const cfg = getServiceConfig(svc)
                              return (
                                <div key={svc} style={{ fontSize:'11px', fontWeight:'500', padding:'2px 8px', borderRadius:'20px', background:cfg.bg, color:cfg.color }}>
                                  {cfg.icon} {svc}
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Stats */}
                        <div style={{ display:'flex', gap:'20px', alignItems:'center', flexShrink:0 }}>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:'22px', fontWeight:'700', color:'#C9A84C', lineHeight:1 }}>{v.visit_count_day || 0}</div>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'2px' }}>visits</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:'14px', fontWeight:'600', color:daysAgo === null ? '#9CA3AF' : daysAgo <= 7 ? '#16A34A' : daysAgo <= 21 ? '#2563EB' : '#DC2626', lineHeight:1 }}>
                              {daysAgo === null ? '—' : daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                            </div>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'2px' }}>last visit</div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                          <button onClick={() => setLogVisitFor(isLogging ? null : v.id)}
                            style={{ padding:'7px 14px', background:isLogging?'#1C3D2E':'white', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:isLogging?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                            {isLogging ? 'Cancel' : '+ Log visit'}
                          </button>
                        </div>
                      </div>

                      {/* Log visit panel */}
                      {isLogging && (
                        <div style={{ padding:'12px 16px', borderTop:'1px solid #F3F4F6', background:'#F9FAFB', display:'flex', alignItems:'center', gap:'12px' }}>
                          <div style={{ fontSize:'13px', fontWeight:'500', color:'#374151' }}>Service used today:</div>
                          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', flex:1 }}>
                            {Object.entries(SERVICE_COLORS).filter(([k])=>k!=='other').map(([key, cfg]) => (
                              <button key={key} onClick={() => setLogService(key)}
                                style={{ padding:'5px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'600', border:`1px solid ${logService===key?cfg.color:'#D1D5DB'}`, background:logService===key?cfg.bg:'white', color:logService===key?cfg.color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                {cfg.icon} {key}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => handleLogVisit(v.id)}
                            style={{ padding:'8px 18px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                            Save visit
                          </button>
                        </div>
                      )}

                      {/* Staff notes */}
                      {v.notes && (
                        <div style={{ padding:'8px 16px 12px', borderTop:'1px solid #F9FAFB' }}>
                          <div style={{ fontSize:'11px', color:'#9CA3AF', marginBottom:'2px' }}>Staff notes</div>
                          <div style={{ fontSize:'12px', color:'#374151', fontStyle:'italic' }}>{v.notes}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
