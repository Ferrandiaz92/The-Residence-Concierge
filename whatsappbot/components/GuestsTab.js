// components/GuestsTab.js (updated - multiple rooms + check-in panel)
'use client'
import { useState, useEffect } from 'react'

export default function GuestsTab({ hotelId, selectedGuest }) {
  const [profile, setProfile]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [showCheckin, setShowCheckin] = useState(false)
  const [guestRooms, setGuestRooms]   = useState([])

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
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:'12px',color:'var(--gray-400)',fontFamily:'var(--font)' }}>
        <div style={{ fontSize:'32px',opacity:0.3 }}>○</div>
        <div style={{ fontSize:'13px' }}>Search for a guest to view their profile</div>
        <div style={{ fontSize:'11px',color:'var(--gray-300)' }}>Use the search bar at the top</div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--gray-400)',fontFamily:'var(--font)' }}>
      Loading guest profile...
    </div>
  )

  if (!profile) return null

  const { guest, conversations, bookings } = profile
  const initials = `${guest.name?.[0]||'?'}${guest.surname?.[0]||''}`
  const langColors = {
    en: { bg:'#F0FDF4',color:'#16A34A' },
    ru: { bg:'#EFF6FF',color:'#2563EB' },
    he: { bg:'#FEF3C7',color:'#D97706' },
  }
  const lc = langColors[guest.language] || langColors.en

  // Build timeline
  const allMessages = conversations.flatMap(conv =>
    (conv.messages || []).map(m => ({ ...m, convId: conv.id }))
  ).sort((a, b) => new Date(a.ts) - new Date(b.ts))

  const grouped = {}
  allMessages.forEach(m => {
    const date = new Date(m.ts).toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(m)
  })
  bookings.forEach(b => {
    const date = new Date(b.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push({ ...b, _isBooking:true, ts:b.created_at })
  })
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a,b) => new Date(a.ts) - new Date(b.ts))
  })

  const TYPE_COLORS = {
    taxi:          { bg:'#F0FDF4',color:'#16A34A',label:'T' },
    restaurant:    { bg:'#EFF6FF',color:'#2563EB',label:'R' },
    activity:      { bg:'#FEF3C7',color:'#D97706',label:'B' },
    late_checkout: { bg:'#FDF2F8',color:'#9333EA',label:'L' },
    housekeeping:  { bg:'#F1F5F9',color:'#64748B',label:'HK' },
    maintenance:   { bg:'#F1F5F9',color:'#64748B',label:'MT' },
  }

  const isCheckin = (dateStr) => {
    if (!guest.check_in) return false
    return new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) === dateStr
  }

  const primaryRoom = guestRooms.find(r => r.primary_room) || guestRooms[0]

  return (
    <div style={{ display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',fontFamily:'var(--font)' }}>

      {/* Guest header */}
      <div style={{ background:'white',borderBottom:'0.5px solid var(--border)',padding:'14px 18px',display:'flex',alignItems:'center',gap:'14px',flexShrink:0 }}>
        <div style={{ width:'46px',height:'46px',borderRadius:'50%',background:'var(--green-800)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',color:'var(--gold)',fontWeight:'600',flexShrink:0 }}>
          {initials}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'17px',fontWeight:'500',color:'var(--gray-900)' }}>{guest.name} {guest.surname}</div>
          <div style={{ fontSize:'12px',color:'var(--gray-400)',marginTop:'2px' }}>{guest.phone}</div>
          <div style={{ display:'flex',gap:'5px',marginTop:'6px',flexWrap:'wrap',alignItems:'center' }}>

            {/* All rooms */}
            {guestRooms.length > 0 ? guestRooms.map(r => (
              <span key={r.id} style={{ fontSize:'10px',fontWeight:'500',padding:'2px 8px',borderRadius:'5px',background:r.primary_room?'var(--green-800)':'var(--gray-100)',color:r.primary_room?'white':'var(--gray-600)' }}>
                Room {r.room}{r.room_type ? ` · ${r.room_type}` : ''}{r.primary_room ? ' ★' : ''}
              </span>
            )) : guest.room && (
              <span style={{ fontSize:'10px',fontWeight:'500',padding:'2px 8px',borderRadius:'5px',background:'var(--gray-100)',color:'var(--gray-600)' }}>
                Room {guest.room}
              </span>
            )}

            {guest.check_in && (
              <span style={{ fontSize:'10px',fontWeight:'500',padding:'2px 8px',borderRadius:'5px',background:'#F0FDF4',color:'#16A34A' }}>
                In: {new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
              </span>
            )}
            {guest.check_out && (
              <span style={{ fontSize:'10px',fontWeight:'500',padding:'2px 8px',borderRadius:'5px',background:'#EFF6FF',color:'#2563EB' }}>
                Out: {new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
              </span>
            )}
            <span style={{ fontSize:'10px',fontWeight:'600',padding:'2px 8px',borderRadius:'5px',background:lc.bg,color:lc.color }}>
              {(guest.language||'EN').toUpperCase()}
            </span>
            {guest.welcome_sent_at && (
              <span style={{ fontSize:'9px',color:'var(--gray-300)' }}>
                Welcome sent ✓
              </span>
            )}
          </div>
        </div>

        {/* Check-in button */}
        <button onClick={() => setShowCheckin(!showCheckin)}
          style={{ padding:'7px 14px',background:showCheckin?'var(--green-800)':'white',border:'0.5px solid var(--border-md)',borderRadius:'var(--radius-md)',fontSize:'11px',fontWeight:'500',color:showCheckin?'white':'var(--gray-600)',cursor:'pointer',fontFamily:'var(--font)',flexShrink:0 }}>
          {showCheckin ? 'Close' : 'Check-in / Rooms'}
        </button>
      </div>

      {/* Check-in panel */}
      {showCheckin && (
        <CheckinPanel
          guest={guest}
          guestRooms={guestRooms}
          hotelId={hotelId}
          onSave={() => { loadProfile(guest.id); setShowCheckin(false) }}
        />
      )}

      {/* Body */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 300px',flex:1,overflow:'hidden' }}>

        {/* Timeline */}
        <div style={{ borderRight:'0.5px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ padding:'7px 12px',fontSize:'10px',fontWeight:'500',color:'var(--gray-500)',borderBottom:'0.5px solid var(--border)',background:'white',flexShrink:0 }}>
            Full conversation history
            <span style={{ fontSize:'9px',color:'var(--gray-300)',marginLeft:'6px' }}>
              {allMessages.length} messages · {bookings.length} bookings
            </span>
          </div>
          <div className="scrollable" style={{ padding:'12px 16px',background:'var(--gray-50)' }}>
            {Object.keys(grouped).length === 0 && (
              <div style={{ textAlign:'center',color:'var(--gray-400)',fontSize:'12px',padding:'30px' }}>
                No conversation history yet
              </div>
            )}
            {Object.keys(grouped).map(date => (
              <div key={date} style={{ marginBottom:'16px' }}>
                <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px' }}>
                  <div style={{ fontSize:'10px',fontWeight:isCheckin(date)?'700':'500',color:isCheckin(date)?'var(--gold)':'var(--gray-400)' }}>
                    {isCheckin(date) ? `Check-in · ${date}` : date}
                  </div>
                  <div style={{ flex:1,height:'0.5px',background:'var(--border)' }}/>
                </div>
                {grouped[date].map((item, idx) => {
                  if (item._isBooking) {
                    const tc = TYPE_COLORS[item.type] || TYPE_COLORS.taxi
                    const isDone = ['confirmed','resolved','completed'].includes(item.status)
                    return (
                      <div key={`b-${item.id}-${idx}`} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',marginBottom:'8px',background:'white',borderRadius:'var(--radius-md)',borderLeft:`2px solid ${isDone?'var(--gray-200)':'var(--green-600)'}`,opacity:isDone?0.7:1 }}>
                        <div style={{ width:'22px',height:'22px',borderRadius:'4px',background:tc.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',fontWeight:'700',color:tc.color,flexShrink:0 }}>{tc.label}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'10px',fontWeight:'500',color:'var(--gray-800)' }}>
                            {item.partners?.name||item.type}
                            {item.details?.destination?` → ${item.details.destination}`:''}
                          </div>
                          <div style={{ fontSize:'9px',color:'var(--gray-400)',marginTop:'1px' }}>
                            {new Date(item.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                          </div>
                        </div>
                        <div style={{ fontSize:'9px',fontWeight:'500',color:isDone?'var(--gray-400)':'var(--gold)' }}>
                          {isDone?'Done':item.status}
                        </div>
                      </div>
                    )
                  }
                  const isOut = item.role === 'user'
                  return (
                    <div key={`m-${idx}`} style={{ display:'flex',gap:'8px',marginBottom:'6px',flexDirection:isOut?'row-reverse':'row',alignItems:'flex-end' }}>
                      <div style={{ maxWidth:'68%',padding:'8px 11px',borderRadius:isOut?'12px 4px 12px 12px':'4px 12px 12px 12px',background:isOut?'var(--green-800)':'white',color:isOut?'white':'var(--gray-800)',fontSize:'11px',lineHeight:'1.5',border:isOut?'none':'0.5px solid var(--border)' }}>
                        {item.content}
                        {item.sent_by && <div style={{ fontSize:'9px',opacity:0.6,marginTop:'2px' }}>— {item.sent_by}</div>}
                      </div>
                      <div style={{ fontSize:'9px',color:'var(--gray-300)',flexShrink:0,paddingBottom:'2px' }}>
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
        <div style={{ display:'flex',flexDirection:'column',overflow:'hidden',background:'white' }}>
          <div style={{ padding:'7px 12px',fontSize:'10px',fontWeight:'500',color:'var(--gray-500)',borderBottom:'0.5px solid var(--border)',flexShrink:0 }}>Stay summary</div>
          <div className="scrollable" style={{ padding:'12px',display:'flex',flexDirection:'column',gap:'12px' }}>

            {/* Stats */}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px' }}>
              {[{ label:'Messages', value:allMessages.length },{ label:'Bookings', value:bookings.length }].map(s=>(
                <div key={s.label} style={{ background:'var(--gray-50)',borderRadius:'var(--radius-md)',padding:'8px 10px' }}>
                  <div style={{ fontSize:'9px',color:'var(--gray-400)' }}>{s.label}</div>
                  <div style={{ fontSize:'20px',fontWeight:'500',color:'var(--gray-900)',lineHeight:'1.2' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Rooms summary */}
            {guestRooms.length > 1 && (
              <div>
                <div style={{ fontSize:'10px',color:'var(--gray-400)',marginBottom:'6px',fontWeight:'500' }}>Rooms this stay</div>
                <div style={{ display:'flex',flexDirection:'column',gap:'4px' }}>
                  {guestRooms.map(r => (
                    <div key={r.id} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'7px 9px',background:'var(--gray-50)',borderRadius:'var(--radius-sm)' }}>
                      <div style={{ fontSize:'11px',fontWeight:'500',color:'var(--gray-900)',flex:1 }}>Room {r.room}</div>
                      {r.room_type && <div style={{ fontSize:'10px',color:'var(--gray-400)' }}>{r.room_type}</div>}
                      {r.primary_room && <div style={{ fontSize:'9px',color:'var(--gold)',fontWeight:'600' }}>Primary</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bookings */}
            {bookings.length > 0 && (
              <div>
                <div style={{ fontSize:'10px',color:'var(--gray-400)',marginBottom:'6px',fontWeight:'500' }}>All bookings</div>
                <div style={{ display:'flex',flexDirection:'column',gap:'4px' }}>
                  {bookings.map(b => {
                    const tc = TYPE_COLORS[b.type]||{bg:'#F1F5F9',color:'#64748B',label:'?'}
                    const isDone = ['confirmed','resolved','completed'].includes(b.status)
                    return (
                      <div key={b.id} style={{ display:'flex',alignItems:'center',gap:'7px',padding:'6px 8px',background:'var(--gray-50)',borderRadius:'var(--radius-sm)' }}>
                        <div style={{ width:'18px',height:'18px',borderRadius:'3px',background:tc.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:tc.color,flexShrink:0 }}>{tc.label}</div>
                        <div style={{ flex:1,fontSize:'10px',color:'var(--gray-600)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                          {b.partners?.name||b.type} · {new Date(b.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                        </div>
                        <div style={{ fontSize:'9px',fontWeight:'500',color:isDone?'var(--gray-400)':'var(--gold)',flexShrink:0 }}>
                          {isDone?'Done':'upcoming'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <div style={{ fontSize:'10px',color:'var(--gray-400)',marginBottom:'6px',fontWeight:'500' }}>Staff notes</div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Preferences, allergies, special requests..."
                style={{ width:'100%',height:'70px',padding:'8px 10px',background:'var(--gray-50)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',fontSize:'11px',color:'var(--gray-700)',resize:'none',fontFamily:'var(--font)',outline:'none' }}
              />
              <button onClick={handleSaveNotes} disabled={saving}
                style={{ width:'100%',padding:'7px',marginTop:'5px',background:saved?'var(--success)':'var(--gray-100)',border:'0.5px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:'11px',fontWeight:'500',color:saved?'white':'var(--gray-600)',cursor:'pointer',fontFamily:'var(--font)',transition:'all 0.2s' }}>
                {saved?'✓ Saved':saving?'Saving...':'Save notes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CHECK-IN PANEL ─────────────────────────────────────────────
function CheckinPanel({ guest, guestRooms, hotelId, onSave }) {
  const [rooms, setRooms]         = useState(
    guestRooms.length > 0 ? guestRooms : [{ room:'', room_type:'', check_in: guest.check_in||'', check_out: guest.check_out||'', primary_room:true }]
  )
  const [sendWelcome, setSendWelcome] = useState(!guest.welcome_sent_at)
  const [saving, setSaving]           = useState(false)

  function addRoom() {
    setRooms(prev => [...prev, { room:'', room_type:'', check_in: rooms[0]?.check_in||'', check_out: rooms[0]?.check_out||'', primary_room:false }])
  }

  function removeRoom(idx) {
    setRooms(prev => prev.filter((_,i) => i !== idx))
  }

  function updateRoom(idx, field, value) {
    setRooms(prev => prev.map((r,i) => i === idx ? { ...r, [field]: value } : r))
  }

  function setPrimary(idx) {
    setRooms(prev => prev.map((r,i) => ({ ...r, primary_room: i === idx })))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/checkin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          guestId:     guest.id,
          hotelId,
          name:        guest.name,
          surname:     guest.surname,
          phone:       guest.phone,
          language:    guest.language,
          rooms,
          sendWelcome,
        }),
      })
      onSave()
    } finally { setSaving(false) }
  }

  const inputStyle = { width:'100%',padding:'6px 9px',border:'0.5px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:'11px',fontFamily:'var(--font)',outline:'none',color:'var(--gray-800)' }

  return (
    <div style={{ background:'var(--gray-50)',borderBottom:'0.5px solid var(--border)',padding:'14px 18px' }}>
      <div style={{ fontSize:'12px',fontWeight:'500',color:'var(--gray-900)',marginBottom:'10px' }}>
        Rooms for this stay
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:'8px',marginBottom:'10px' }}>
        {rooms.map((room, idx) => (
          <div key={idx} style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:'6px',alignItems:'center',padding:'10px',background:'white',borderRadius:'var(--radius-md)',border:'0.5px solid var(--border)' }}>
            <div>
              <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'3px' }}>Room number</div>
              <input value={room.room} onChange={e=>updateRoom(idx,'room',e.target.value)} placeholder="312" style={inputStyle}/>
            </div>
            <div>
              <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'3px' }}>Type</div>
              <select value={room.room_type} onChange={e=>updateRoom(idx,'room_type',e.target.value)} style={inputStyle}>
                <option value="">Select type</option>
                {['Single','Double','Suite','Family','Deluxe'].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'3px' }}>Check-in</div>
              <input type="date" value={room.check_in||''} onChange={e=>updateRoom(idx,'check_in',e.target.value)} style={inputStyle}/>
            </div>
            <div>
              <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'3px' }}>Check-out</div>
              <input type="date" value={room.check_out||''} onChange={e=>updateRoom(idx,'check_out',e.target.value)} style={inputStyle}/>
            </div>
            <div style={{ display:'flex',gap:'4px',alignItems:'flex-end',paddingBottom:'1px' }}>
              <button onClick={()=>setPrimary(idx)} title="Set as primary room"
                style={{ padding:'5px 8px',background:room.primary_room?'var(--gold-dim)':'white',border:`0.5px solid ${room.primary_room?'var(--gold)':'var(--border-md)'}`,borderRadius:'var(--radius-sm)',fontSize:'11px',cursor:'pointer',color:room.primary_room?'#92400E':'var(--gray-400)' }}>
                ★
              </button>
              {rooms.length > 1 && (
                <button onClick={()=>removeRoom(idx)}
                  style={{ padding:'5px 8px',background:'white',border:'0.5px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:'11px',cursor:'pointer',color:'var(--gray-400)' }}>
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex',alignItems:'center',gap:'12px' }}>
        <button onClick={addRoom}
          style={{ padding:'6px 12px',background:'white',border:'0.5px dashed var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:'11px',color:'var(--gray-400)',cursor:'pointer',fontFamily:'var(--font)' }}>
          + Add another room
        </button>

        <label style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',color:'var(--gray-600)',cursor:'pointer' }}>
          <input type="checkbox" checked={sendWelcome} onChange={e=>setSendWelcome(e.target.checked)}/>
          Send welcome WhatsApp {guest.welcome_sent_at ? '(already sent)' : ''}
        </label>

        <button onClick={handleSave} disabled={saving} style={{ marginLeft:'auto',padding:'7px 16px',background:'var(--green-800)',border:'none',borderRadius:'var(--radius-sm)',fontSize:'11px',fontWeight:'500',color:'white',cursor:'pointer',fontFamily:'var(--font)' }}>
          {saving ? 'Saving...' : 'Save rooms'}
        </button>
      </div>
    </div>
  )
}
