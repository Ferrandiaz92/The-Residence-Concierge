// components/LiveTab.js (UI update)
// Changes:
// 1. Left col 240px, right col 260px, centre smaller
// 2. Better typography — larger fonts, bolder titles
// 3. Room number shows correctly
// 4. New priorities: Urgent / Today / Planned
// 5. Bigger centered request type buttons
// 6. Dynamic departments from API

'use client'
import { useState, useEffect, useRef } from 'react'
import DepartmentQueue from './DepartmentQueue'

const LANG_COLORS = {
  en: { bg:'#DCF5E7', color:'#14532D' },
  ru: { bg:'#DBEAFE', color:'#1E3A5F' },
  he: { bg:'#FEF3C7', color:'#78350F' },
}

const canReply   = (role) => ['receptionist','manager','admin'].includes(role)
const isDeptRole = (role) => ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk'].includes(role)

const PRIORITIES = [
  { key:'urgent',  label:'Urgent',  sub:'within 2h',   color:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5' },
  { key:'today',   label:'Today',   sub:'same day',    color:'#D97706', bg:'#FFFBEB', border:'#FCD34D' },
  { key:'planned', label:'Planned', sub:'future task', color:'#2563EB', bg:'#EFF6FF', border:'#93C5FD' },
]

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
  const [partnerTypes, setPartnerTypes]   = useState([])
  const [departments, setDepartments]     = useState([])
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (!hotelId) return
    loadData()
    loadConfig()
    const interval = setInterval(loadData, 20000)
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
    } catch {}
  }

  async function loadData() {
    const [convRes, bookRes, tickRes] = await Promise.all([
      fetch(`/api/conversations?hotelId=${hotelId}`),
      fetch(`/api/bookings?hotelId=${hotelId}`),
      fetch(`/api/tickets?hotelId=${hotelId}`),
    ])
    const [convData, bookData, tickData] = await Promise.all([convRes.json(), bookRes.json(), tickRes.json()])
    setConversations(convData.conversations || [])
    setBookings(bookData.bookings || [])
    setTickets(tickData.tickets || [])
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
      const res  = await fetch(`/api/conversations?hotelId=${hotelId}`)
      const data = await res.json()
      const updated = (data.conversations||[]).find(c => c.id === selectedConv.id)
      if (updated) setSelectedConv(updated)
    } finally { setSending(false) }
  }

  async function handleSendRequest() {
    if (!requestText.trim() || !selectedConv) return
    setSending(true)
    try {
      const endpoint = requestType === 'external' ? '/api/bookings' : '/api/tickets'
      const body = requestType === 'external'
        ? { hotelId, guestId: selectedConv.guests?.id, type: category, details: { description: requestText }, createdBy: `staff:${session?.name||''}` }
        : { hotelId, guestId: selectedConv.guests?.id, department, category: deptCategory || department, description: requestText, room: selectedConv.guests?.room || selectedConv.guests?.guest_room, priority, createdBy: `staff:${session?.name||''}` }
      await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
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
    <div style={{ display:'grid', gridTemplateColumns:'240px 1fr 260px', height:'100%', overflow:'hidden' }}>

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
            const isActive   = selectedConv?.id === conv.id
            const isEsc      = conv.status === 'escalated'
            const minsAgo    = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
            const timeLabel  = minsAgo === 0 ? 'now' : minsAgo < 60 ? `${minsAgo}m` : `${Math.floor(minsAgo/60)}h`
            // Room number — check multiple fields
            const roomNum    = guest.room || guest.guest_room || guest.guest_room_number || '?'

            return (
              <div key={conv.id} onClick={() => { setSelectedConv(conv); setCentreMode('chat') }}
                style={{ padding:'11px 14px', borderBottom:'0.5px solid var(--border)', borderLeft:isActive?'3px solid var(--gold)':isEsc?'3px solid #DC2626':'3px solid transparent', background:isActive?'rgba(201,168,76,0.06)':isEsc?'rgba(220,38,38,0.03)':'white', cursor:'pointer' }}
                onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='#F9FAFB' }}
                onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background=isEsc?'rgba(220,38,38,0.03)':'white' }}
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
                <div style={{ fontSize:'12px', fontWeight:'500', color:'#6B7280', marginBottom:'5px' }}>
                  Room {roomNum}
                </div>
                <div style={{ fontSize:'11px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'200px' }}>
                  {isEsc
                    ? <span style={{ color:'#DC2626', fontWeight:'600' }}>REPLY NEEDED</span>
                    : last?.content || 'No messages yet'
                  }
                </div>
                <div style={{ marginTop:'5px', display:'flex', gap:'4px' }}>
                  <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'5px', background:lc.bg, color:lc.color }}>
                    {lang.toUpperCase()}
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
              {selectedConv.guests?.name} · Room {selectedConv.guests?.room || selectedConv.guests?.guest_room || '?'}
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
                <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'white', borderRadius:'10px', border:'0.5px solid #E5E7EB' }}>
                  <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'var(--green-800)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:'var(--gold)', fontWeight:'700', flexShrink:0 }}>
                    {(selectedConv.guests?.name?.[0]||'?')}{(selectedConv.guests?.surname?.[0]||'')}
                  </div>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{selectedConv.guests?.name} {selectedConv.guests?.surname}</div>
                    <div style={{ fontSize:'12px', color:'#6B7280' }}>Room {selectedConv.guests?.room || selectedConv.guests?.guest_room || '?'} · {(selectedConv.guests?.language||'EN').toUpperCase()}</div>
                  </div>
                  <button onClick={()=>setSelectedConv(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:'#D1D5DB', cursor:'pointer', fontSize:'18px', lineHeight:1 }}>×</button>
                </div>
              ) : (
                <div style={{ padding:'12px', background:'white', borderRadius:'10px', border:'0.5px dashed #D1D5DB', textAlign:'center', fontSize:'12px', color:'#9CA3AF' }}>
                  Select a conversation from the left panel
                </div>
              )}
            </div>

            {/* Request type — big centered buttons */}
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Request type</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                {[
                  { key:'external', label:'External booking', sub:'Taxi, restaurant, activity...' },
                  { key:'internal', label:'Internal request',  sub:'Housekeeping, maintenance...' },
                ].map(t => (
                  <button key={t.key} onClick={() => setRequestType(t.key)}
                    style={{ padding:'12px', borderRadius:'10px', border:'0.5px solid', textAlign:'center', cursor:'pointer', fontFamily:'var(--font)', transition:'all .15s', borderColor:requestType===t.key?'var(--green-800)':'#D1D5DB', background:requestType===t.key?'var(--green-800)':'white' }}>
                    <div style={{ fontSize:'13px', fontWeight:'700', color:requestType===t.key?'white':'#111827', marginBottom:'3px' }}>{t.label}</div>
                    <div style={{ fontSize:'11px', color:requestType===t.key?'rgba(255,255,255,0.7)':'#9CA3AF' }}>{t.sub}</div>
                  </button>
                ))}
              </div>
            </div>

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

            {/* Details */}
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Details</div>
              <textarea value={requestText} onChange={e=>setRequestText(e.target.value)}
                placeholder={requestType==='external'?'e.g. Taxi to Larnaca airport at 6pm, 2 passengers':'e.g. AC not working in room, making strange noise'}
                style={{ width:'100%', height:'56px', padding:'10px 12px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'10px', fontSize:'12px', color:'#111827', resize:'none', fontFamily:'var(--font)', outline:'none' }}
              />
            </div>

            {/* CTA */}
            <button onClick={handleSendRequest} disabled={sending||!requestText.trim()||!selectedConv}
              style={{ width:'100%', padding:'11px', background:sent?'#16A34A':(!requestText.trim()||!selectedConv)?'#E5E7EB':'var(--green-800)', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'700', color:(!requestText.trim()||!selectedConv)?'#9CA3AF':'white', cursor:(!requestText.trim()||!selectedConv)?'not-allowed':'pointer', fontFamily:'var(--font)', transition:'background 0.2s', letterSpacing:'0.2px' }}>
              {sent?'✓ Sent successfully':sending?'Sending...':requestType==='external'?'Send request':'Create internal ticket'}
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Issues · Upcoming · Completed ── */}
      <div style={{ borderLeft:'0.5px solid var(--border)', display:'flex', flexDirection:'column', background:'white', overflow:'hidden' }}>
        <div className="scrollable">

          {/* Issues */}
          <div style={{ borderBottom:'0.5px solid var(--border)' }}>
            {sh('Issues & alerts', `${issues.length} need action`, issues.length > 0)}
            {issues.length === 0 ? (
              <div style={{ padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>All clear ✓</div>
            ) : issues.map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px 14px', borderBottom:'0.5px solid var(--border)' }}>
                <div style={{ width:'20px', height:'20px', borderRadius:'6px', background:t.priority==='urgent'?'#FEE2E2':'#FFFBEB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', flexShrink:0, marginTop:'1px' }}>
                  {t.priority==='urgent'?'!':'↩'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#111827', marginBottom:'2px' }}>
                    {t.description?.slice(0,40)}
                    {t.priority==='urgent' && <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 6px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626', marginLeft:'5px' }}>urgent</span>}
                  </div>
                  <div style={{ fontSize:'11px', color:'#6B7280' }}>Room {t.room} · {t.department} · {t.status}</div>
                  <button style={{ fontSize:'11px', fontWeight:'600', padding:'3px 9px', borderRadius:'5px', border:'0.5px solid #FCD34D', background:'#FFFBEB', color:'#D97706', cursor:'pointer', marginTop:'5px', fontFamily:'var(--font)' }}>
                    {t.escalation_level===0?'Call supervisor':t.escalation_level===1?'Call team':'Contact manager'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Upcoming */}
          <div style={{ borderBottom:'0.5px solid var(--border)' }}>
            {sh('Upcoming', 'today & tomorrow')}
            {upcoming.length === 0 ? (
              <div style={{ padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>No upcoming bookings</div>
            ) : upcoming.slice(0,8).map(b => {
              const guest = b.guests || {}
              const typeColors = { taxi:{bg:'#DCFCE7',color:'#14532D',l:'T'}, restaurant:{bg:'#DBEAFE',color:'#1E3A5F',l:'R'}, activity:{bg:'#FEF3C7',color:'#78350F',l:'A'}, late_checkout:{bg:'#FAF5FF',color:'#581C87',l:'L'} }
              const tc = typeColors[b.type] || {bg:'#F1F5F9',color:'#334155',l:'?'}
              return (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', borderBottom:'0.5px solid var(--border)' }}>
                  <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#16A34A', flexShrink:0 }}/>
                  <div style={{ width:'22px', height:'22px', borderRadius:'5px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:tc.color, flexShrink:0 }}>{tc.l}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'12px', fontWeight:'600', color:'#111827' }}>{guest.name} · Room {guest.room || '?'}</div>
                    <div style={{ fontSize:'11px', color:'#6B7280', marginTop:'1px' }}>{b.partners?.name || b.type}</div>
                  </div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151' }}>
                    {b.details?.time || new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              )
            })}
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
                    <div style={{ fontSize:'12px', color:'#6B7280' }}>{guest.name} · Room {guest.room || '?'}</div>
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
