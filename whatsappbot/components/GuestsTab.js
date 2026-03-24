// components/GuestsTab.js — complete with CheckinPanel
'use client'
import { useState, useEffect } from 'react'

export default function GuestsTab({ hotelId, selectedGuest }) {
  const [profile, setProfile]         = useState(null)
  const [loading, setLoading]         = useState(false)
  const [notes, setNotes]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [guestRooms, setGuestRooms]   = useState([])
  const [showCheckin, setShowCheckin] = useState(false)

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
      const [profileData, roomsData] = await Promise.all([profileRes.json(), roomsRes.json()])
      setProfile(profileData)
      setNotes(profileData.guest?.notes || '')
      setGuestRooms(roomsData.rooms || [])
    } finally { setLoading(false) }
  }

  async function handleSaveNotes() {
    if (!profile?.guest?.id) return
    setSaving(true)
    try {
      await fetch(`/api/guests/${profile.guest.id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  if (!selectedGuest && !profile) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'14px', fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontSize:'48px', opacity:0.15 }}>○</div>
        <div style={{ fontSize:'16px', fontWeight:'600', color:'#374151' }}>Search for a guest to view their profile</div>
        <div style={{ fontSize:'14px', color:'#9CA3AF' }}>Use the search bar at the top</div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", fontSize:'14px' }}>
      Loading guest profile...
    </div>
  )

  if (!profile) return null

  const { guest, conversations, bookings } = profile
  const initials = `${guest.name?.[0]||'?'}${guest.surname?.[0]||''}`

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
    grouped[date].push({ ...b, _isBooking: true, ts: b.created_at })
  })
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a,b) => new Date(a.ts) - new Date(b.ts))
  })

  const TYPE_COLORS = {
    taxi:          { bg:'#DCFCE7', color:'#14532D', label:'T' },
    restaurant:    { bg:'#DBEAFE', color:'#1E3A5F', label:'R' },
    activity:      { bg:'#FEF3C7', color:'#78350F', label:'B' },
    late_checkout: { bg:'#FAF5FF', color:'#581C87', label:'L' },
    housekeeping:  { bg:'#F1F5F9', color:'#334155', label:'HK' },
    maintenance:   { bg:'#F1F5F9', color:'#334155', label:'MT' },
  }

  const langColors = {
    en: { bg:'#DCFCE7', color:'#14532D' },
    ru: { bg:'#DBEAFE', color:'#1E3A5F' },
    he: { bg:'#FEF3C7', color:'#78350F' },
  }
  const lc = langColors[guest.language] || langColors.en

  const isCheckinDate = (dateStr) => {
    if (!guest.check_in) return false
    return new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) === dateStr
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Guest header */}
      <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'18px 22px', display:'flex', alignItems:'center', gap:'16px', flexShrink:0 }}>
        <div style={{ width:'52px', height:'52px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
          {initials}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'20px', fontWeight:'700', color:'#111827' }}>{guest.name} {guest.surname}</div>
          <div style={{ fontSize:'14px', color:'#6B7280', marginTop:'3px' }}>{guest.phone}{guest.email ? ` · ${guest.email}` : ''}</div>
          <div style={{ display:'flex', gap:'6px', marginTop:'6px', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:'700', padding:'3px 10px', borderRadius:'6px', background:lc.bg, color:lc.color }}>
              {(guest.language||'EN').toUpperCase()}
            </span>
            {guest.welcome_sent_at && (
              <span style={{ fontSize:'12px', color:'#9CA3AF' }}>Welcome sent ✓</span>
            )}
          </div>
          <div style={{ display:'flex', gap:'6px', marginTop:'5px', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:'600', padding:'3px 10px', borderRadius:'6px', background:'#F3F4F6', color:'#374151' }}>
              {guestRooms.length > 0 ? guestRooms.map(r => `Room ${r.room}`).join(' & ') : guest.room ? `Room ${guest.room}` : 'No room'}
            </span>
            {guest.check_in && (
              <span style={{ fontSize:'13px', fontWeight:'500', padding:'3px 10px', borderRadius:'6px', background:'#DCFCE7', color:'#14532D' }}>
                In: {new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
              </span>
            )}
            {guest.check_out && (
              <span style={{ fontSize:'13px', fontWeight:'500', padding:'3px 10px', borderRadius:'6px', background:'#DBEAFE', color:'#1E3A5F' }}>
                Out: {new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowCheckin(!showCheckin)}
          style={{ padding:'10px 20px', background:showCheckin?'#1C3D2E':'white', border:'1px solid #D1D5DB', borderRadius:'10px', fontSize:'14px', fontWeight:'600', color:showCheckin?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
          {showCheckin ? '✕ Close' : '+ Check-in / Rooms'}
        </button>
      </div>

      {/* Check-in panel — renders below header when open */}
      {showCheckin && (
        <CheckinPanel
          guest={guest}
          guestRooms={guestRooms}
          hotelId={hotelId}
          onSave={() => { loadProfile(guest.id); setShowCheckin(false) }}
        />
      )}

      {/* Body: timeline + summary */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', flex:1, overflow:'hidden' }}>

        {/* Timeline */}
        <div style={{ borderRight:'1px solid #E5E7EB', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 18px', fontSize:'14px', fontWeight:'700', color:'#111827', borderBottom:'1px solid #E5E7EB', background:'white', flexShrink:0, display:'flex', alignItems:'center', gap:'8px' }}>
            Full conversation history
            <span style={{ fontSize:'13px', color:'#9CA3AF', fontWeight:'400' }}>
              {allMessages.length} messages · {bookings.length} bookings
            </span>
          </div>
          <div className="scrollable" style={{ padding:'16px 18px', background:'#F9FAFB' }}>
            {Object.keys(grouped).length === 0 && (
              <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:'14px', padding:'40px' }}>
                No conversation history yet
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
                    const tc = TYPE_COLORS[item.type] || TYPE_COLORS.taxi
                    const isDone = ['confirmed','resolved','completed'].includes(item.status)
                    return (
                      <div key={`b-${item.id}-${idx}`} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'10px', background:'white', borderRadius:'10px', borderLeft:`3px solid ${isDone?'#D1D5DB':'#1C3D2E'}`, opacity:isDone?0.7:1 }}>
                        <div style={{ width:'26px', height:'26px', borderRadius:'5px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:tc.color, flexShrink:0 }}>{tc.label}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>
                            {item.partners?.name||item.type}{item.details?.destination ? ` → ${item.details.destination}` : ''}
                          </div>
                          <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'1px' }}>
                            {new Date(item.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                          </div>
                        </div>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:isDone?'#9CA3AF':'#C9A84C' }}>
                          {isDone ? 'Done' : item.status}
                        </div>
                      </div>
                    )
                  }
                  const isOut = item.role === 'user'
                  return (
                    <div key={`m-${idx}`} style={{ display:'flex', gap:'10px', marginBottom:'8px', flexDirection:isOut?'row-reverse':'row', alignItems:'flex-end' }}>
                      <div style={{ maxWidth:'68%', padding:'10px 14px', borderRadius:isOut?'14px 4px 14px 14px':'4px 14px 14px 14px', background:isOut?'#1C3D2E':'white', color:isOut?'white':'#111827', fontSize:'13px', lineHeight:'1.6', border:isOut?'none':'1px solid #E5E7EB' }}>
                        {item.content}
                        {item.sent_by && <div style={{ fontSize:'11px', opacity:0.6, marginTop:'3px' }}>— {item.sent_by}</div>}
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

        {/* Stay summary */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden', background:'white' }}>
          <div style={{ padding:'12px 18px', fontSize:'14px', fontWeight:'700', color:'#111827', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
            Stay summary
          </div>
          <div className="scrollable" style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'16px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {[{ label:'Messages sent', value:allMessages.length },{ label:'Bookings made', value:bookings.length }].map(s => (
                <div key={s.label} style={{ background:'#F9FAFB', borderRadius:'10px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'12px', color:'#6B7280', fontWeight:'500', marginBottom:'4px' }}>{s.label}</div>
                  <div style={{ fontSize:'24px', fontWeight:'700', color:'#111827' }}>{s.value}</div>
                </div>
              ))}
            </div>
            {guestRooms.length > 0 && (
              <div>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>Room{guestRooms.length>1?'s':''} this stay</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                  {guestRooms.map(r => (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', background:'#F9FAFB', borderRadius:'8px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', flex:1 }}>Room {r.room}</div>
                      {r.room_type && <div style={{ fontSize:'12px', color:'#6B7280' }}>{r.room_type}</div>}
                      {r.primary_room && <div style={{ fontSize:'11px', color:'#C9A84C', fontWeight:'700' }}>Primary</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bookings.length > 0 && (
              <div>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>All bookings</div>
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
                        <div style={{ fontSize:'12px', fontWeight:'600', color:isDone?'#9CA3AF':'#C9A84C', flexShrink:0 }}>
                          {isDone?'Done':'upcoming'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>Staff notes</div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Preferences, allergies, special requests..."
                style={{ width:'100%', height:'80px', padding:'10px 12px', background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:'10px', fontSize:'13px', color:'#111827', resize:'none', fontFamily:"'DM Sans',sans-serif", outline:'none' }}
              />
              <button onClick={handleSaveNotes} disabled={saving}
                style={{ width:'100%', padding:'10px', marginTop:'8px', background:saved?'#16A34A':'#F3F4F6', border:'1px solid #E5E7EB', borderRadius:'10px', fontSize:'13px', fontWeight:'600', color:saved?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}>
                {saved?'✓ Saved':saving?'Saving...':'Save notes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CHECK-IN PANEL COMPONENT ──────────────────────────────────
function CheckinPanel({ guest, guestRooms, hotelId, onSave }) {
  const [rooms, setRooms]             = useState(
    guestRooms.length > 0
      ? guestRooms.map(r => ({ ...r }))
      : [{ room:'', room_type:'', check_in:guest.check_in||'', check_out:guest.check_out||'', primary_room:true }]
  )
  const [sendWelcome, setSendWelcome] = useState(!guest.welcome_sent_at)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  function addRoom() {
    setRooms(prev => [...prev, { room:'', room_type:'', check_in:rooms[0]?.check_in||'', check_out:rooms[0]?.check_out||'', primary_room:false }])
  }
  function removeRoom(idx) { setRooms(prev => prev.filter((_,i) => i !== idx)) }
  function updateRoom(idx, field, value) { setRooms(prev => prev.map((r,i) => i===idx ? {...r,[field]:value} : r)) }
  function setPrimary(idx) { setRooms(prev => prev.map((r,i) => ({...r, primary_room: i===idx}))) }

  async function handleSave() {
    if (rooms.some(r => !r.room.trim())) { setError('Please fill in all room numbers'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/checkin', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ guestId:guest.id, hotelId, name:guest.name, surname:guest.surname, phone:guest.phone, language:guest.language, rooms, sendWelcome }),
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
              <button onClick={()=>setPrimary(idx)} title="Set as primary"
                style={{ padding:'8px 12px', background:room.primary_room?'rgba(201,168,76,0.15)':'white', border:`1px solid ${room.primary_room?'#C9A84C':'#D1D5DB'}`, borderRadius:'8px', fontSize:'14px', cursor:'pointer', color:room.primary_room?'#78350F':'#9CA3AF', fontWeight:'700' }}>
                ★
              </button>
              {rooms.length > 1 && (
                <button onClick={()=>removeRoom(idx)}
                  style={{ padding:'8px 12px', background:'white', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'16px', cursor:'pointer', color:'#9CA3AF' }}>
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
        <button onClick={addRoom}
          style={{ padding:'8px 16px', background:'white', border:'1px dashed #D1D5DB', borderRadius:'8px', fontSize:'13px', fontWeight:'500', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          + Add another room
        </button>
        <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:'500', color:'#374151', cursor:'pointer' }}>
          <input type="checkbox" checked={sendWelcome} onChange={e=>setSendWelcome(e.target.checked)} style={{ width:'16px', height:'16px' }}/>
          Send welcome WhatsApp to guest
          {guest.welcome_sent_at && <span style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'400' }}>(already sent)</span>}
        </label>
        {error && <div style={{ fontSize:'13px', color:'#DC2626', fontWeight:'500' }}>{error}</div>}
        <button onClick={handleSave} disabled={saving}
          style={{ marginLeft:'auto', padding:'10px 24px', background:'#1C3D2E', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:'700', color:'white', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          {saving ? 'Saving...' : 'Save rooms'}
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
