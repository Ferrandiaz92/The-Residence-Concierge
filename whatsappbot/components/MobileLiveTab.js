// components/MobileLiveTab.js — v4
// Fixes:
//   - Removed onSelectGuest() calls that were hijacking to Guests tab
//   - Portal is now a 3rd subtab (Chats | Portal | Issues), not full-screen
//   - ChatThread: fixed scroll-to-bottom, fixed textarea input
//   - Conv selection stays within Live tab entirely

'use client'
import { useState, useEffect, useRef } from 'react'

const LANG_COLORS = {
  en:{bg:'#DCFCE7',color:'#14532D',name:'English'},
  ru:{bg:'#DBEAFE',color:'#1E3A5F',name:'Russian'},
  he:{bg:'#FEF3C7',color:'#78350F',name:'Hebrew'},
  de:{bg:'#F3F4F6',color:'#1F2937',name:'German'},
  fr:{bg:'#EDE9FE',color:'#4C1D95',name:'French'},
  zh:{bg:'#FEF2F2',color:'#7F1D1D',name:'Chinese'},
  pl:{bg:'#FFF1F2',color:'#881337',name:'Polish'},
  sv:{bg:'#EFF6FF',color:'#1E3A8A',name:'Swedish'},
  fi:{bg:'#F0F9FF',color:'#0C4A6E',name:'Finnish'},
  uk:{bg:'#FEFCE8',color:'#713F12',name:'Ukrainian'},
  ar:{bg:'#F0FDF4',color:'#14532D',name:'Arabic'},
  nl:{bg:'#FFF7ED',color:'#7C2D12',name:'Dutch'},
  el:{bg:'#EFF6FF',color:'#1E3A8A',name:'Greek'},
  es:{bg:'#FFF7ED',color:'#9A3412',name:'Spanish'},
  ca:{bg:'#FEF9C3',color:'#713F12',name:'Catalan'},
  it:{bg:'#F0FDF4',color:'#14532D',name:'Italian'},
  pt:{bg:'#ECFDF5',color:'#064E3B',name:'Portuguese'},
}

const PRIORITIES = [
  { key:'urgent',  label:'Urgent',  sub:'within 2h',   color:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5' },
  { key:'today',   label:'Today',   sub:'same day',    color:'#D97706', bg:'#FFFBEB', border:'#FCD34D' },
  { key:'planned', label:'Planned', sub:'future task', color:'#2563EB', bg:'#EFF6FF', border:'#93C5FD' },
]

const canReply   = (role) => ['receptionist','manager','admin','supervisor'].includes(role)
const DEPT_ROLES = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk']

// ── Back button ──────────────────────────────────────────────
function BackBtn({ onBack, label }) {
  return (
    <button onClick={onBack}
      style={{ display:'flex', alignItems:'center', gap:'4px', background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:'6px 4px', fontFamily:"'DM Sans', sans-serif", fontSize:'13px', fontWeight:'500', flexShrink:0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label}
    </button>
  )
}

// ── Guest chip ───────────────────────────────────────────────
function GuestChip({ conv }) {
  if (!conv) return null
  const g    = conv.guests || {}
  const room = g.room || g.guest_room || '?'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0 }}>
      <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
        {(g.name?.[0]||'?')}{(g.surname?.[0]||'')}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {g.name||'Guest'} {g.surname||''}
        </div>
        <div style={{ fontSize:'11px', color:'#9CA3AF' }}>Room {room}</div>
      </div>
      {conv.status === 'escalated' && (
        <span style={{ fontSize:'9px', fontWeight:'700', padding:'2px 6px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626', flexShrink:0, marginLeft:'4px' }}>Needs reply</span>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  CONVERSATIONS LIST
// ════════════════════════════════════════════════════════════
function ConversationsList({ conversations, selectedConvId, onOpenThread }) {
  const escalated = conversations.filter(c => c.status === 'escalated')

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>
      {escalated.length > 0 && (
        <div style={{ padding:'9px 16px', background:'#FEF2F2', borderBottom:'1px solid #FCA5A5', fontSize:'12px', fontWeight:'600', color:'#DC2626', display:'flex', alignItems:'center', gap:'6px' }}>
          ⚠️ {escalated.length} conversation{escalated.length > 1 ? 's' : ''} need{escalated.length === 1 ? 's' : ''} reply
        </div>
      )}
      {conversations.length === 0 && (
        <div style={{ padding:'48px 24px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>
          No active conversations
        </div>
      )}
      {conversations.map(conv => {
        const g       = conv.guests || {}
        const msgs    = conv.messages || []
        const last    = msgs[msgs.length - 1]
        const lc      = LANG_COLORS[g.language || 'en'] || LANG_COLORS.en
        const isEsc   = conv.status === 'escalated'
        const isActive= selectedConvId === conv.id
        const mins    = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
        const time    = mins === 0 ? 'now' : mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h`
        const room    = g.room || g.guest_room || null

        // Stay status color coding
        const stayStatus  = g.stay_status || 'prospect'
        const statusBorder = isEsc       ? '3px solid #DC2626'
          : isActive                     ? '3px solid #C9A84C'
          : stayStatus === 'active'      ? '3px solid #16A34A'
          : stayStatus === 'checked_out' ? '3px solid #D1D5DB'
          : stayStatus === 'pre_arrival' ? '3px solid #60A5FA'
          : '3px solid transparent'  // prospect
        const statusBg = isActive ? 'rgba(28,61,46,0.04)'
          : isEsc                        ? 'rgba(220,38,38,0.02)'
          : stayStatus === 'checked_out' ? '#FAFAFA'
          : 'white'

        return (
          <div key={conv.id}
            onClick={() => onOpenThread(conv)}
            style={{
              padding:'14px 16px', background: statusBg,
              borderBottom:'1px solid #F3F4F6',
              borderLeft: statusBorder,
              cursor:'pointer', display:'flex', gap:'12px', alignItems:'flex-start',
            }}>
            <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
              {(g.name?.[0]||'?').toUpperCase()}{(g.surname?.[0]||'').toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2px' }}>
                <span style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>{g.name||'Guest'} {g.surname||''}</span>
                <span style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0, marginLeft:'8px' }}>{time}</span>
              </div>
              <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'5px', flexWrap:'wrap' }}>
                {/* Prospect — no room, just label */}
                {stayStatus === 'prospect' && <span>New visitor</span>}
                {/* Pre-arrival — show check-in date, no room yet */}
                {stayStatus === 'pre_arrival' && <>
                  <span>{g.check_in ? `Arriving ${new Date(g.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` : 'Arriving soon'}</span>
                  <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 5px', borderRadius:'3px', background:'#DBEAFE', color:'#1E3A5F' }}>ARRIVING</span>
                </>}
                {/* Active — room + check-out date */}
                {stayStatus === 'active' && <>
                  {room && <span>Room {room}</span>}
                  {g.check_out && <span style={{ color:'#9CA3AF' }}>· Out {new Date(g.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                </>}
                {/* Checked out — room + badge */}
                {stayStatus === 'checked_out' && <>
                  {room && <span>Room {room}</span>}
                  <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 5px', borderRadius:'3px', background:'#F3F4F6', color:'#6B7280' }}>CHECKED OUT</span>
                </>}
              </div>
              <div style={{ fontSize:'12px', color: isEsc ? '#DC2626' : '#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isEsc ? '600' : '400' }}>
                {isEsc ? '↩ Reply needed' : (last?.content || 'No messages')}
              </div>
              <div style={{ marginTop:'5px' }}>
                <span style={{ fontSize:'10px', fontWeight:'600', padding:'2px 7px', borderRadius:'5px', background:lc.bg, color:lc.color }}>{lc.name}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  CHAT THREAD — full-screen slide-in
// ════════════════════════════════════════════════════════════
function ChatThread({ conv, session, onBack, onReload }) {
  const [replyText, setReplyText] = useState('')
  const [sending,   setSending]   = useState(false)
  const scrollRef = useRef(null)

  // Scroll to bottom whenever conv changes or messages update
  useEffect(() => {
    if (!scrollRef.current) return
    // Use requestAnimationFrame to ensure DOM has painted
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [conv?.id, conv?.messages?.length])

  async function send() {
    if (!replyText.trim() || !conv || sending) return
    setSending(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conv.id,
          guestPhone:     conv.guests?.phone,
          message:        replyText.trim(),
        }),
      })
      setReplyText('')
      onReload?.()
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const messages = conv?.messages || []
  const g        = conv?.guests   || {}
  const room     = g.room || g.guest_room || '?'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'#F9FAFB' }}>

      {/* Header */}
      <div style={{ padding:'10px 16px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
        <BackBtn onBack={onBack} label="Back" />
        <GuestChip conv={conv} />
      </div>

      {/* Messages scroll area */}
      <div
        ref={scrollRef}
        style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px', WebkitOverflowScrolling:'touch' }}>
        {messages.length === 0 && (
          <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:'13px', marginTop:'40px' }}>
            No messages yet
          </div>
        )}
        {messages.map((msg, i) => {
          const isOut = msg.role === 'user'
          return (
            <div key={i} style={{ display:'flex', flexDirection: isOut ? 'row-reverse' : 'row', gap:'8px', alignItems:'flex-end' }}>
              <div style={{
                maxWidth:'78%', padding:'10px 14px',
                borderRadius: isOut ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                background: isOut ? '#1C3D2E' : 'white',
                color: isOut ? 'white' : '#111827',
                fontSize:'13px', lineHeight:'1.55',
                border: isOut ? 'none' : '1px solid #E5E7EB',
                wordBreak: 'break-word',
              }}>
                {msg.content}
                {msg.sent_by && <div style={{ fontSize:'10px', opacity:0.5, marginTop:'4px' }}>— {msg.sent_by}</div>}
              </div>
              <div style={{ fontSize:'10px', color:'#9CA3AF', paddingBottom:'3px', flexShrink:0 }}>
                {new Date(msg.ts).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reply input — only for reception/manager/admin */}
      {canReply(session?.role) ? (
        <div style={{ padding:'10px 16px 10px', background:'white', borderTop:'1px solid #E5E7EB', display:'flex', gap:'8px', alignItems:'flex-end', flexShrink:0, paddingBottom:'max(10px, env(safe-area-inset-bottom))' }}>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply to guest…"
            rows={2}
            style={{
              flex:1, padding:'10px 13px',
              border:'1px solid #D1D5DB', borderRadius:'12px',
              fontSize:'16px', // 16px prevents iOS zoom on focus
              fontFamily:"'DM Sans', sans-serif",
              resize:'none', outline:'none', color:'#111827', lineHeight:'1.4',
              WebkitAppearance:'none',
            }}
          />
          <button
            onClick={send}
            disabled={sending || !replyText.trim()}
            style={{
              padding:'10px 16px',
              background: replyText.trim() ? '#1C3D2E' : '#E5E7EB',
              border:'none', borderRadius:'12px',
              fontSize:'14px', fontWeight:'600',
              color: replyText.trim() ? 'white' : '#9CA3AF',
              cursor: replyText.trim() ? 'pointer' : 'not-allowed',
              fontFamily:"'DM Sans', sans-serif",
              flexShrink:0, alignSelf:'flex-end', height:'44px',
            }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      ) : (
        <div style={{ padding:'12px 16px', background:'#F9FAFB', borderTop:'1px solid #E5E7EB', fontSize:'12px', color:'#9CA3AF', textAlign:'center' }}>
          Only reception staff can reply
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  STAFF PORTAL — subtab, shows conv list on left + form
// ════════════════════════════════════════════════════════════
function StaffPortal({ conversations, selectedConv, onSelectConv, session, hotelId }) {
  const [reqType,      setReqType]      = useState('external')
  const [category,     setCategory]     = useState('')
  const [department,   setDepartment]   = useState('')
  const [deptCategory, setDeptCategory] = useState('')
  const [priority,     setPriority]     = useState('today')
  const [details,      setDetails]      = useState('')
  const [sending,      setSending]      = useState(false)
  const [sent,         setSent]         = useState(false)
  const [partnerTypes, setPartnerTypes] = useState([])
  const [departments,  setDepartments]  = useState([])
  const [showConvPicker, setShowConvPicker] = useState(false)
  const [noGuest,        setNoGuest]        = useState(false)

  useEffect(() => {
    if (!hotelId) return
    fetch(`/api/config?hotelId=${hotelId}`)
      .then(r => r.json())
      .then(d => {
        setPartnerTypes(d.partnerTypes || [])
        setDepartments(d.departments  || [])
        if (d.partnerTypes?.[0]) setCategory(d.partnerTypes[0].name.toLowerCase())
        if (d.departments?.[0])  setDepartment(d.departments[0].key)
      }).catch(() => {})
  }, [hotelId])

  async function handleSend() {
    if (!details.trim() || sending) return
    if (!selectedConv && !noGuest) return
    setSending(true)
    try {
      const endpoint = reqType === 'external' ? '/api/bookings' : '/api/tickets'
      const body = reqType === 'external'
        ? { hotelId, guestId: selectedConv.guests?.id, type: category, details: { description: details }, createdBy: `staff:${session?.name||''}` }
        : { hotelId, guestId: selectedConv?.guests?.id || null, department, category: deptCategory||department, description: details, room: selectedConv?.guests?.room||selectedConv?.guests?.guest_room||null, priority, createdBy: `staff:${session?.name||''}` }
      await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      setSent(true); setDetails('')
      setTimeout(() => setSent(false), 3000)
    } finally { setSending(false) }
  }

  const g = selectedConv?.guests || {}

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>
      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:'14px' }}>

        {/* ── Guest selector ── */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Guest</div>

          {/* Selected guest chip */}
          {selectedConv ? (
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 14px', background:'white', borderRadius:'12px', border:'1px solid #E5E7EB' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                {(g.name?.[0]||'?').toUpperCase()}{(g.surname?.[0]||'').toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{g.name||'Guest'} {g.surname||''}</div>
                <div style={{ fontSize:'12px', color:'#6B7280' }}>
                  {(g.room||g.guest_room) ? `Room ${g.room||g.guest_room}` : 'No room assigned'}
                </div>
              </div>
              <button onClick={() => setShowConvPicker(s => !s)}
                style={{ fontSize:'12px', fontWeight:'600', padding:'5px 10px', borderRadius:'8px', border:'1px solid #D1D5DB', background:'white', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", flexShrink:0 }}>
                Change
              </button>
            </div>
          ) : (
            <button onClick={() => setShowConvPicker(s => !s)}
              style={{ width:'100%', padding:'14px', background:'white', border:'1px dashed #D1D5DB', borderRadius:'12px', textAlign:'center', fontSize:'13px', color:'#9CA3AF', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              Select a guest conversation →
            </button>
          )}

          {/* Conv picker dropdown */}
          {showConvPicker && (
            <div style={{ marginTop:'8px', background:'white', borderRadius:'12px', border:'1px solid #E5E7EB', overflow:'hidden', maxHeight:'220px', overflowY:'auto' }}>
              {conversations.length === 0 && (
                <div style={{ padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>No active conversations</div>
              )}
              {conversations.map(conv => {
                const cg         = conv.guests || {}
                const room       = cg.room || cg.guest_room
                const isSelected = selectedConv?.id === conv.id
                const isEsc      = conv.status === 'escalated'
                const stay       = cg.stay_status || 'prospect'
                const leftBorder = isEsc             ? '3px solid #DC2626'
                  : stay === 'active'                ? '3px solid #16A34A'
                  : stay === 'pre_arrival'            ? '3px solid #60A5FA'
                  : stay === 'checked_out'            ? '3px solid #D1D5DB'
                  : '3px solid transparent'
                return (
                  <div key={conv.id}
                    onClick={() => { onSelectConv(conv); setShowConvPicker(false); setNoGuest(false) }}
                    style={{ padding:'11px 14px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', borderLeft: leftBorder, background: isSelected ? 'rgba(28,61,46,0.06)' : 'white' }}>
                    <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                      {(cg.name?.[0]||'?').toUpperCase()}{(cg.surname?.[0]||'').toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color: isEsc?'#DC2626':'#111827' }}>{cg.name||'Guest'} {cg.surname||''}</div>
                      <div style={{ fontSize:'11px', color:'#9CA3AF' }}>
                        {room ? `Room ${room}` : 'New visitor'}
                        {isEsc ? ' · Needs reply' : ''}
                      </div>
                    </div>
                    {isSelected && <span style={{ fontSize:'12px', color:'#C9A84C', flexShrink:0 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* No guest option — hidden when conv selected, grey/green toggle otherwise */}
          {!selectedConv && (
            <div style={{ marginTop:'8px' }}>
              <button
                onClick={() => { setNoGuest(g => !g); setShowConvPicker(false) }}
                style={{
                  width:'100%', padding:'10px 14px',
                  background: noGuest ? '#F0FDF4' : 'white',
                  border: `1px solid ${noGuest ? '#86EFAC' : '#E5E7EB'}`,
                  borderRadius:'10px', textAlign:'center', cursor:'pointer',
                  fontFamily:"'DM Sans', sans-serif",
                  fontSize:'12px', fontWeight: noGuest ? '600' : '400',
                  color: noGuest ? '#14532D' : '#9CA3AF',
                }}>
                No guest — Ticket without a guest
              </button>
            </div>
          )}
        </div>

        {/* ── Request type ── */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Request type</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            {[
              { key:'external', label:'External booking', sub:'Taxi, restaurant…' },
              { key:'internal', label:'Internal request',  sub:'Housekeeping, maint…' },
            ].map(t => (
              <button key={t.key} onClick={() => setReqType(t.key)}
                style={{ padding:'12px 10px', borderRadius:'12px', border:'1px solid', textAlign:'center', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", borderColor: reqType===t.key?'#1C3D2E':'#E5E7EB', background: reqType===t.key?'#1C3D2E':'white' }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color: reqType===t.key?'white':'#111827', marginBottom:'3px' }}>{t.label}</div>
                <div style={{ fontSize:'11px', color: reqType===t.key?'rgba(255,255,255,0.6)':'#9CA3AF' }}>{t.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── External categories ── */}
        {reqType === 'external' && partnerTypes.length > 0 && (
          <div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Category</div>
            <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
              {partnerTypes.map(pt => {
                const k   = pt.name.toLowerCase()
                const sel = category === k
                return (
                  <button key={pt.id} onClick={() => setCategory(k)}
                    style={{ padding:'7px 14px', borderRadius:'20px', fontSize:'13px', fontWeight:'500', border:'1px solid', borderColor: sel?'#C9A84C':'#E5E7EB', background: sel?'rgba(201,168,76,0.1)':'white', color: sel?'#78350F':'#374151', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {pt.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Internal dept + priority ── */}
        {reqType === 'internal' && departments.length > 0 && (
          <>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Department</div>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {departments.map(d => {
                  const sel = department === d.key
                  return (
                    <button key={d.id} onClick={() => { setDepartment(d.key); setDeptCategory('') }}
                      style={{ padding:'7px 14px', borderRadius:'20px', fontSize:'13px', fontWeight:'500', border:'1px solid', borderColor: sel?'#1C3D2E':'#E5E7EB', background: sel?'#1C3D2E':'white', color: sel?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                      {d.name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Priority</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'7px' }}>
                {PRIORITIES.map(p => (
                  <button key={p.key} onClick={() => setPriority(p.key)}
                    style={{ padding:'10px 6px', borderRadius:'10px', border:`1px solid ${priority===p.key?p.border:'#E5E7EB'}`, background: priority===p.key?p.bg:'white', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", textAlign:'center' }}>
                    <div style={{ fontSize:'12px', fontWeight:'700', color: priority===p.key?p.color:'#374151' }}>{p.label}</div>
                    <div style={{ fontSize:'10px', color: priority===p.key?p.color:'#9CA3AF', marginTop:'2px' }}>{p.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Details ── */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Details</div>
          <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3}
            placeholder={reqType==='external' ? 'e.g. Taxi to airport at 6pm, 2 passengers' : 'e.g. AC not working in room'}
            style={{ width:'100%', padding:'12px 14px', background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', fontSize:'16px', color:'#111827', resize:'none', fontFamily:"'DM Sans', sans-serif", outline:'none', lineHeight:'1.5', WebkitAppearance:'none' }}
          />
        </div>

        {/* ── Send button ── */}
        <button onClick={handleSend}
          disabled={sending || !details.trim() || (!selectedConv && !noGuest)}
          style={{
            width:'100%', padding:'14px',
            background: sent ? '#16A34A' : (!details.trim() || (!selectedConv && !noGuest)) ? '#E5E7EB' : '#1C3D2E',
            border:'none', borderRadius:'12px', fontSize:'15px', fontWeight:'700',
            color: (!details.trim() || (!selectedConv && !noGuest)) ? '#9CA3AF' : 'white',
            cursor: (!details.trim() || (!selectedConv && !noGuest)) ? 'not-allowed' : 'pointer',
            fontFamily:"'DM Sans', sans-serif",
          }}>
          {sent ? '✓ Created!' : sending ? 'Creating…' : reqType==='external' ? 'Send booking request' : 'Create ticket'}
        </button>

        <div style={{ height:'20px' }}/>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  ISSUES PANEL
// ════════════════════════════════════════════════════════════

function ExpandableBooking({ booking: b, guest: g, tc }) {
  const [open, setOpen] = useState(false)
  const typeEmoji = { taxi:'🚗', restaurant:'🍽️', activity:'⛵', late_checkout:'🕐' }
  const emoji = typeEmoji[b.type] || '📋'
  return (
    <div style={{ background:'white', borderBottom:'1px solid #F3F4F6' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', background: open ? '#F9FAFB' : 'white' }}>
        <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>{emoji}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{g.name}{g.room ? ` · Room ${g.room}` : ''}</div>
          <div style={{ fontSize:'12px', color:'#6B7280' }}>{b.partners?.name || b.type}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151' }}>
            {b.details?.time || new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
          </div>
          <div style={{ width:'24px', height:'24px', borderRadius:'6px', background: open ? '#1C3D2E' : '#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .2s' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke={open ? 'white' : '#6B7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ padding:'10px 16px 14px 56px', background:'#F9FAFB', borderTop:'1px solid #F3F4F6' }}>
          <div style={{ fontSize:'12px', color:'#374151', display:'flex', flexDirection:'column', gap:'5px' }}>
            {b.details?.destination && <div>📍 <strong>To:</strong> {b.details.destination}</div>}
            {b.details?.pax         && <div>👥 <strong>Passengers:</strong> {b.details.pax}</div>}
            {b.details?.date        && <div>📅 <strong>Date:</strong> {b.details.date}</div>}
            {b.details?.time        && <div>🕐 <strong>Time:</strong> {b.details.time}</div>}
            {b.details?.notes       && <div>📝 <strong>Notes:</strong> {b.details.notes}</div>}
            {b.commission_amount > 0 && <div>💰 <strong>Commission:</strong> €{b.commission_amount}</div>}
            <div style={{ marginTop:'4px' }}>
              <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'5px',
                background: b.status==='confirmed'?'#DCFCE7':'#FEF3C7',
                color:      b.status==='confirmed'?'#14532D':'#78350F',
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


function TicketAlertRow({ ticket: t, depts = [], isPrivileged = false }) {
  const [updating, setUpdating] = useState(false)

  async function reassign(newDept) {
    setUpdating(true)
    try {
      await fetch('/api/tickets', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: t.id, status: t.status, department: newDept }),
      })
    } finally { setUpdating(false) }
  }

  return (
    <div style={{ padding:'14px 16px', background:'white', borderBottom:'1px solid #F3F4F6' }}>
      <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
        <div style={{ width:'28px', height:'28px', borderRadius:'8px', background: t.priority==='urgent'?'#FEE2E2':'#FFFBEB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>
          {t.priority==='urgent'?'🚨':'⚠️'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'2px' }}>{t.description?.slice(0,70)}{t.description?.length>70?'…':''}</div>
          <div style={{ fontSize:'12px', color:'#6B7280' }}>
            {t.room ? `Room ${t.room} · ` : ''}{t.department} · <span style={{ color: t.status==='escalated'?'#DC2626':'#D97706', textTransform:'capitalize' }}>{t.status}</span>
          </div>
          {t.priority==='urgent' && <span style={{ display:'inline-block', marginTop:'4px', fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626' }}>URGENT</span>}
        </div>
      </div>
      {/* Reassign — supervisor + manager only */}
      {isPrivileged && depts.length > 0 && (
        <select onChange={e => { if (e.target.value) { reassign(e.target.value); e.target.value = '' } }}
          style={{ width:'100%', marginTop:'10px', padding:'8px 10px', border:'0.5px solid #E5E7EB', borderRadius:'8px', fontSize:'12px', color:'#6B7280', background:'white', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
          <option value=''>↩ Reassign to department…</option>
          {depts.map(d => (
            <option key={d.id} value={d.key} disabled={d.key === t.department}>
              {d.name}{d.key === t.department ? ' (current)' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function IssuesPanel({ tickets, bookings, conversations = [], onOpenThread, session, hotelId }) {
  const escalatedChats = conversations.filter(c => c.status === 'escalated')
  const issues         = tickets.filter(t => !['resolved','cancelled'].includes(t.status))
  const upcoming       = bookings.filter(b => ['confirmed','pending'].includes(b.status))
  const done           = bookings.filter(b => ['completed','resolved'].includes(b.status))
  const typeColors     = { taxi:{bg:'#DCFCE7',color:'#14532D',l:'T'}, restaurant:{bg:'#DBEAFE',color:'#1E3A5F',l:'R'}, activity:{bg:'#FEF3C7',color:'#78350F',l:'A'} }
  const totalAlerts    = escalatedChats.length + issues.length
  const [depts, setDepts] = useState([])
  const isSupervisorOrManager = ['supervisor','manager','admin'].includes(session?.role)

  useEffect(() => {
    if (!isSupervisorOrManager || !hotelId) return
    fetch(`/api/config?hotelId=${hotelId}`)
      .then(r => r.json())
      .then(d => setDepts(d.departments || []))
      .catch(() => {})
  }, [hotelId])

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>

      {/* Escalated conversations */}
      <SectionHeader title="Conversations needing reply" badge={escalatedChats.length} badgeBg="#FEE2E2" badgeColor="#DC2626" />
      {escalatedChats.length === 0
        ? <EmptyRow text="No escalated conversations ✓" />
        : escalatedChats.map(c => {
          const g = c.guests || {}
          const lastMsg = c.messages?.[c.messages.length - 1]
          const preview = lastMsg?.content?.slice(0, 60) || 'No messages'
          return (
            <div key={c.id} onClick={() => onOpenThread(c)}
              style={{ padding:'14px 16px', background:'#FFF5F5', borderBottom:'1px solid #FEE2E2', display:'flex', gap:'10px', alignItems:'flex-start', cursor:'pointer' }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>💬</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'2px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'700', color:'#DC2626' }}>
                    {g.name ? `${g.name} ${g.surname||''}`.trim() : 'Guest'}
                  </div>
                  {g.room && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>Room {g.room}</div>}
                  <div style={{ marginLeft:'auto', fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626' }}>NEEDS REPLY</div>
                </div>
                <div style={{ fontSize:'12px', color:'#6B7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{preview}</div>
              </div>
            </div>
          )
        })
      }

      {/* Ticket alerts */}
      <SectionHeader title="Open tickets" badge={issues.length} badgeBg="#FEE2E2" badgeColor="#DC2626" divider />
      {issues.length === 0
        ? <EmptyRow text="All clear ✓" />
        : issues.map(t => (
          <TicketAlertRow key={t.id} ticket={t} depts={depts} isPrivileged={isSupervisorOrManager} />
        ))
      }

      {/* Upcoming */}
      <SectionHeader title="Upcoming bookings" divider />
      {upcoming.length === 0
        ? <EmptyRow text="No upcoming bookings" />
        : upcoming.slice(0,10).map(b => {
          const g  = b.guests || {}
          const tc = typeColors[b.type] || {bg:'#F1F5F9',color:'#334155',l:'?'}
          return <ExpandableBooking key={b.id} booking={b} guest={g} tc={tc} />
        })
      }

      {/* Completed */}
      {done.length > 0 && <>
        <SectionHeader title="Completed today" divider />
        {done.slice(0,6).map(b => {
          const g = b.guests || {}
          return (
            <div key={b.id} style={{ padding:'12px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#D1D5DB', flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'12px', color:'#6B7280' }}>{g.name} · Room {g.room||''}</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{b.partners?.name||b.type}</div>
              </div>
              <div style={{ fontSize:'11px', color:'#9CA3AF' }}>
                {new Date(b.confirmed_at||b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          )
        })}
      </>}
    </div>
  )
}

function SectionHeader({ title, badge, badgeBg, badgeColor, divider }) {
  return (
    <div style={{ padding:'10px 16px 8px', fontSize:'12px', fontWeight:'700', color:'#374151', background:'white', borderBottom:'1px solid #E5E7EB', borderTop: divider?'8px solid #F3F4F6':'none', display:'flex', alignItems:'center', gap:'7px' }}>
      {title}
      {badge > 0 && <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 7px', borderRadius:'10px', background:badgeBg||'#F3F4F6', color:badgeColor||'#374151' }}>{badge}</span>}
    </div>
  )
}
function EmptyRow({ text }) {
  return <div style={{ padding:'20px 16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px', background:'white', borderBottom:'1px solid #F3F4F6' }}>{text}</div>
}

// ════════════════════════════════════════════════════════════
//  DEPT QUEUE (mobile) — current shift + last 48h + planned
// ════════════════════════════════════════════════════════════
function DeptQueue({ hotelId, session }) {
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState(null)
  const [subtab,   setSubtab]   = useState('pending')
  const [alreadyAccepted, setAlreadyAccepted] = useState(null) // name of person who got there first

  const dept = session?.department || session?.role
  const DEPT_LABELS = {
    maintenance:  {label:'Maintenance',  color:'#64748B',bg:'#F1F5F9'},
    housekeeping: {label:'Housekeeping', color:'#16A34A',bg:'#F0FDF4'},
    concierge:    {label:'Concierge',    color:'#9333EA',bg:'#FDF2F8'},
    fnb:          {label:'F&B',          color:'#D97706',bg:'#FEF3C7'},
    security:     {label:'Security',     color:'#DC2626',bg:'#FEF2F2'},
    valet:        {label:'Valet',        color:'#2563EB',bg:'#EFF6FF'},
    frontdesk:    {label:'Front Desk',   color:'#7C3AED',bg:'#FAF5FF'},
  }
  const dc = DEPT_LABELS[dept] || DEPT_LABELS.maintenance

  useEffect(() => {
    if (!hotelId) return
    load(); const iv = setInterval(load, 15000); return () => clearInterval(iv) // 15s for race-condition freshness
  }, [hotelId])

  async function load() {
    try {
      const res  = await fetch(`/api/tickets?hotelId=${hotelId}&department=${dept}`)
      const data = await res.json()
      setTickets(data.tickets || [])
    } finally { setLoading(false) }
  }

  async function updateStatus(id, status) {
    setUpdating(id)
    setAlreadyAccepted(null)
    try {
      const res  = await fetch('/api/tickets', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ticketId:id, status, assignedTo: session?.name || 'Staff' })
      })
      const data = await res.json()

      // 409 = someone else accepted first
      if (res.status === 409) {
        setAlreadyAccepted(data.assignedTo || 'Someone')
        setTimeout(() => setAlreadyAccepted(null), 4000)
      }
      load()
    } finally { setUpdating(null) }
  }

  // ── Ticket filters ──────────────────────────────────────
  const now      = Date.now()
  const h48      = 48 * 60 * 60 * 1000
  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(now + 86400000).toISOString().split('T')[0]

  // Active queue: pending + in_progress (any age — need to be dealt with)
  const pending    = tickets.filter(t => t.status === 'pending')
  // In progress — show all in-progress so team can see who's doing what
  const inProgress = tickets.filter(t => ['in_progress','escalated'].includes(t.status))
  // Planned: not resolved, planned priority
  const planned    = tickets.filter(t => t.priority === 'planned' && !['resolved','cancelled'].includes(t.status))
  // Done: resolved in last 48h
  const resolved   = tickets.filter(t => ['resolved','cancelled'].includes(t.status) && (now - new Date(t.resolved_at || t.created_at).getTime()) < h48)

  const TABS = [
    {key:'pending',     label:'Pending',     badge:pending.length,    badgeBg:'#FEF3C7', badgeColor:'#D97706'},
    {key:'in_progress', label:'In progress', badge:inProgress.length, badgeBg:'#EFF6FF', badgeColor:'#2563EB'},
    {key:'planned',     label:'Planned',     badge:planned.length,    badgeBg:'#F3F4F6', badgeColor:'#374151'},
    {key:'resolved',    label:'Done (48h)',  badge:resolved.length,   badgeBg:'#DCFCE7', badgeColor:'#16A34A'},
  ]

  const shown = {pending, in_progress:inProgress, planned, resolved}[subtab] || []

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,color:'#9CA3AF',fontSize:'13px'}}>Loading tickets…</div>

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>

      {/* Dept badge + shift status */}
      <div style={{padding:'8px 16px',background:'white',borderBottom:'1px solid #E5E7EB',display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
        <span style={{fontSize:'11px',fontWeight:'700',padding:'3px 10px',borderRadius:'6px',background:dc.bg,color:dc.color}}>{dc.label}</span>
        <span style={{fontSize:'12px',color:'#9CA3AF'}}>{tickets.filter(t=>!['resolved','cancelled'].includes(t.status)).length} open</span>
        <span style={{fontSize:'10px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',background:'#DCFCE7',color:'#14532D',marginLeft:'auto'}}>● On shift</span>
      </div>

      {/* Race-condition toast */}
      {alreadyAccepted && (
        <div style={{padding:'10px 16px',background:'#FEF3C7',borderBottom:'1px solid #FCD34D',fontSize:'12px',fontWeight:'600',color:'#78350F',display:'flex',alignItems:'center',gap:'6px',flexShrink:0}}>
          ⚡ {alreadyAccepted} accepted this ticket first
        </div>
      )}

      {/* Subtabs */}
      <div style={{display:'flex',background:'white',borderBottom:'1px solid #E5E7EB',flexShrink:0,overflowX:'auto'}}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setSubtab(t.key)}
            style={{flexShrink:0,padding:'10px 12px',fontSize:'11px',fontWeight:subtab===t.key?'700':'500',color:subtab===t.key?'#1C3D2E':'#9CA3AF',background:'none',border:'none',borderBottom:subtab===t.key?'2px solid #C9A84C':'2px solid transparent',cursor:'pointer',fontFamily:"'DM Sans', sans-serif",display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',minWidth:'72px'}}>
            {t.label}
            {t.badge > 0 && <span style={{fontSize:'9px',fontWeight:'700',padding:'1px 5px',borderRadius:'8px',background:t.badgeBg,color:t.badgeColor}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Ticket cards */}
      <div style={{flex:1,overflowY:'auto',background:'#F9FAFB',padding:'12px',display:'flex',flexDirection:'column',gap:'10px'}}>
        {shown.length === 0 && (
          <div style={{padding:'40px',textAlign:'center',color:'#9CA3AF',fontSize:'13px'}}>
            {subtab === 'resolved' ? 'No completed tickets in the last 48h' : 'No tickets here'}
          </div>
        )}
        {shown.map(t => {
          const mins    = Math.round(t.minutes_open || 0)
          const timeStr = mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
          const urgent  = t.priority === 'urgent'
          const overdue = mins > 30 && !['resolved','cancelled'].includes(t.status)
          const isDone  = ['resolved','cancelled'].includes(t.status)

          return (
            <div key={t.id} style={{background:'white',border:`1px solid ${urgent?'#FCA5A5':overdue&&!isDone?'#FDE68A':'#E5E7EB'}`,borderRadius:'14px',padding:'14px',position:'relative',opacity:isDone?0.75:1}}>

              {/* Priority badge */}
              {urgent && !isDone && (
                <span style={{position:'absolute',top:'12px',right:'12px',fontSize:'9px',fontWeight:'700',padding:'2px 7px',borderRadius:'5px',background:'#FEE2E2',color:'#DC2626'}}>URGENT</span>
              )}

              {/* Ticket meta */}
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                <span style={{fontSize:'10px',fontWeight:'600',color:'#9CA3AF'}}>#{t.ticket_number}</span>
                <span style={{fontSize:'10px',color:overdue&&!isDone?'#D97706':'#9CA3AF',fontWeight:overdue&&!isDone?'600':'400'}}>
                  {isDone ? `Done in ${timeStr}` : `Open ${timeStr}`}
                </span>
                {t.priority === 'planned' && (
                  <span style={{fontSize:'9px',fontWeight:'700',padding:'1px 6px',borderRadius:'4px',background:'#F3F4F6',color:'#374151'}}>PLANNED</span>
                )}
              </div>

              {/* Category */}
              <div style={{fontSize:'11px',fontWeight:'600',color:dc.color,marginBottom:'4px',textTransform:'capitalize'}}>
                {t.category?.replace(/_/g,' ')}
              </div>

              {/* Description */}
              <div style={{fontSize:'13px',color:'#1F2937',lineHeight:'1.45',marginBottom:'10px'}}>{t.description}</div>

              {/* Room + guest */}
              <div style={{display:'flex',gap:'6px',marginBottom:t.assigned_to_name||!isDone?'10px':'0',flexWrap:'wrap'}}>
                {t.room && <span style={{fontSize:'11px',fontWeight:'500',padding:'3px 9px',borderRadius:'5px',background:'#F3F4F6',color:'#6B7280'}}>Room {t.room}</span>}
                {t.guest_name && <span style={{fontSize:'11px',color:'#9CA3AF'}}>{t.guest_name} {t.guest_surname||''}</span>}
              </div>

              {/* Assigned to — who is handling / handled this */}
              {t.assigned_to_name && (
                <div style={{fontSize:'11px',fontWeight:'600',color: isDone?'#16A34A':'#2563EB',marginBottom:'10px',display:'flex',alignItems:'center',gap:'4px'}}>
                  {isDone ? '✅' : '👤'} {isDone ? `Completed by ${t.assigned_to_name}` : `In progress · ${t.assigned_to_name}`}
                </div>
              )}

              {/* Action buttons */}
              {subtab === 'pending' && (
                <button onClick={()=>updateStatus(t.id,'in_progress')} disabled={updating===t.id}
                  style={{width:'100%',padding:'11px',background: urgent?'#DC2626':'#1C3D2E',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',color:'white',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                  {updating===t.id?'Updating…':'👍 Accept ticket'}
                </button>
              )}
              {subtab === 'in_progress' && t.assigned_to_name === (session?.name || 'Staff') && (
                <div style={{display:'flex',gap:'8px'}}>
                  <button onClick={()=>updateStatus(t.id,'resolved')} disabled={updating===t.id}
                    style={{flex:1,padding:'11px',background:'#1C3D2E',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',color:'white',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    {updating===t.id?'…':'✅ Mark resolved'}
                  </button>
                  <button onClick={()=>updateStatus(t.id,'escalated')} disabled={updating===t.id}
                    style={{padding:'11px 14px',background:'white',border:'1px solid #E5E7EB',borderRadius:'10px',fontSize:'13px',color:'#6B7280',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    ❌
                  </button>
                </div>
              )}
              {subtab === 'in_progress' && t.assigned_to_name && t.assigned_to_name !== (session?.name || 'Staff') && (
                <div style={{fontSize:'12px',color:'#9CA3AF',textAlign:'center',padding:'4px'}}>
                  Being handled by {t.assigned_to_name}
                </div>
              )}
              {/* Fix #17: Reopen button for resolved tickets */}
              {subtab === 'resolved' && (
                <button onClick={()=>updateStatus(t.id,'pending')} disabled={updating===t.id}
                  style={{width:'100%',padding:'9px',background:'white',border:'1px solid #D1D5DB',borderRadius:'10px',fontSize:'12px',fontWeight:'600',color:'#6B7280',cursor:'pointer',fontFamily:"'DM Sans', sans-serif",marginTop:'4px'}}>
                  {updating===t.id?'…':'↩ Reopen ticket'}
                </button>
              )}
            </div>
          )
        })}
        <div style={{height:'16px'}}/>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  RECEPTION / MANAGER VIEW
//  Subtabs: Chats | Portal | Issues
//  Thread opens as full-screen slide (no tab bar shown)
// ════════════════════════════════════════════════════════════
function ReceptionView({ hotelId, session }) {
  const [conversations, setConversations] = useState([])
  const [bookings,      setBookings]      = useState([])
  const [tickets,       setTickets]       = useState([])
  const [selectedConv,  setSelectedConv]  = useState(null)
  const [subtab,        setSubtab]        = useState('chats')   // 'chats' | 'portal' | 'issues'
  const [threadOpen,    setThreadOpen]    = useState(false)     // slides over everything

  useEffect(() => {
    if (!hotelId) return
    load(); const iv = setInterval(load, 10000); return () => clearInterval(iv)
  }, [hotelId])

  async function load() {
    try {
      const [cr, br, tr] = await Promise.all([
        fetch(`/api/conversations?hotelId=${hotelId}`),
        fetch(`/api/bookings?hotelId=${hotelId}`),
        fetch(`/api/tickets?hotelId=${hotelId}`),
      ])
      const [cd, bd, td] = await Promise.all([cr.json(), br.json(), tr.json()])
      const fresh = cd.conversations || []
      setConversations(fresh)
      setBookings(bd.bookings || [])
      setTickets(td.tickets  || [])
      setSelectedConv(prev => prev ? (fresh.find(c => c.id === prev.id) || prev) : prev)
    } catch {}
  }

  // Open the chat thread — full-screen, does NOT switch main tabs
  function openThread(conv) {
    setSelectedConv(conv)
    setThreadOpen(true)
    // ⚠️  NO onSelectGuest() call — that was causing the tab switch
  }

  // Select conv for portal use only (no thread open)
  function selectConvForPortal(conv) {
    setSelectedConv(conv)
  }

  const escalated  = conversations.filter(c => c.status === 'escalated').length
  const escalatedConvCount = conversations.filter(c => c.status === 'escalated').length
  const issueCount = escalatedConvCount + tickets.filter(t => !['resolved','cancelled'].includes(t.status)).length

  const TABS = [
    { key:'chats',  label:'Chats',        icon:'💬', badge:escalated,  badgeBg:'#FEE2E2', badgeColor:'#DC2626' },
    { key:'portal', label:'Staff Portal', icon:'✏️', badge:0 },
    { key:'issues', label:'Alerts',       icon:'⚠️', badge:issueCount, badgeBg:'#FEF3C7', badgeColor:'#D97706' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', position:'relative' }}>

      {/* Subtab bar — always visible unless thread is open */}
      {!threadOpen && (
        <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setSubtab(t.key)}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'10px 8px', fontSize:'12px', fontWeight: subtab===t.key?'700':'500', color: subtab===t.key?'#1C3D2E':'#9CA3AF', background:'none', border:'none', borderBottom: subtab===t.key?'2px solid #C9A84C':'2px solid transparent', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              <span style={{ fontSize:'15px' }}>{t.icon}</span>
              {t.label}
              {t.badge > 0 && <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 6px', borderRadius:'10px', background:t.badgeBg, color:t.badgeColor }}>{t.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {!threadOpen && subtab === 'chats'  && (
        <ConversationsList
          conversations={conversations}
          selectedConvId={selectedConv?.id}
          onOpenThread={openThread}
        />
      )}
      {!threadOpen && subtab === 'portal' && (
        <StaffPortal
          conversations={conversations}
          selectedConv={selectedConv}
          onSelectConv={selectConvForPortal}
          session={session}
          hotelId={hotelId}
        />
      )}
      {!threadOpen && subtab === 'issues' && (
        <IssuesPanel tickets={tickets} bookings={bookings} conversations={conversations} onOpenThread={openThread} session={session} hotelId={hotelId} />
      )}

      {/* Thread — slides over as full-screen overlay within this panel */}
      {threadOpen && (
        <ChatThread
          conv={selectedConv}
          session={session}
          onBack={() => setThreadOpen(false)}
          onReload={load}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════
export default function MobileLiveTab({ hotelId, session }) {
  if (DEPT_ROLES.includes(session?.role)) {
    return <DeptQueue hotelId={hotelId} session={session} />
  }
  return <ReceptionView hotelId={hotelId} session={session} />
}
