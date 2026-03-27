// components/MobileGuestsTab.js
// Mobile wrapper for GuestsTab that adds 2 subtabs:
//   "History"  — conversation + booking timeline  (existing left panel)
//   "Summary"  — KPIs + stays + preferences       (existing right panel)
// Also renders the guest header + search-empty state.

'use client'
import { useState, useEffect } from 'react'

const LANGUAGES = {
  en:{name:'English',bg:'#DCFCE7',color:'#14532D'}, ru:{name:'Russian',bg:'#DBEAFE',color:'#1E3A5F'},
  he:{name:'Hebrew',bg:'#FEF3C7',color:'#78350F'},  de:{name:'German',bg:'#F3F4F6',color:'#1F2937'},
  fr:{name:'French',bg:'#EDE9FE',color:'#4C1D95'},  zh:{name:'Chinese',bg:'#FEF2F2',color:'#7F1D1D'},
  pl:{name:'Polish',bg:'#FFF1F2',color:'#881337'},  sv:{name:'Swedish',bg:'#EFF6FF',color:'#1E3A8A'},
  fi:{name:'Finnish',bg:'#F0F9FF',color:'#0C4A6E'}, uk:{name:'Ukrainian',bg:'#FEFCE8',color:'#713F12'},
  ar:{name:'Arabic',bg:'#F0FDF4',color:'#14532D'},  nl:{name:'Dutch',bg:'#FFF7ED',color:'#7C2D12'},
  el:{name:'Greek',bg:'#EFF6FF',color:'#1E3A8A'},   es:{name:'Spanish',bg:'#FFF7ED',color:'#9A3412'},
  ca:{name:'Catalan',bg:'#FEF9C3',color:'#713F12'}, it:{name:'Italian',bg:'#F0FDF4',color:'#14532D'},
  pt:{name:'Portuguese',bg:'#ECFDF5',color:'#064E3B'},
}
const GUEST_TYPES = {
  stay:        {label:'Stay guest',  bg:'#DCFCE7',color:'#14532D',icon:'🛏️'},
  day_visitor: {label:'Day visitor', bg:'#FEF3C7',color:'#78350F',icon:'☀️'},
  event:       {label:'Event guest', bg:'#EDE9FE',color:'#4C1D95',icon:'🎭'},
  prospect:    {label:'Prospect',    bg:'#F1F5F9',color:'#334155',icon:'🔍'},
}
const SERVICE_ICONS = { tennis:'🎾',spa:'💆',restaurant:'🍽️',conference:'🤝',pool:'🏊',golf:'⛳',other:'✨' }
const TYPE_COLORS   = {
  taxi:{bg:'#DCFCE7',color:'#14532D',l:'T'},restaurant:{bg:'#DBEAFE',color:'#1E3A5F',l:'R'},
  activity:{bg:'#FEF3C7',color:'#78350F',l:'B'},late_checkout:{bg:'#FAF5FF',color:'#581C87',l:'L'},
  housekeeping:{bg:'#F1F5F9',color:'#334155',l:'HK'},maintenance:{bg:'#F1F5F9',color:'#334155',l:'MT'},
}

function getLang(c) { return LANGUAGES[c] || LANGUAGES.en }
function getType(t) { return GUEST_TYPES[t] || GUEST_TYPES.stay }
function isVIP(g)   { return (g.visit_count_day||0) >= 10 || (g.visit_count||1) >= 3 }

function Badge({ label, bg, color, icon }) {
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'12px',fontWeight:'600',padding:'4px 10px',borderRadius:'20px',background:bg,color}}>
      {icon && <span>{icon}</span>}{label}
    </span>
  )
}

export default function MobileGuestsTab({ hotelId, selectedGuest }) {
  const [profile,       setProfile]       = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [notes,         setNotes]         = useState('')
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [guestRooms,    setGuestRooms]    = useState([])
  const [previousStays, setPreviousStays] = useState([])
  const [subtab,        setSubtab]        = useState('history')

  useEffect(() => {
    if (selectedGuest?.id) { setSubtab('history'); loadProfile(selectedGuest.id) }
  }, [selectedGuest])

  async function loadProfile(id) {
    setLoading(true)
    try {
      const [pr, rr] = await Promise.all([fetch(`/api/guests/${id}`), fetch(`/api/checkin?guestId=${id}`)])
      const [pd, rd] = await Promise.all([pr.json(), rr.json()])
      setProfile(pd); setNotes(pd.guest?.notes||''); setGuestRooms(rd.rooms||[])
      try { const sr = await fetch(`/api/guests/${id}/stays`); const sd = await sr.json(); setPreviousStays(sd.stays||[]) }
      catch { setPreviousStays([]) }
    } finally { setLoading(false) }
  }

  async function saveNotes() {
    if (!profile?.guest?.id) return
    setSaving(true)
    try {
      await fetch(`/api/guests/${profile.guest.id}/notes`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({notes}) })
      setSaved(true); setTimeout(()=>setSaved(false),2000)
    } finally { setSaving(false) }
  }

  if (!selectedGuest && !profile) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:'12px',fontFamily:"'DM Sans',sans-serif",padding:'32px'}}>
        <div style={{fontSize:'40px',opacity:0.15}}>○</div>
        <div style={{fontSize:'15px',fontWeight:'600',color:'#374151',textAlign:'center'}}>Search for a guest to view their profile</div>
        <div style={{fontSize:'13px',color:'#9CA3AF',textAlign:'center'}}>Use the 🔍 search icon in the top bar</div>
      </div>
    )
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#6B7280',fontFamily:"'DM Sans',sans-serif",fontSize:'14px'}}>
      Loading profile…
    </div>
  )

  if (!profile?.guest) return null

  const { guest, conversations=[], bookings=[] } = profile
  const initials   = `${guest.name?.[0]||'?'}${guest.surname?.[0]||''}`
  const lang       = getLang(guest.language)
  const type       = getType(guest.guest_type)
  const vip        = isVIP(guest)
  const isDayVisit = ['day_visitor','event'].includes(guest.guest_type)
  const isReturning= (guest.visit_count||1) > 1 || (guest.visit_count_day||0) > 0

  // Build message timeline
  const allMessages = []
  ;(conversations||[]).forEach(c => (c?.messages||[]).forEach(m => { if(m?.ts) allMessages.push({...m,convId:c.id}) }))
  allMessages.sort((a,b) => { try{return new Date(a.ts)-new Date(b.ts)}catch{return 0} })

  const grouped = {}
  allMessages.forEach(m => {
    try {
      const d = new Date(m.ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
      if (!grouped[d]) grouped[d] = []; grouped[d].push(m)
    } catch {}
  })
  ;(bookings||[]).forEach(b => {
    try {
      if (!b?.created_at) return
      const d = new Date(b.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
      if (!grouped[d]) grouped[d] = []; grouped[d].push({...b,_isBooking:true,ts:b.created_at})
    } catch {}
  })
  Object.keys(grouped).forEach(d => { try{grouped[d].sort((a,b)=>new Date(a.ts)-new Date(b.ts))}catch{} })

  const isCheckInDate = d => { try{ return guest?.check_in && new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) === d }catch{return false} }

  const TABS = [
    { key:'history', label: isDayVisit ? 'Guest'            : 'Guest' },
    { key:'summary', label: isDayVisit ? 'Guest Summary'    : 'Guest Summary'         },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',fontFamily:"'DM Sans',sans-serif"}}>

      {/* ── GUEST HEADER (compact for mobile) ── */}
      <div style={{background:'white',borderBottom:'1px solid #E5E7EB',padding:'14px 16px',display:'flex',gap:'12px',alignItems:'flex-start',flexShrink:0}}>
        <div style={{position:'relative',flexShrink:0}}>
          <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'#1C3D2E',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',color:'#C9A84C',fontWeight:'700'}}>{initials}</div>
          {isReturning && (
            <div style={{position:'absolute',bottom:'-2px',right:'-2px',width:'18px',height:'18px',borderRadius:'50%',background:'#C9A84C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',fontWeight:'700',color:'#1C3D2E',border:'2px solid white'}}>
              {guest.visit_count_day||guest.visit_count||1}
            </div>
          )}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'2px'}}>
            <span style={{fontSize:'17px',fontWeight:'700',color:'#111827'}}>{guest.name} {guest.surname}</span>
            {vip && <span style={{fontSize:'11px',fontWeight:'700',padding:'2px 8px',borderRadius:'20px',background:'rgba(201,168,76,0.15)',color:'#78350F',border:'1px solid rgba(201,168,76,0.3)'}}>⭐ VIP</span>}
          </div>
          <div style={{fontSize:'12px',color:'#6B7280',marginBottom:'8px'}}>{guest.phone}</div>
          <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
            <Badge label={lang.name} bg={lang.bg} color={lang.color} />
            <Badge label={type.label} bg={type.bg} color={type.color} icon={type.icon} />
            {!isDayVisit && (guest.room || guestRooms.length > 0) && (
              <Badge label={guestRooms.length>0 ? guestRooms.map(r=>`Rm ${r.room}`).join(' & ') : `Room ${guest.room}`} bg='#F3F4F6' color='#374151' />
            )}
            {!isDayVisit && guest.check_in  && <Badge label={`In: ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}  bg='#DCFCE7' color='#14532D' />}
            {!isDayVisit && guest.check_out && <Badge label={`Out: ${new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`} bg='#DBEAFE' color='#1E3A5F' />}
            {isDayVisit && (guest.visit_count_day||0)>0 && <Badge label={`${guest.visit_count_day} visits`} bg='rgba(201,168,76,0.1)' color='#78350F' />}
          </div>
        </div>
      </div>

      {/* ── SUBTABS ── */}
      <div style={{display:'flex',background:'white',borderBottom:'1px solid #E5E7EB',flexShrink:0}}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setSubtab(t.key)}
            style={{flex:1,padding:'11px 12px',fontSize:'13px',fontWeight:subtab===t.key?'700':'500',color:subtab===t.key?'#1C3D2E':'#9CA3AF',background:'none',border:'none',borderBottom:subtab===t.key?'2px solid #C9A84C':'2px solid transparent',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── HISTORY TAB ── */}
      {subtab === 'history' && (
        <div style={{flex:1,overflowY:'auto',padding:'14px 16px',background:'#F9FAFB',display:'flex',flexDirection:'column',gap:'0'}}>
          <div style={{fontSize:'12px',color:'#9CA3AF',marginBottom:'12px'}}>
            {allMessages.length} messages · {bookings.length} bookings
          </div>
          {Object.keys(grouped).length === 0 && (
            <div style={{textAlign:'center',color:'#9CA3AF',fontSize:'13px',padding:'40px 0'}}>
              {isDayVisit ? "No conversations yet" : "No conversation history yet"}
            </div>
          )}
          {Object.keys(grouped).map(date => (
            <div key={date} style={{marginBottom:'20px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                <span style={{fontSize:'12px',fontWeight:isCheckInDate(date)?'700':'600',color:isCheckInDate(date)?'#C9A84C':'#6B7280'}}>
                  {isCheckInDate(date)?`✓ Check-in · ${date}`:date}
                </span>
                <div style={{flex:1,height:'1px',background:'#E5E7EB'}}/>
              </div>
              {grouped[date].map((item, idx) => {
                if (item._isBooking) {
                  const tc = TYPE_COLORS[item.type] || {bg:'#F1F5F9',color:'#334155',l:'?'}
                  const done = ['confirmed','resolved','completed'].includes(item.status)
                  return (
                    <div key={`b-${item.id}-${idx}`} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',marginBottom:'8px',background:'white',borderRadius:'10px',borderLeft:`3px solid ${done?'#D1D5DB':'#1C3D2E'}`,opacity:done?0.7:1}}>
                      <div style={{width:'26px',height:'26px',borderRadius:'5px',background:tc.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:'700',color:tc.color,flexShrink:0}}>{tc.l}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'13px',fontWeight:'600',color:'#111827'}}>{item.partners?.name||item.type}</div>
                        <div style={{fontSize:'11px',color:'#9CA3AF'}}>{(()=>{try{return new Date(item.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}catch{return ''}})()}</div>
                      </div>
                      <div style={{fontSize:'12px',fontWeight:'600',color:done?'#9CA3AF':'#C9A84C'}}>{done?'Done':item.status}</div>
                    </div>
                  )
                }
                const isOut = item.role === 'user'
                return (
                  <div key={`m-${idx}`} style={{display:'flex',gap:'8px',marginBottom:'8px',flexDirection:isOut?'row-reverse':'row',alignItems:'flex-end'}}>
                    <div style={{maxWidth:'80%',padding:'10px 13px',borderRadius:isOut?'14px 4px 14px 14px':'4px 14px 14px 14px',background:isOut?'#1C3D2E':'white',color:isOut?'white':'#111827',fontSize:'13px',lineHeight:'1.55',border:isOut?'none':'1px solid #E5E7EB'}}>
                      {item.content}
                      {item.sent_by && item.sent_by !== 'scheduled' && <div style={{fontSize:'10px',opacity:0.5,marginTop:'3px'}}>— {item.sent_by}</div>}
                    </div>
                    <div style={{fontSize:'10px',color:'#9CA3AF',paddingBottom:'3px',flexShrink:0}}>
                      {(()=>{try{return new Date(item.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}catch{return ''}})()}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── SUMMARY TAB ── */}
      {subtab === 'summary' && (
        <div style={{flex:1,overflowY:'auto',background:'white',padding:'16px',display:'flex',flexDirection:'column',gap:'16px'}}>

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
            {(isDayVisit ? [
              {label:'Total visits',  value:guest.visit_count_day||0, gold:true},
              {label:'Bookings made', value:bookings.length},
            ] : [
              {label:'Messages',  value:allMessages.length},
              {label:'Bookings',  value:bookings.length},
              ...(isReturning?[{label:'Total stays',value:guest.visit_count||1,gold:true},{label:'All bookings',value:guest.total_bookings||bookings.length}]:[])
            ]).map(s => (
              <div key={s.label} style={{background:s.gold?'rgba(201,168,76,0.08)':'#F9FAFB',borderRadius:'12px',padding:'12px 14px',border:s.gold?'1px solid rgba(201,168,76,0.2)':'none'}}>
                <div style={{fontSize:'12px',color:s.gold?'#78350F':'#6B7280',fontWeight:'500',marginBottom:'4px'}}>{s.label}</div>
                <div style={{fontSize:'26px',fontWeight:'700',color:s.gold?'#C9A84C':'#111827'}}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Favourite services — day visitors */}
          {isDayVisit && (guest.preferred_services||[]).length > 0 && (
            <div>
              <div style={{fontSize:'13px',fontWeight:'700',color:'#111827',marginBottom:'8px'}}>Favourite services</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {(guest.preferred_services||[]).map(svc => (
                  <div key={svc} style={{fontSize:'13px',fontWeight:'500',padding:'5px 12px',borderRadius:'20px',background:'rgba(201,168,76,0.1)',color:'#78350F',border:'1px solid rgba(201,168,76,0.2)'}}>
                    {SERVICE_ICONS[svc]||'✨'} {svc}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Previous stays */}
          {!isDayVisit && previousStays.length > 0 && (
            <div>
              <div style={{fontSize:'13px',fontWeight:'700',color:'#111827',marginBottom:'8px'}}>Previous stays</div>
              <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                {previousStays.map((stay,i) => (
                  <div key={stay.id||i} style={{padding:'10px 12px',background:'#F9FAFB',borderRadius:'10px',borderLeft:'3px solid #C9A84C'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2px'}}>
                      <span style={{fontSize:'13px',fontWeight:'600',color:'#374151'}}>
                        {stay.check_in ? new Date(stay.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Unknown'}
                      </span>
                      {stay.rating && <span style={{fontSize:'12px'}}>{'⭐'.repeat(stay.rating)}</span>}
                    </div>
                    {stay.room && <div style={{fontSize:'12px',color:'#9CA3AF'}}>Room {stay.room}</div>}
                    {(stay.services_used||[]).length > 0 && (
                      <div style={{fontSize:'11px',color:'#9CA3AF',marginTop:'3px'}}>{stay.services_used.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{fontSize:'13px',fontWeight:'700',color:'#111827',marginBottom:'8px'}}>Staff notes</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
              placeholder="Add internal notes about this guest…"
              style={{width:'100%',padding:'12px',border:'1px solid #E5E7EB',borderRadius:'10px',fontSize:'13px',color:'#111827',resize:'none',fontFamily:"'DM Sans',sans-serif",outline:'none',lineHeight:'1.5'}}
            />
            <button onClick={saveNotes} disabled={saving}
              style={{marginTop:'8px',width:'100%',padding:'11px',background:saved?'#16A34A':'#1C3D2E',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',color:'white',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
              {saved?'✓ Saved':saving?'Saving…':'Save notes'}
            </button>
          </div>

          <div style={{height:'20px'}}/>
        </div>
      )}
    </div>
  )
}
