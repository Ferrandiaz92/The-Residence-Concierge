// components/LiveTab.js (UI update)
// Changes:
// 1. Left col 240px, right col 260px, centre smaller
// 2. Better typography — larger fonts, bolder titles
// 3. Room number shows correctly
// 4. New priorities: Urgent / Today / Planned
// 5. Bigger centered request type buttons
// 6. Dynamic departments from API

'use client'
import React, { useState, useEffect, useRef } from 'react'
import DepartmentQueue from './DepartmentQueue'
import CancellationAlerts from './CancellationAlerts'

const LANG_COLORS = {
  en: { bg:'#DCFCE7', color:'#14532D',  name:'English'    },
  ru: { bg:'#DBEAFE', color:'#1E3A5F',  name:'Russian'    },
  he: { bg:'#FEF3C7', color:'#78350F',  name:'Hebrew'     },
  de: { bg:'#F3F4F6', color:'#1F2937',  name:'German'     },
  fr: { bg:'#EDE9FE', color:'#4C1D95',  name:'French'     },
  zh: { bg:'#FEF2F2', color:'#7F1D1D',  name:'Chinese'    },
  pl: { bg:'#FFF1F2', color:'#881337',  name:'Polish'     },
  sv: { bg:'#EFF6FF', color:'#1E3A8A',  name:'Swedish'    },
  fi: { bg:'#F0F9FF', color:'#0C4A6E',  name:'Finnish'    },
  uk: { bg:'#FEFCE8', color:'#713F12',  name:'Ukrainian'  },
  ar: { bg:'#F0FDF4', color:'#14532D',  name:'Arabic'     },
  nl: { bg:'#FFF7ED', color:'#7C2D12',  name:'Dutch'      },
  el: { bg:'#EFF6FF', color:'#1E3A8A',  name:'Greek'      },
  es: { bg:'#FFF7ED', color:'#9A3412',  name:'Spanish'    },
  ca: { bg:'#FEF9C3', color:'#713F12',  name:'Catalan'    },
  it: { bg:'#F0FDF4', color:'#14532D',  name:'Italian'    },
  pt: { bg:'#ECFDF5', color:'#064E3B',  name:'Portuguese' },
}

// Guest type border colours for conversations
const TYPE_BORDERS = {
  stay:        null,            // default gold when active
  day_visitor: '#C9A84C',       // gold
  event:       '#7C3AED',       // purple
  prospect:    '#64748B',       // gray
}

const canReply   = (role) => ['receptionist','manager','admin','supervisor'].includes(role)
const isDeptRole = (role) => ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk'].includes(role)

const PRIORITIES = [
  { key:'urgent',  label:'Urgent',  sub:'within 2h',   color:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5' },
  { key:'today',   label:'Today',   sub:'same day',    color:'#D97706', bg:'#FFFBEB', border:'#FCD34D' },
  { key:'planned', label:'Planned', sub:'future task', color:'#2563EB', bg:'#EFF6FF', border:'#93C5FD' },
]


// ── EXPANDABLE BOOKING ROW (desktop) ─────────────────────
function ExpandableBookingDesktop({ b }) {
  const [open, setOpen] = React.useState(false)
  const guest = b.guests || {}
  const typeColors = {
    taxi:          { bg:'#DCFCE7', color:'#14532D', emoji:'🚗' },
    restaurant:    { bg:'#DBEAFE', color:'#1E3A5F', emoji:'🍽️' },
    activity:      { bg:'#FEF3C7', color:'#78350F', emoji:'⛵' },
    late_checkout: { bg:'#FAF5FF', color:'#581C87', emoji:'🕐' },
  }
  const tc = typeColors[b.type] || { bg:'#F1F5F9', color:'#334155', emoji:'📋' }
  const time = b.details?.time
    ? b.details.time
    : new Date(b.confirmed_at||b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})

  return (
    <div style={{ borderBottom:'0.5px solid var(--border)', background: open ? '#F9FAFB' : 'white' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', cursor:'pointer' }}>
        <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#16A34A', flexShrink:0 }}/>
        <div style={{ width:'26px', height:'26px', borderRadius:'6px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', flexShrink:0 }}>{tc.emoji}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#111827' }}>
            {guest.name}{guest.room ? ` · Room ${guest.room}` : ''}
          </div>
          <div style={{ fontSize:'11px', color:'#6B7280', marginTop:'1px' }}>{b.partners?.name || b.type}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151' }}>{time}</div>
          <div style={{ width:'18px', height:'18px', borderRadius:'4px', background: open ? '#1C3D2E' : '#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .2s' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d={open ? 'M1 7L5 3L9 7' : 'M1 3L5 7L9 3'} stroke={open ? 'white' : '#6B7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ padding:'8px 14px 12px 51px', background:'#F9FAFB', borderTop:'0.5px solid #F3F4F6' }}>
          <div style={{ fontSize:'11px', color:'#374151', display:'flex', flexDirection:'column', gap:'4px' }}>
            {b.details?.destination && <div>📍 <strong>To:</strong> {b.details.destination}</div>}
            {b.details?.pax         && <div>👥 <strong>Passengers:</strong> {b.details.pax}</div>}
            {b.details?.date        && <div>📅 <strong>Date:</strong> {b.details.date}</div>}
            {b.details?.time        && <div>🕐 <strong>Time:</strong> {b.details.time}</div>}
            {b.details?.notes       && <div>📝 <strong>Notes:</strong> {b.details.notes}</div>}
            {b.commission_amount > 0 && <div>💰 <strong>Commission:</strong> €{b.commission_amount}</div>}
            <div style={{ marginTop:'3px' }}>
              <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'4px',
                background: b.status==='confirmed' ? '#DCFCE7' : '#FEF3C7',
                color:      b.status==='confirmed' ? '#14532D' : '#78350F',
                textTransform:'capitalize' }}>
                {b.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TICKET ROW (desktop) — proper component so useState is legal ──
function DesktopTicketRow({ t, session, conversations, onSelectConv, onSetCentreMode, onReload }) {
  const [open, setOpen] = React.useState(false)
  const typeConfig = {
    room_issue:   { label:'Maintenance', bg:'#FEF2F2', color:'#DC2626', emoji:'🔧' },
    housekeeping: { label:'Housekeeping',bg:'#F0FDF4', color:'#15803D', emoji:'🛎️' },
    fnb:          { label:'F&B',         bg:'#FEF3C7', color:'#B45309', emoji:'🍽️' },
  }
  // For facility bookings, pick emoji from facility name
  const FACILITY_EMOJI = { tennis:'🎾', padel:'🎾', court:'🎾', spa:'💆', gym:'🏋️', pool:'🏊', conference:'💼', yoga:'🧘', massage:'💆', beach:'🏖️', rooftop:'🌅', restaurant:'🍽️', bar:'🍹', golf:'⛳' }
  function getFacilityEmoji(desc) {
    const lower = (desc || '').toLowerCase()
    for (const [key, em] of Object.entries(FACILITY_EMOJI)) { if (lower.includes(key)) return em }
    return '🏨'
  }
  const tc = t.category === 'facility_booking'
    ? { label:'Facility', bg:'#DCFCE7', color:'#14532D', emoji: getFacilityEmoji(t.description) }
    : (typeConfig[t.category] || typeConfig[t.department] || { label:'Ticket', bg:'#F1F5F9', color:'#334155', emoji:'📋' })
  const isPrivileged = ['manager','supervisor','receptionist'].includes(session?.role)

  return (
    <div style={{ borderBottom:'0.5px solid var(--border)' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'10px 14px', cursor:'pointer', background: open ? '#F9FAFB' : 'white' }}>
        <div style={{ width:'24px', height:'24px', borderRadius:'6px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', flexShrink:0, marginTop:'1px' }}>
          {tc.emoji}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'5px', marginBottom:'2px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 6px', borderRadius:'4px', background:tc.bg, color:tc.color }}>{tc.label}</span>
            {t.priority === 'urgent' && <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 6px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626' }}>URGENT</span>}
            {t.priority === 'planned' && <span style={{ fontSize:'10px', fontWeight:'600', padding:'1px 6px', borderRadius:'4px', background:'#EFF6FF', color:'#2563EB' }}>PLANNED</span>}
          </div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'180px' }}>
            {t.category === 'facility_booking'
              ? (() => {
                  const descLines = (t.description || '').split('\n')
                  const facLine = descLines.find(l => l.indexOf('Facility:') === 0)
                  const facName = facLine ? facLine.slice('Facility:'.length).trim() : 'Facility'
                  return 'Booking Request: ' + facName
                })()
              : (t.description?.slice(0, 45) + (t.description?.length > 45 ? '…' : ''))
            }
          </div>
          <div style={{ fontSize:'11px', color:'#6B7280', marginTop:'1px' }}>
            {t.category === 'facility_booking'
              ? (t.guests?.name ? (t.guests.name + (t.guests.room ? ' · Room ' + t.guests.room : '')) : 'Facility booking')
              : `${t.room ? 'Room ' + t.room + ' · ' : ''}${t.department} · ${t.status}`
            }
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink:0, marginTop:'6px' }}>
          <path d={open ? 'M1 7L5 3L9 7' : 'M1 3L5 7L9 3'} stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && (
        <div style={{ padding:'8px 14px 12px 48px', background:'#F9FAFB', borderTop:'0.5px solid #F3F4F6', display:'flex', flexDirection:'column', gap:'7px' }}>
          {t.category === 'facility_booking' ? (() => {
            const dl  = (t.description || '').split('\n').map(l => l.trim()).filter(Boolean)
            const get = (pfx) => { const l = dl.find(x => x.startsWith(pfx)); return l ? l.slice(pfx.length).trim() : null }
            const facName  = get('Facility:')
            const date     = get('Date:')
            const time     = get('Time:')
            const guests   = get('Guests:')
            const guestLine = get('Guest:')
            const [guestName, roomPart] = guestLine ? guestLine.split('·').map(s => s.trim()) : [t.guests?.name, t.guests?.room ? 'Room ' + t.guests.room : null]
            const guestType = t.guests?.guest_type ? ({ stay:'Stay guest', day_visitor:'Day visitor', member:'Member', prospect:'Prospect', event:'Event guest' }[t.guests.guest_type] || t.guests.guest_type) : null
            return (
              <div style={{ fontSize:'12px', color:'#374151', lineHeight:'2', display:'flex', flexDirection:'column' }}>
                {guestName  && <span style={{ fontWeight:'600' }}>{guestName}</span>}
                {roomPart   && <span>{roomPart}</span>}
                {guestType  && <span style={{ fontSize:'11px', color:'#6B7280' }}>{guestType}</span>}
                {facName    && <span>🎾 {facName}</span>}
                {time       && <span>⏰ Time: {time}</span>}
                {date       && <span>📅 Date: {(() => { try { const [y,m,d] = date.split('-'); return d+'/'+m+'/'+y } catch { return date } })()}</span>}
                {guests     && <span>👥 Guests: {guests}</span>}
              </div>
            )
          })() : (
            <div style={{ fontSize:'11px', color:'#374151', lineHeight:'1.6' }}>{t.description}</div>
          )}
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {isPrivileged && t.status === 'pending' && (
              <button onClick={async () => {
                if (t.category === 'facility_booking') {
                  // Find the matching facility_booking row by guest_id, then confirm it
                  // which sends WhatsApp to guest AND notifies facility contact
                  const facRes  = await fetch('/api/facility-bookings?hotelId=' + (t.hotel_id || '') + '&status=pending')
                  const facData = await facRes.json()
                  const match   = (facData.bookings || []).find(b => b.guest_id === t.guest_id)
                  if (match) {
                    await fetch('/api/facility-bookings', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ bookingId: match.id, action:'confirmed' }) })
                  }
                  // Also mark the ticket resolved
                  await fetch('/api/tickets', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ticketId: t.id, status:'resolved' }) })
                } else {
                  await fetch('/api/tickets', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ticketId: t.id, status:'in_progress' }) })
                }
                onReload()
              }} style={{ fontSize:'11px', fontWeight:'600', padding:'4px 10px', borderRadius:'5px', border:'0.5px solid #86EFAC', background:'#DCFCE7', color:'#14532D', cursor:'pointer', fontFamily:'var(--font)' }}>
                {t.category === 'facility_booking' ? '✅ Confirm booking' : '👍 Accept'}
              </button>
            )}
            {isPrivileged && t.status === 'in_progress' && t.category !== 'facility_booking' && (
              <button onClick={async () => {
                await fetch('/api/tickets', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ticketId: t.id, status:'resolved' }) })
                onReload()
              }} style={{ fontSize:'11px', fontWeight:'600', padding:'4px 10px', borderRadius:'5px', border:'0.5px solid #86EFAC', background:'#DCFCE7', color:'#14532D', cursor:'pointer', fontFamily:'var(--font)' }}>
                ✅ Complete
              </button>
            )}
            {t.guest_id && (() => {
              const conv = (conversations || []).find(c => c.guests?.id === t.guest_id)
              if (!conv) return null
              return (
                <button onClick={() => { onSelectConv(conv); onSetCentreMode('chat') }}
                  style={{ fontSize:'11px', fontWeight:'600', padding:'4px 10px', borderRadius:'5px', border:'0.5px solid #93C5FD', background:'#DBEAFE', color:'#1E3A5F', cursor:'pointer', fontFamily:'var(--font)' }}>
                  💬 Go to chat
                </button>
              )
            })()}
            <select onChange={async (e) => {
              if (!e.target.value) return
              await fetch('/api/tickets', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ticketId: t.id, status: t.status, department: e.target.value }) })
              e.target.value = ''
              onReload()
            }} style={{ fontSize:'11px', padding:'3px 7px', borderRadius:'5px', border:'0.5px solid #D1D5DB', background:'white', color:'#6B7280', cursor:'pointer', fontFamily:'var(--font)' }}>
              <option value="">Reassign…</option>
              {['maintenance','housekeeping','fnb','concierge','security'].map(d => (
                <option key={d} value={d} disabled={d === t.department}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

function SelectedGuestChip({ conv, onClear }) {
  const sg   = conv.guests || {}
  const isEsc = conv.status === 'escalated'
  const stay  = sg.stay_status || 'prospect'
  const chipBorder = isEsc             ? '3px solid #DC2626'
    : stay === 'active'                ? '3px solid #16A34A'
    : stay === 'pre_arrival'           ? '3px solid #60A5FA'
    : stay === 'checked_out'           ? '3px solid #D1D5DB'
    : '3px solid transparent'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'white', borderRadius:'10px', border:'0.5px solid #E5E7EB', borderLeft: chipBorder }}>
      <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'var(--green-800)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'var(--gold)', fontWeight:'700', flexShrink:0 }}>
        {(sg.name?.[0]||'?').toUpperCase()}{(sg.surname?.[0]||'').toUpperCase()}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{sg.name} {sg.surname}</div>
        <div style={{ fontSize:'12px', color:'#6B7280' }}>
          {(sg.room || sg.guest_room) ? `Room ${sg.room || sg.guest_room}` : 'No room assigned'}
        </div>
      </div>
      <button onClick={onClear} style={{ background:'none', border:'none', color:'#D1D5DB', cursor:'pointer', fontSize:'18px', lineHeight:1, flexShrink:0 }}>×</button>
    </div>
  )
}

export default function LiveTab({ hotelId, session, onSelectGuest }) {
  if (isDeptRole(session?.role)) {
    return <DepartmentQueue hotelId={hotelId} session={session} />
  }
  return <ReceptionistView hotelId={hotelId} session={session} onSelectGuest={onSelectGuest} />
}

function ReceptionistView({ hotelId, session, onSelectGuest }) {
  const [conversations, setConversations] = useState([])
  const [bookings, setBookings]           = useState([])
  const [tickets, setTickets]             = useState([])
  const [selectedConv, setSelectedConv]   = useState(null)
  const [centreMode, setCentreMode]       = useState('portal')
  const [replyText, setReplyText]         = useState('')
  const [sending, setSending]             = useState(false)
  const [requestType, setRequestType]     = useState('external')
  const [category, setCategory]           = useState('')
  const [department, setDepartment]       = useState('')
  const [deptCategory, setDeptCategory]   = useState('')
  const [priority, setPriority]           = useState('today')
  const [requestText, setRequestText]     = useState('')
  const [sent, setSent]                   = useState(false)
  const [noGuest, setNoGuest]             = useState(false)
  const [partnerTypes, setPartnerTypes]   = useState([])
  const [departments, setDepartments]     = useState([])
  const [partners,    setPartners]        = useState([])
  const [facilities,     setFacilities]     = useState([])
  const [selectedPartner, setSelectedPartner] = useState('')
  const [facFacilityId,   setFacFacilityId]   = useState('')
  const [facDate,         setFacDate]          = useState('')
  const [facTime,         setFacTime]          = useState('')
  const [facPax,          setFacPax]           = useState('1')
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (!hotelId) return
    loadData()
    loadConfig()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [hotelId])

  useEffect(() => {
    if (centreMode === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selectedConv, centreMode])

  async function loadConfig() {
    try {
      const res  = await fetch(`/api/config?hotelId=${hotelId}`)
      const data = await res.json()
      setPartnerTypes(data.partnerTypes || [])
      setDepartments(data.departments || [])
      if (data.partnerTypes?.[0]) setCategory(data.partnerTypes[0].name.toLowerCase())
      if (data.departments?.[0]) setDepartment(data.departments[0].key)

      // Load partners for manual picker
      try {
        const pRes  = await fetch('/api/partners?hotelId=' + hotelId)
        const pData = await pRes.json()
        setPartners(pData.partners || [])
      } catch {}

      // Load facilities for facility booking form
      try {
        const fRes  = await fetch('/api/facilities?hotelId=' + hotelId)
        const fData = await fRes.json()
        setFacilities(fData.facilities || [])
      } catch {}
    } catch {}
  }

  async function loadData() {
    const [convRes, bookRes, tickRes] = await Promise.all([
      fetch(`/api/conversations?hotelId=${hotelId}`),
      fetch(`/api/bookings?hotelId=${hotelId}`),
      fetch(`/api/tickets?hotelId=${hotelId}`),
    ])
    const [convData, bookData, tickData] = await Promise.all([convRes.json(), bookRes.json(), tickRes.json()])
    const freshConvs = convData.conversations || []
    setConversations(freshConvs)
    setBookings(bookData.bookings || [])
    setTickets(tickData.tickets || [])
    // Keep selected conversation messages in sync
    setSelectedConv(prev => {
      if (!prev) return prev
      const updated = freshConvs.find(c => c.id === prev.id)
      return updated || prev
    })
  }

  async function handleReply() {
    if (!replyText.trim() || !selectedConv) return
    setSending(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConv.id,
          guestPhone:     selectedConv.guests?.phone,
          message:        replyText.trim(),
        }),
      })
      setReplyText('')
      await loadData()
      // Refresh selected conversation specifically
      try {
        const res  = await fetch(`/api/conversations?hotelId=${hotelId}&convId=${selectedConv.id}`)
        const data = await res.json()
        if (data.conversation) setSelectedConv(data.conversation)
      } catch {}
    } finally { setSending(false) }
  }

  async function handleSendRequest() {
    if (requestType !== 'facility' && !requestText.trim()) return
    if (!selectedConv && !noGuest) return
    setSending(true)
    try {
      if (requestType === 'facility') {
        // Facility booking — create via facility-bookings API
        // which sends WhatsApp to facility contact + notifies guest
        const facilityId   = facFacilityId
        const facilityName = facilities.find(f => f.id === facFacilityId)?.name || ''
        const date         = facDate
        const time         = facTime
        const guestsCount  = parseInt(facPax || '1')
        if (!facilityId) { setSending(false); return }
        await fetch('/api/facility-bookings', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            hotelId,
            facilityId,
            facilityName: facilityName.split(' — ')[0],
            guestId:      selectedConv?.guests?.id || null,
            date, time, guestsCount,
            notes:        requestText || null,
            createdBy:    `staff:${session?.name||''}`,
          }),
        })
      } else if (requestType === 'external') {
        await fetch('/api/bookings', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hotelId, guestId: selectedConv?.guests?.id || null, type: category, details: { description: requestText }, createdBy: `staff:${session?.name||''}` }),
        })
      } else {
        await fetch('/api/tickets', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hotelId, guestId: selectedConv?.guests?.id || null, department, category: deptCategory || department, description: requestText, room: selectedConv?.guests?.room || selectedConv?.guests?.guest_room || null, priority, createdBy: `staff:${session?.name||''}` }),
        })
      }
      setSent(true); setRequestText('')
      setTimeout(() => setSent(false), 3000)
      loadData()
    } finally { setSending(false) }
  }

  const upcoming  = bookings.filter(b => ['confirmed','pending'].includes(b.status))
  const completed = bookings.filter(b => ['completed','resolved'].includes(b.status))
  const issues    = tickets.filter(t => !['resolved','cancelled'].includes(t.status))
  const escalated = conversations.filter(c => c.status === 'escalated')

  // Section header
  const sh = (title, sub, warn) => (
    <div style={{ padding:'10px 14px', fontSize:'12px', fontWeight:'600', color:warn?'#92400E':'#374151', borderBottom:'0.5px solid var(--border)', background:warn?'#FFFBEB':'white', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
      <span>{title}</span>
      {sub && <span style={{ fontSize:'11px', fontWeight:'400', color:warn?'#B45309':'#9CA3AF' }}>{sub}</span>}
    </div>
  )

  return (
    <div style={{ display:'grid', gridTemplateColumns:'336px 1fr 364px', height:'100%', overflow:'hidden' }}>

      {/* ── LEFT: Conversations ── */}
      <div style={{ borderRight:'0.5px solid var(--border)', display:'flex', flexDirection:'column', background:'white', overflow:'hidden' }}>
        {sh('Conversations', `${conversations.length} active${escalated.length > 0 ? ` · ${escalated.length} need reply` : ''}`)}
        <div className="scrollable">
          {conversations.length === 0 && (
            <div style={{ padding:'24px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>No active conversations</div>
          )}
          {conversations.map(conv => {
            const guest      = conv.guests || {}
            const msgs       = conv.messages || []
            const last       = msgs[msgs.length - 1]
            const lang       = guest.language || 'en'
            const lc         = LANG_COLORS[lang] || LANG_COLORS.en
            const isActive    = selectedConv?.id === conv.id
            const isEsc       = conv.status === 'escalated'
            const minsAgo     = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
            const timeLabel   = minsAgo === 0 ? 'now' : minsAgo < 60 ? `${minsAgo}m` : `${Math.floor(minsAgo/60)}h`
            const roomNum     = guest.room || guest.guest_room || guest.guest_room_number
            const stayStatus  = guest.stay_status || 'prospect'
            const leftBorder  = isActive       ? '3px solid #C9A84C'
              : isEsc                          ? '3px solid #DC2626'
              : stayStatus === 'active'        ? '3px solid #16A34A'
              : stayStatus === 'pre_arrival'   ? '3px solid #60A5FA'
              : stayStatus === 'checked_out'   ? '3px solid #D1D5DB'
              : '3px solid transparent'
            const rowBg       = isActive ? 'rgba(201,168,76,0.06)'
              : isEsc                          ? 'rgba(220,38,38,0.03)'
              : stayStatus === 'checked_out'   ? '#FAFAFA'
              : 'white'
            const rowBgHover  = stayStatus === 'checked_out' ? '#F5F5F5' : '#F9FAFB'

            return (
              <div key={conv.id} onClick={() => { setSelectedConv(conv); setCentreMode('chat'); setNoGuest(false) }}
                style={{ padding:'11px 14px', borderBottom:'0.5px solid var(--border)', borderLeft: leftBorder, background: rowBg, cursor:'pointer' }}
                onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=rowBgHover }}
                onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background=rowBg }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'3px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>
                    {guest.name || 'Guest'} {guest.surname || ''}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                    {minsAgo < 2 && <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--gold)', flexShrink:0 }}/>}
                    <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{timeLabel}</div>
                  </div>
                </div>
                <div style={{ fontSize:'12px', fontWeight:'500', color:'#6B7280', marginBottom:'5px', display:'flex', alignItems:'center', gap:'5px', flexWrap:'wrap' }}>
                  {/* Prospect */}
                  {stayStatus === 'prospect' && <span>New visitor</span>}
                  {/* Pre-arrival — arriving date, no room */}
                  {stayStatus === 'pre_arrival' && <>
                    <span>{guest.check_in ? `Arriving ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` : 'Arriving soon'}</span>
                    <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 5px', borderRadius:'3px', background:'#DBEAFE', color:'#1E3A5F' }}>ARRIVING</span>
                  </>}
                  {/* Active — room + checkout date */}
                  {stayStatus === 'active' && <>
                    {roomNum && <span>Room {roomNum}</span>}
                    {guest.check_out && <span style={{ color:'#9CA3AF' }}>· Out {new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                  </>}
                  {/* Checked out — room + badge */}
                  {stayStatus === 'checked_out' && <>
                    {roomNum && <span>Room {roomNum}</span>}
                    <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 5px', borderRadius:'3px', background:'#F3F4F6', color:'#6B7280' }}>CHECKED OUT</span>
                  </>}
                </div>
                <div style={{ fontSize:'11px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'200px' }}>
                  {isEsc
                    ? <span style={{ color:'#DC2626', fontWeight:'600' }}>REPLY NEEDED</span>
                    : last?.content || 'No messages yet'
                  }
                </div>
                <div style={{ marginTop:'5px', display:'flex', gap:'4px' }}>
                  <span style={{ fontSize:'10px', fontWeight:'600', padding:'2px 7px', borderRadius:'5px', background:lc.bg, color:lc.color }}>
                    {lc.name || lang.toUpperCase()}
                  </span>
                  {isEsc && <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626' }}>escalated</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── CENTRE: Chat or Staff Portal ── */}
      <div style={{ background:'#F9FAFB', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Mode toggle — bigger, centered */}
        <div style={{ background:'white', borderBottom:'0.5px solid var(--border)', padding:'10px 16px', display:'flex', gap:'10px', justifyContent:'center', alignItems:'center', flexShrink:0 }}>
          {[
            { key:'chat',   label:'Chat thread' },
            { key:'portal', label:'Staff portal' },
          ].map(mode => (
            <button key={mode.key} onClick={() => setCentreMode(mode.key)}
              style={{ padding:'8px 24px', borderRadius:'8px', fontSize:'13px', fontWeight:'600', border:'0.5px solid', borderColor:centreMode===mode.key?'var(--green-800)':'#D1D5DB', background:centreMode===mode.key?'var(--green-800)':'white', color:centreMode===mode.key?'white':'#6B7280', cursor:'pointer', fontFamily:'var(--font)', transition:'all .15s' }}>
              {mode.label}
            </button>
          ))}
          {selectedConv && (
            <div style={{ fontSize:'12px', color:'#9CA3AF', marginLeft:'8px' }}>
              {selectedConv.guests?.name || 'Guest'}{(selectedConv.guests?.room || selectedConv.guests?.guest_room) ? ` · Room ${selectedConv.guests?.room || selectedConv.guests?.guest_room}` : ''}
              {selectedConv.status === 'escalated' && <span style={{ color:'#DC2626', fontWeight:'700', marginLeft:'6px' }}>Needs reply</span>}
            </div>
          )}
        </div>

        {/* Chat thread */}
        {centreMode === 'chat' && (
          <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            {!selectedConv ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'#9CA3AF', fontSize:'13px' }}>
                Select a conversation to view the chat
              </div>
            ) : (
              <>
                <div className="scrollable" style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'8px' }}>
                  {(selectedConv.messages || []).map((msg, idx) => {
                    const isOut = msg.role === 'user'
                    return (
                      <div key={idx} style={{ display:'flex', gap:'8px', flexDirection:isOut?'row-reverse':'row', alignItems:'flex-end' }}>
                        <div style={{ maxWidth:'70%', padding:'10px 13px', borderRadius:isOut?'14px 4px 14px 14px':'4px 14px 14px 14px', background:isOut?'var(--green-800)':'white', color:isOut?'white':'#111827', fontSize:'12px', lineHeight:'1.6', border:isOut?'none':'0.5px solid #E5E7EB' }}>
                          {msg.content}
                          {msg.sent_by && <div style={{ fontSize:'10px', opacity:0.6, marginTop:'3px' }}>— {msg.sent_by}</div>}
                        </div>
                        <div style={{ fontSize:'10px', color:'#9CA3AF', flexShrink:0, paddingBottom:'3px' }}>
                          {new Date(msg.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={chatEndRef}/>
                </div>
                {canReply(session?.role) ? (
                  <div style={{ padding:'12px 16px', background:'white', borderTop:'0.5px solid var(--border)', display:'flex', gap:'10px', alignItems:'flex-end', flexShrink:0 }}>
                    <textarea value={replyText} onChange={e=>setReplyText(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleReply()} }}
                      placeholder="Type a reply to the guest... (Enter to send)"
                      style={{ flex:1, height:'56px', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'10px', fontSize:'13px', fontFamily:'var(--font)', resize:'none', outline:'none', color:'#111827' }}
                    />
                    <button onClick={handleReply} disabled={sending||!replyText.trim()}
                      style={{ padding:'10px 20px', background:replyText.trim()?'var(--green-800)':'#E5E7EB', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'600', color:replyText.trim()?'white':'#9CA3AF', cursor:replyText.trim()?'pointer':'not-allowed', fontFamily:'var(--font)', flexShrink:0, height:'56px' }}>
                      {sending?'...':'Send'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding:'12px', background:'#F9FAFB', borderTop:'0.5px solid var(--border)', fontSize:'12px', color:'#9CA3AF', textAlign:'center' }}>
                    Only reception staff can reply to guests
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Staff portal */}
        {centreMode === 'portal' && (
          <div className="scrollable" style={{ padding:'14px', display:'flex', flexDirection:'column', gap:'12px' }}>

            {/* Guest chip */}
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Guest</div>
              {selectedConv ? (
                <SelectedGuestChip conv={selectedConv} onClear={() => { setSelectedConv(null); setNoGuest(false) }} />
              ) : (
                <div style={{ padding:'12px', background:'white', borderRadius:'10px', border:'0.5px dashed #D1D5DB', textAlign:'center', fontSize:'12px', color:'#9CA3AF' }}>
                  Select a conversation from the left panel
                </div>
              )}
            </div>

            {/* Request type — 3-way split */}
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Request type</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'7px' }}>
                {[
                  { key:'external', label:'External booking', sub:'Taxi, restaurant…' },
                  { key:'internal', label:'Internal ticket',  sub:'Maintenance, HK…' },
                  { key:'facility', label:'Facility booking', sub:'Courts, spa, gym…' },
                ].map(t => (
                  <button key={t.key} onClick={() => setRequestType(t.key)}
                    style={{ padding:'10px 6px', borderRadius:'10px', border:'0.5px solid', textAlign:'center', cursor:'pointer', fontFamily:'var(--font)', transition:'all .15s', borderColor:requestType===t.key?'var(--green-800)':'#D1D5DB', background:requestType===t.key?'var(--green-800)':'white' }}>
                    <div style={{ fontSize:'12px', fontWeight:'700', color:requestType===t.key?'white':'#111827', marginBottom:'2px' }}>{t.label}</div>
                    <div style={{ fontSize:'10px', color:requestType===t.key?'rgba(255,255,255,0.65)':'#9CA3AF' }}>{t.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Partner picker — External only */}
            {requestType === 'external' && partners.filter(p => p.type === category && p.active !== false).length > 0 && (
              <div>
                <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Partner <span style={{ fontWeight:'400', color:'#9CA3AF' }}>(optional — leave blank for auto-match)</span></div>
                <select value={selectedPartner} onChange={e => setSelectedPartner(e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'9px', fontSize:'13px', color:'#111827', background:'white', cursor:'pointer', fontFamily:'var(--font)', outline:'none' }}>
                  <option value=''>Auto-select best partner</option>
                  {partners.filter(p => p.type === category && p.active !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.details?.car ? ' — ' + p.details.car : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Facility picker — Facility booking only */}
            {requestType === 'facility' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Facility</div>
                  <select value={facFacilityId} onChange={e => setFacFacilityId(e.target.value)} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'9px', fontSize:'13px', color:'#111827', background:'white', fontFamily:'var(--font)', outline:'none' }}>
                    <option value=''>Select facility…</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}{f.department ? ' — ' + f.department : ''}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div>
                    <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'5px' }}>Date</div>
                    <input type='date' value={facDate} onChange={e => setFacDate(e.target.value)} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'9px', fontSize:'13px', fontFamily:'var(--font)', outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'5px' }}>Time</div>
                    <input type='time' value={facTime} onChange={e => setFacTime(e.target.value)} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'9px', fontSize:'13px', fontFamily:'var(--font)', outline:'none', boxSizing:'border-box' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'5px' }}>Number of guests</div>
                  <input type='number' min='1' value={facPax} onChange={e => setFacPax(e.target.value)} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'9px', fontSize:'13px', fontFamily:'var(--font)', outline:'none', boxSizing:'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'5px' }}>Notes (optional)</div>
                  <textarea value={requestText} onChange={e=>setRequestText(e.target.value)}
                    placeholder='Any special requests or notes for the facility team…'
                    style={{ width:'100%', height:'48px', padding:'9px 12px', border:'0.5px solid #D1D5DB', borderRadius:'9px', fontSize:'12px', fontFamily:'var(--font)', outline:'none', resize:'none', boxSizing:'border-box' }} />
                </div>
              </div>
            )}

            {/* External categories — from API */}
            {requestType === 'external' && partnerTypes.length > 0 && (
              <div>
                <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Category</div>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  {partnerTypes.map(pt => {
                    const key = pt.name.toLowerCase()
                    const isSel = category === key
                    return (
                      <button key={pt.id} onClick={() => setCategory(key)}
                        style={{ padding:'5px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:'500', border:'0.5px solid', borderColor:isSel?'#C9A84C':'#D1D5DB', background:isSel?'rgba(201,168,76,0.1)':'white', color:isSel?'#78350F':'#374151', cursor:'pointer', fontFamily:'var(--font)' }}>
                        {pt.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Internal departments + categories — from API */}
            {requestType === 'internal' && departments.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Department</div>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                    {departments.map(dept => {
                      const isSel = department === dept.key
                      return (
                        <button key={dept.id} onClick={() => { setDepartment(dept.key); setDeptCategory('') }}
                          style={{ padding:'5px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:'500', border:'0.5px solid', borderColor:isSel?'var(--green-800)':'#D1D5DB', background:isSel?'var(--green-800)':'white', color:isSel?'white':'#374151', cursor:'pointer', fontFamily:'var(--font)' }}>
                          {dept.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Priority — new 3-level system */}
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Priority</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
                    {PRIORITIES.map(p => (
                      <button key={p.key} onClick={() => setPriority(p.key)}
                        style={{ padding:'8px', borderRadius:'8px', border:`0.5px solid ${priority===p.key?p.border:'#D1D5DB'}`, background:priority===p.key?p.bg:'white', cursor:'pointer', fontFamily:'var(--font)', textAlign:'center', transition:'all .15s' }}>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:priority===p.key?p.color:'#374151' }}>{p.label}</div>
                        <div style={{ fontSize:'10px', color:priority===p.key?p.color:'#9CA3AF', marginTop:'2px' }}>{p.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Details — only for external and internal, not facility (has Notes field above) */}
            {requestType !== 'facility' && (
              <div>
                <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Details</div>
                <textarea value={requestText} onChange={e=>setRequestText(e.target.value)}
                  placeholder={requestType==='external'?'e.g. Taxi to Larnaca airport at 6pm, 2 passengers':'e.g. AC not working in room, making strange noise'}
                  style={{ width:'100%', height:'56px', padding:'10px 12px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'10px', fontSize:'12px', color:'#111827', resize:'none', fontFamily:'var(--font)', outline:'none' }}
                />
              </div>
            )}

            {/* CTA */}
            {/* No guest toggle */}
            {!selectedConv && (
              <div style={{ marginBottom:'6px' }}>
                <button onClick={() => setNoGuest(g => !g)}
                  style={{ width:'100%', padding:'8px 12px', background: noGuest?'#F0FDF4':'white', border:`0.5px solid ${noGuest?'#86EFAC':'#D1D5DB'}`, borderRadius:'8px', fontSize:'12px', fontWeight: noGuest?'600':'400', color: noGuest?'#14532D':'#9CA3AF', cursor:'pointer', fontFamily:'var(--font)', textAlign:'center' }}>
                  No guest — Ticket without a guest
                </button>
              </div>
            )}
            <button onClick={handleSendRequest}
              disabled={sending || (requestType !== 'facility' && !requestText.trim()) || (!selectedConv && !noGuest)}
              style={{ width:'100%', padding:'11px', background: sent?'#16A34A':((requestType!=='facility'&&!requestText.trim())||(!selectedConv&&!noGuest))?'#E5E7EB':'var(--green-800)', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'700', color:((requestType!=='facility'&&!requestText.trim())||(!selectedConv&&!noGuest))?'#9CA3AF':'white', cursor:((requestType!=='facility'&&!requestText.trim())||(!selectedConv&&!noGuest))?'not-allowed':'pointer', fontFamily:'var(--font)', transition:'background 0.2s', letterSpacing:'0.2px' }}>
              {sent?'✓ Sent':sending?'Sending...':requestType==='external'?'Send request':requestType==='facility'?'Send Booking Confirmation':'Create internal ticket'}
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Issues · Upcoming · Completed ── */}
      <div style={{ borderLeft:'0.5px solid var(--border)', display:'flex', flexDirection:'column', background:'white', overflow:'hidden' }}>
        <div className="scrollable">

          {/* Cancellation alerts */}
          <CancellationAlerts hotelId={hotelId} session={session} isMobile={false} />

          {/* Escalated conversations */}
          <div style={{ borderBottom:'0.5px solid var(--border)' }}>
            {sh('Conversations needing reply', `${escalated.length} escalated`, escalated.length > 0)}
            {escalated.length === 0 ? (
              <div style={{ padding:'12px 14px', textAlign:'center', color:'#9CA3AF', fontSize:'12px' }}>No escalated conversations ✓</div>
            ) : escalated.map(c => {
              const g = c.guests || {}
              const lastMsg = c.messages?.[c.messages.length - 1]
              const preview = lastMsg?.content?.slice(0, 50) || 'No messages'
              return (
                <div key={c.id} onClick={() => setSelectedConv(c)}
                  style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px 14px', borderBottom:'0.5px solid var(--border)', background:'#FFF5F5', cursor:'pointer' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', flexShrink:0 }}>💬</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'2px' }}>
                      <span style={{ fontSize:'12px', fontWeight:'700', color:'#DC2626' }}>
                        {g.name ? `${g.name} ${g.surname||''}`.trim() : 'Guest'}
                      </span>
                      {g.room && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>Room {g.room}</span>}
                      <span style={{ marginLeft:'auto', fontSize:'10px', fontWeight:'700', padding:'1px 6px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626' }}>NEEDS REPLY</span>
                    </div>
                    <div style={{ fontSize:'11px', color:'#6B7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{preview}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Open tickets */}
          <div style={{ borderBottom:'0.5px solid var(--border)' }}>
            {sh('Open tickets', `${issues.length} need action`, issues.length > 0)}
            {issues.length === 0 ? (
              <div style={{ padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>All clear ✓</div>
            ) : issues.map(t => (
              <DesktopTicketRow
                key={t.id}
                t={t}
                session={session}
                conversations={conversations}
                onSelectConv={setSelectedConv}
                onSetCentreMode={setCentreMode}
                onReload={loadData}
              />
            ))}
          </div>

          {/* Upcoming */}
          <div style={{ borderBottom:'0.5px solid var(--border)' }}>
            {sh('Upcoming', 'today & tomorrow')}
            {upcoming.length === 0 ? (
              <div style={{ padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>No upcoming bookings</div>
            ) : upcoming.slice(0,8).map(b => (
              <ExpandableBookingDesktop key={b.id} b={b} />
            ))}
          </div>

          {/* Completed */}
          <div>
            {sh('Completed', `${completed.length} done`)}
            {completed.length === 0 ? (
              <div style={{ padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>None yet today</div>
            ) : completed.slice(0,6).map(b => {
              const guest = b.guests || {}
              const typeColors = { taxi:{l:'T'}, restaurant:{l:'R'}, activity:{l:'A'}, late_checkout:{l:'L'} }
              const tc = typeColors[b.type] || {l:'?'}
              return (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', borderBottom:'0.5px solid var(--border)' }}>
                  <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#D1D5DB', flexShrink:0 }}/>
                  <div style={{ width:'22px', height:'22px', borderRadius:'5px', background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#9CA3AF', flexShrink:0 }}>{tc.l}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'12px', color:'#6B7280' }}>{guest.name} · Room {guest.room || ''}</div>
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'1px' }}>{b.partners?.name || b.type}</div>
                  </div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>
                    {new Date(b.confirmed_at||b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </div>
  )
}
