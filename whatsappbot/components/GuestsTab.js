// components/GuestsTab.js (ux-fixes: full language names, type badges, VIP, day visitor layout)
'use client'
import { useState, useEffect } from 'react'

// ── LANGUAGE CONFIG ───────────────────────────────────────────
const LANGUAGES = {
  en: { name:'English',    bg:'#DCFCE7', color:'#14532D' },
  ru: { name:'Russian',    bg:'#DBEAFE', color:'#1E3A5F' },
  he: { name:'Hebrew',     bg:'#FEF3C7', color:'#78350F' },
  de: { name:'German',     bg:'#F3F4F6', color:'#1F2937' },
  fr: { name:'French',     bg:'#EDE9FE', color:'#4C1D95' },
  zh: { name:'Chinese',    bg:'#FEF2F2', color:'#7F1D1D' },
  pl: { name:'Polish',     bg:'#FFF1F2', color:'#881337' },
  sv: { name:'Swedish',    bg:'#EFF6FF', color:'#1E3A8A' },
  fi: { name:'Finnish',    bg:'#F0F9FF', color:'#0C4A6E' },
  uk: { name:'Ukrainian',  bg:'#FEFCE8', color:'#713F12' },
  ar: { name:'Arabic',     bg:'#F0FDF4', color:'#14532D' },
  nl: { name:'Dutch',      bg:'#FFF7ED', color:'#7C2D12' },
  el: { name:'Greek',      bg:'#EFF6FF', color:'#1E3A8A' },
  es: { name:'Spanish',    bg:'#FFF7ED', color:'#9A3412' },
  ca: { name:'Catalan',    bg:'#FEF9C3', color:'#713F12' },
  it: { name:'Italian',    bg:'#F0FDF4', color:'#14532D' },
  pt: { name:'Portuguese', bg:'#ECFDF5', color:'#064E3B' },
}

// ── GUEST TYPE CONFIG ─────────────────────────────────────────
const GUEST_TYPES = {
  stay:        { label:'Stay guest',   bg:'#DCFCE7', color:'#14532D', icon:'🛏️' },
  day_visitor: { label:'Day visitor',  bg:'#FEF3C7', color:'#78350F', icon:'☀️' },
  event:       { label:'Event guest',  bg:'#EDE9FE', color:'#4C1D95', icon:'🎭' },
  prospect:    { label:'Prospect',     bg:'#F1F5F9', color:'#334155', icon:'🔍' },
}

const SERVICE_ICONS = {
  tennis:'🎾', spa:'💆', restaurant:'🍽️',
  conference:'🤝', pool:'🏊', golf:'⛳', other:'✨',
}

function getLang(code) { return LANGUAGES[code] || LANGUAGES.en }
function getType(type) { return GUEST_TYPES[type] || GUEST_TYPES.stay }
function isVIP(guest)  { return (guest.visit_count_day || 0) >= 10 || (guest.visit_count || 1) >= 3 }

export default function GuestsTab({ hotelId, selectedGuest }) {
  const [profile, setProfile]             = useState(null)
  const [loading, setLoading]             = useState(false)
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [guestRooms, setGuestRooms]       = useState([])
  const [previousStays, setPreviousStays] = useState([])
  const [showCheckin, setShowCheckin]     = useState(false)

  useEffect(() => {
    if (selectedGuest?.id) loadProfile(selectedGuest.id)
  }, [selectedGuest])

  async function loadProfile(guestId) {
    setLoading(true)
    try {
      const [profileRes, roomsRes] = await Promise.all([
        fetch(`/api/guests/${guestId}`),
        fetch(`/api/checkin?guestId=${guestId}`),
      ])
      const [profileData, roomsData] = await Promise.all([
        profileRes.json(), roomsRes.json()
      ])
      setProfile(profileData)
      setNotes(profileData.guest?.notes || '')
      setGuestRooms(roomsData.rooms || [])

      // Stays — only fetch if the endpoint exists (requires memory.sql to be run)
      try {
        const staysRes  = await fetch(`/api/guests/${guestId}/stays`)
        const staysData = await staysRes.json()
        setPreviousStays(staysData.stays || [])
      } catch { setPreviousStays([]) }

    } catch (err) {
      console.error('loadProfile error:', err)
    } finally { setLoading(false) }
  }

  async function handleSaveNotes() {
    if (!profile?.guest?.id) return
    setSaving(true)
    try {
      await fetch(`/api/guests/${profile.guest.id}/notes`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ notes }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  if (!selectedGuest && !profile) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'14px', fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontSize:'48px', opacity:0.15 }}>○</div>
        <div style={{ fontSize:'16px', fontWeight:'600', color:'#374151' }}>Search for a guest to view their profile</div>
        <div style={{ fontSize:'14px', color:'#9CA3AF' }}>Use the search bar at the top — stays, day visitors and prospects all appear</div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", fontSize:'14px' }}>
      Loading profile...
    </div>
  )

  if (!profile || !profile.guest) return null

  const { guest, conversations = [], bookings = [] } = profile || {}
  const initials   = `${guest.name?.[0]||'?'}${guest.surname?.[0]||''}`
  const lang       = getLang(guest.language)
  const type       = getType(guest.guest_type)
  const vip        = isVIP(guest)
  const isDayVisit = guest.guest_type === 'day_visitor' || guest.guest_type === 'event'
  const isReturning= (guest.visit_count || 1) > 1 || (guest.visit_count_day || 0) > 0

  // Build timeline
  const allMessages = conversations.flatMap(conv =>
    (conv.messages||[]).map(m => ({ ...m, convId: conv.id }))
  ).sort((a,b) => new Date(a.ts) - new Date(b.ts))

  const grouped = {}
  allMessages.forEach(m => {
    const date = new Date(m.ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(m)
  })
  bookings.forEach(b => {
    const date = new Date(b.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
    if (!grouped[date]) grouped[date] = []
    grouped[date].push({ ...b, _isBooking:true, ts:b.created_at })
  })
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a,b) => new Date(a.ts)-new Date(b.ts))
  })

  const TYPE_COLORS = {
    taxi:          {bg:'#DCFCE7',color:'#14532D',label:'T'},
    restaurant:    {bg:'#DBEAFE',color:'#1E3A5F',label:'R'},
    activity:      {bg:'#FEF3C7',color:'#78350F',label:'B'},
    late_checkout: {bg:'#FAF5FF',color:'#581C87',label:'L'},
    housekeeping:  {bg:'#F1F5F9',color:'#334155',label:'HK'},
    maintenance:   {bg:'#F1F5F9',color:'#334155',label:'MT'},
  }

  const isCheckinDate = (dateStr) => {
    if (!guest.check_in) return false
    return new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) === dateStr
  }

  // Badge component
  const Badge = ({ label, bg, color, icon }) => (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:'600', padding:'4px 10px', borderRadius:'20px', background:bg, color }}>
      {icon && <span style={{ fontSize:'12px' }}>{icon}</span>}
      {label}
    </span>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontFamily:"'DM Sans',sans-serif" }}>

      {/* ── GUEST HEADER ── */}
      <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'18px 22px', display:'flex', alignItems:'flex-start', gap:'16px', flexShrink:0 }}>

        {/* Avatar with visit count badge */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{ width:'52px', height:'52px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', color:'#C9A84C', fontWeight:'700' }}>
            {initials}
          </div>
          {isReturning && (
            <div style={{ position:'absolute', bottom:'-2px', right:'-2px', width:'20px', height:'20px', borderRadius:'50%', background:'#C9A84C', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#1C3D2E', border:'2px solid white' }}>
              {guest.visit_count_day || guest.visit_count || 1}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex:1 }}>
          {/* Name row */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px', flexWrap:'wrap' }}>
            <div style={{ fontSize:'20px', fontWeight:'700', color:'#111827' }}>
              {guest.name} {guest.surname}
            </div>
            {vip && (
              <span style={{ fontSize:'12px', fontWeight:'700', padding:'3px 10px', borderRadius:'20px', background:'rgba(201,168,76,0.15)', color:'#78350F', border:'1px solid rgba(201,168,76,0.4)' }}>
                ⭐ VIP
              </span>
            )}
          </div>

          {/* Phone */}
          <div style={{ fontSize:'14px', color:'#6B7280', marginBottom:'10px' }}>
            {guest.phone}{guest.email ? ` · ${guest.email}` : ''}
          </div>

          {/* Labels row */}
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>

            {/* Language — full name */}
            <Badge label={lang.name} bg={lang.bg} color={lang.color} />

            {/* Guest type */}
            <Badge label={type.label} bg={type.bg} color={type.color} icon={type.icon} />

            {/* Stay guest specific */}
            {!isDayVisit && (
              <>
                {(guestRooms.length > 0 || guest.room) && (
                  <Badge
                    label={guestRooms.length > 0 ? guestRooms.map(r=>`Room ${r.room}`).join(' & ') : `Room ${guest.room}`}
                    bg='#F3F4F6' color='#374151'
                  />
                )}
                {guest.check_in && (
                  <Badge label={`In: ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`} bg='#DCFCE7' color='#14532D' />
                )}
                {guest.check_out && (
                  <Badge label={`Out: ${new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`} bg='#DBEAFE' color='#1E3A5F' />
                )}
                {guest.welcome_sent_at && (
                  <span style={{ fontSize:'12px', color:'#9CA3AF' }}>Welcome sent ✓</span>
                )}
              </>
            )}

            {/* Day visitor specific */}
            {isDayVisit && (
              <>
                {(guest.visit_count_day || 0) > 0 && (
                  <Badge label={`${guest.visit_count_day} visits`} bg='rgba(201,168,76,0.1)' color='#78350F' />
                )}
                {guest.last_visit_at && (
                  <Badge
                    label={`Last: ${new Date(guest.last_visit_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                    bg='#F3F4F6' color='#374151'
                  />
                )}
                {(guest.preferred_services || []).map(svc => (
                  <Badge key={svc} label={svc} bg='#F9FAFB' color='#374151' icon={SERVICE_ICONS[svc] || '✨'} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Action button */}
        {!isDayVisit && (
          <button onClick={() => setShowCheckin(!showCheckin)}
            style={{ padding:'10px 20px', background:showCheckin?'#1C3D2E':'white', border:'1px solid #D1D5DB', borderRadius:'10px', fontSize:'14px', fontWeight:'600', color:showCheckin?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
            {showCheckin ? '✕ Close' : '+ Check-in / Rooms'}
          </button>
        )}
      </div>

      {/* Check-in panel */}
      {showCheckin && !isDayVisit && (
        <CheckinPanel
          guest={guest}
          guestRooms={guestRooms}
          hotelId={hotelId}
          onSave={() => { loadProfile(guest.id); setShowCheckin(false) }}
        />
      )}

      {/* Body */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', flex:1, overflow:'hidden' }}>

        {/* Timeline */}
        <div style={{ borderRight:'1px solid #E5E7EB', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 18px', fontSize:'14px', fontWeight:'700', color:'#111827', borderBottom:'1px solid #E5E7EB', background:'white', flexShrink:0, display:'flex', alignItems:'center', gap:'8px' }}>
            {isDayVisit ? 'Visit & conversation history' : 'Full conversation history'}
            <span style={{ fontSize:'13px', color:'#9CA3AF', fontWeight:'400' }}>
              {allMessages.length} messages · {bookings.length} bookings
            </span>
          </div>
          <div className="scrollable" style={{ padding:'16px 18px', background:'#F9FAFB' }}>
            {Object.keys(grouped).length === 0 && (
              <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:'14px', padding:'40px' }}>
                {isDayVisit ? 'No conversations yet — they haven\'t messaged the bot' : 'No conversation history yet'}
              </div>
            )}
            {Object.keys(grouped).map(date => (
              <div key={date} style={{ marginBottom:'20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                  <div style={{ fontSize:'13px', fontWeight:isCheckinDate(date)?'700':'600', color:isCheckinDate(date)?'#C9A84C':'#6B7280' }}>
                    {isCheckinDate(date) ? `✓ Check-in · ${date}` : date}
                  </div>
                  <div style={{ flex:1, height:'1px', background:'#E5E7EB' }}/>
                </div>
                {grouped[date].map((item, idx) => {
                  if (item._isBooking) {
                    const tc = TYPE_COLORS[item.type] || {bg:'#F1F5F9',color:'#334155',label:'?'}
                    const isDone = ['confirmed','resolved','completed'].includes(item.status)
                    return (
                      <div key={`b-${item.id}-${idx}`} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'10px', background:'white', borderRadius:'10px', borderLeft:`3px solid ${isDone?'#D1D5DB':'#1C3D2E'}`, opacity:isDone?0.7:1 }}>
                        <div style={{ width:'26px', height:'26px', borderRadius:'5px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:tc.color, flexShrink:0 }}>{tc.label}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{item.partners?.name||item.type}</div>
                          <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{new Date(item.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:isDone?'#9CA3AF':'#C9A84C' }}>{isDone?'Done':item.status}</div>
                      </div>
                    )
                  }
                  const isOut = item.role === 'user'
                  return (
                    <div key={`m-${idx}`} style={{ display:'flex', gap:'10px', marginBottom:'8px', flexDirection:isOut?'row-reverse':'row', alignItems:'flex-end' }}>
                      <div style={{ maxWidth:'68%', padding:'10px 14px', borderRadius:isOut?'14px 4px 14px 14px':'4px 14px 14px 14px', background:isOut?'#1C3D2E':'white', color:isOut?'white':'#111827', fontSize:'13px', lineHeight:'1.6', border:isOut?'none':'1px solid #E5E7EB' }}>
                        {item.content}
                        {item.sent_by && item.sent_by !== 'scheduled' && <div style={{ fontSize:'11px', opacity:0.6, marginTop:'3px' }}>— {item.sent_by}</div>}
                        {item.sent_by === 'scheduled' && <div style={{ fontSize:'10px', opacity:0.5, marginTop:'3px' }}>📅 scheduled</div>}
                      </div>
                      <div style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0, paddingBottom:'3px' }}>
                        {new Date(item.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Summary panel */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden', background:'white' }}>
          <div style={{ padding:'12px 18px', fontSize:'14px', fontWeight:'700', color:'#111827', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
            {isDayVisit ? 'Visitor summary' : 'Stay summary'}
          </div>
          <div className="scrollable" style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'16px' }}>

            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {isDayVisit ? [
                { label:'Total visits', value: guest.visit_count_day || 0, gold: true },
                { label:'Bookings made', value: bookings.length },
              ] : [
                { label:'Messages', value: allMessages.length },
                { label:'Bookings', value: bookings.length },
                ...(isReturning ? [
                  { label:'Total visits', value: guest.visit_count || 1, gold: true },
                  { label:'All bookings', value: guest.total_bookings || bookings.length },
                ] : [])
              ].map(s => (
                <div key={s.label} style={{ background:s.gold?'rgba(201,168,76,0.08)':'#F9FAFB', borderRadius:'10px', padding:'12px 14px', border:s.gold?'1px solid rgba(201,168,76,0.2)':'none' }}>
                  <div style={{ fontSize:'12px', color:s.gold?'#78350F':'#6B7280', fontWeight:'500', marginBottom:'4px' }}>{s.label}</div>
                  <div style={{ fontSize:'24px', fontWeight:'700', color:s.gold?'#C9A84C':'#111827' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Favourite services — day visitors */}
            {isDayVisit && (guest.preferred_services||[]).length > 0 && (
              <div>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>Favourite services</div>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  {(guest.preferred_services||[]).map(svc => (
                    <div key={svc} style={{ fontSize:'13px', fontWeight:'500', padding:'5px 12px', borderRadius:'20px', background:'rgba(201,168,76,0.1)', color:'#78350F', border:'1px solid rgba(201,168,76,0.2)' }}>
                      {SERVICE_ICONS[svc]||'✨'} {svc}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Previous stays — stay guests */}
            {!isDayVisit && previousStays.length > 0 && (
              <div>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>Previous stays</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {previousStays.map((stay, idx) => (
                    <div key={stay.id||idx} style={{ padding:'10px 12px', background:'#F9FAFB', borderRadius:'10px', borderLeft:'3px solid #C9A84C' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2px' }}>
                        <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>
                          {stay.check_in ? new Date(stay.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Unknown'}
                        </div>
                        {stay.rating && <div style={{ fontSize:'13px' }}>{'⭐'.repeat(stay.rating)}</div>}
                      </div>
                      <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
                        {stay.room && `Room ${stay.room}`}
                        {stay.check_in && stay.check_out && ` · ${Math.round((new Date(stay.check_out)-new Date(stay.check_in))/(1000*60*60*24))} nights`}
                        {stay.bookings_made > 0 && ` · ${stay.bookings_made} bookings`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bookings */}
            {bookings.length > 0 && (
              <div>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>
                  {isDayVisit ? 'All bookings' : 'This stay — bookings'}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                  {bookings.map(b => {
                    const tc = TYPE_COLORS[b.type]||{bg:'#F1F5F9',color:'#334155',label:'?'}
                    const isDone = ['confirmed','resolved','completed'].includes(b.status)
                    return (
                      <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', background:'#F9FAFB', borderRadius:'8px' }}>
                        <div style={{ width:'22px', height:'22px', borderRadius:'5px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:tc.color, flexShrink:0 }}>{tc.label}</div>
                        <div style={{ flex:1, fontSize:'13px', color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {b.partners?.name||b.type} · {new Date(b.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                        </div>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:isDone?'#9CA3AF':'#C9A84C', flexShrink:0 }}>{isDone?'Done':'upcoming'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Staff notes */}
            <div>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>Staff notes</div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder={isDayVisit ? "Preferences, usual booking time, special requests..." : "Preferences, allergies, special requests..."}
                style={{ width:'100%', height:'72px', padding:'10px 12px', background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:'10px', fontSize:'13px', color:'#111827', resize:'none', fontFamily:"'DM Sans',sans-serif", outline:'none' }}
              />
              <button onClick={handleSaveNotes} disabled={saving}
                style={{ width:'100%', padding:'9px', marginTop:'7px', background:saved?'#16A34A':'#F3F4F6', border:'1px solid #E5E7EB', borderRadius:'10px', fontSize:'13px', fontWeight:'600', color:saved?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {saved?'✓ Saved':saving?'Saving...':'Save notes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CHECK-IN PANEL ────────────────────────────────────────────
function CheckinPanel({ guest, guestRooms, hotelId, onSave }) {
  const [rooms, setRooms]             = useState(
    guestRooms.length > 0
      ? guestRooms.map(r => ({ ...r }))
      : [{ room:'', room_type:'', check_in:guest.check_in||'', check_out:guest.check_out||'', primary_room:true }]
  )
  const [sendWelcome, setSendWelcome] = useState(!guest.welcome_sent_at)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  function addRoom() { setRooms(prev => [...prev, { room:'', room_type:'', check_in:rooms[0]?.check_in||'', check_out:rooms[0]?.check_out||'', primary_room:false }]) }
  function removeRoom(idx) { setRooms(prev => prev.filter((_,i) => i !== idx)) }
  function updateRoom(idx, field, value) { setRooms(prev => prev.map((r,i) => i===idx ? {...r,[field]:value} : r)) }
  function setPrimary(idx) { setRooms(prev => prev.map((r,i) => ({...r, primary_room: i===idx}))) }

  async function handleSave() {
    if (rooms.some(r => !r.room.trim())) { setError('Please fill in all room numbers'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/checkin', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ guestId:guest.id, hotelId, name:guest.name, surname:guest.surname, phone:guest.phone, language:guest.language, rooms, sendWelcome }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSave()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827', background:'white' }

  return (
    <div style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB', padding:'18px 22px', flexShrink:0 }}>
      <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827', marginBottom:'14px' }}>Rooms for this stay</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'14px' }}>
        {rooms.map((room, idx) => (
          <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:'10px', alignItems:'end', padding:'14px 16px', background:'white', borderRadius:'12px', border:'1px solid #E5E7EB' }}>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>Room number *</div>
              <input value={room.room} onChange={e=>updateRoom(idx,'room',e.target.value)} placeholder="e.g. 312" style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>Room type</div>
              <select value={room.room_type||''} onChange={e=>updateRoom(idx,'room_type',e.target.value)} style={inp}>
                <option value="">Select...</option>
                {['Single','Double','Suite','Family','Deluxe','Villa'].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>Check-in</div>
              <input type="date" value={room.check_in||''} onChange={e=>updateRoom(idx,'check_in',e.target.value)} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', marginBottom:'5px' }}>Check-out</div>
              <input type="date" value={room.check_out||''} onChange={e=>updateRoom(idx,'check_out',e.target.value)} style={inp}/>
            </div>
            <div style={{ display:'flex', gap:'6px' }}>
              <button onClick={()=>setPrimary(idx)} style={{ padding:'8px 12px', background:room.primary_room?'rgba(201,168,76,0.15)':'white', border:`1px solid ${room.primary_room?'#C9A84C':'#D1D5DB'}`, borderRadius:'8px', fontSize:'14px', cursor:'pointer', color:room.primary_room?'#78350F':'#9CA3AF', fontWeight:'700' }}>★</button>
              {rooms.length > 1 && <button onClick={()=>removeRoom(idx)} style={{ padding:'8px 12px', background:'white', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'16px', cursor:'pointer', color:'#9CA3AF' }}>×</button>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
        <button onClick={addRoom} style={{ padding:'8px 16px', background:'white', border:'1px dashed #D1D5DB', borderRadius:'8px', fontSize:'13px', fontWeight:'500', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Add another room</button>
        <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:'500', color:'#374151', cursor:'pointer' }}>
          <input type="checkbox" checked={sendWelcome} onChange={e=>setSendWelcome(e.target.checked)} style={{ width:'16px', height:'16px' }}/>
          Send welcome WhatsApp
          {guest.welcome_sent_at && <span style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'400' }}>(already sent)</span>}
        </label>
        {error && <div style={{ fontSize:'13px', color:'#DC2626', fontWeight:'500' }}>{error}</div>}
        <button onClick={handleSave} disabled={saving} style={{ marginLeft:'auto', padding:'10px 24px', background:'#1C3D2E', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:'700', color:'white', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          {saving?'Saving...':'Save rooms'}
        </button>
      </div>
      {sendWelcome && !guest.welcome_sent_at && (
        <div style={{ marginTop:'10px', fontSize:'12px', color:'#6B7280' }}>
          Welcome message will be sent to <strong>{guest.phone}</strong> immediately after saving.
        </div>
      )}
    </div>
  )
}
