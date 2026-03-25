// components/MobileLiveTab.js
// Mobile-only Live tab with 4 subtabs:
//   Chats | Issues | Chat thread | Staff Portal
// Replaces the 3-column desktop layout on mobile.

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

const canReply = (role) => ['receptionist','manager','admin'].includes(role)

// ── Back arrow icon ──────────────────────────────────────────
function BackArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Subtab bar ───────────────────────────────────────────────
function SubtabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E5E7EB', flexShrink:0, overflowX:'auto' }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            flex:1, minWidth:'fit-content', padding:'11px 12px',
            fontSize:'12px', fontWeight: active===t.key ? '700' : '500',
            color: active===t.key ? '#1C3D2E' : '#9CA3AF',
            background: 'none', border:'none',
            borderBottom: active===t.key ? '2px solid #C9A84C' : '2px solid transparent',
            cursor:'pointer', fontFamily:"'DM Sans', sans-serif",
            whiteSpace:'nowrap', transition:'all .15s',
            display:'flex', flexDirection:'column', alignItems:'center', gap:'1px',
          }}>
          <span>{t.icon}</span>
          <span>{t.label}</span>
          {t.badge > 0 && (
            <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 5px', borderRadius:'10px', background: t.badgeColor||'#FEE2E2', color: t.badgeText||'#DC2626', marginTop:'2px' }}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Conversations list ───────────────────────────────────────
function ConversationsList({ conversations, onSelect }) {
  const escalated = conversations.filter(c => c.status === 'escalated')
  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>
      {escalated.length > 0 && (
        <div style={{ padding:'8px 14px', background:'#FEF2F2', borderBottom:'1px solid #FCA5A5', fontSize:'12px', fontWeight:'600', color:'#DC2626', display:'flex', alignItems:'center', gap:'6px' }}>
          <span>⚠️</span> {escalated.length} conversation{escalated.length>1?'s':''} need{escalated.length===1?'s':''} reply
        </div>
      )}
      {conversations.length === 0 && (
        <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>
          No active conversations
        </div>
      )}
      {conversations.map(conv => {
        const guest   = conv.guests || {}
        const msgs    = conv.messages || []
        const last    = msgs[msgs.length - 1]
        const lang    = guest.language || 'en'
        const lc      = LANG_COLORS[lang] || LANG_COLORS.en
        const isEsc   = conv.status === 'escalated'
        const minsAgo = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
        const timeLabel = minsAgo === 0 ? 'now' : minsAgo < 60 ? `${minsAgo}m` : `${Math.floor(minsAgo/60)}h`
        const room    = guest.room || guest.guest_room || '?'
        return (
          <div key={conv.id} onClick={() => onSelect(conv)}
            style={{ padding:'14px 16px', background:'white', borderBottom:'1px solid #F3F4F6', cursor:'pointer', borderLeft: isEsc ? '3px solid #DC2626' : '3px solid transparent', display:'flex', gap:'12px', alignItems:'flex-start' }}>
            {/* Avatar */}
            <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
              {(guest.name?.[0]||'?')}{(guest.surname?.[0]||'')}
            </div>
            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2px' }}>
                <span style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>
                  {guest.name||'Guest'} {guest.surname||''}
                </span>
                <span style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0, marginLeft:'8px' }}>{timeLabel}</span>
              </div>
              <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'4px' }}>Room {room}</div>
              <div style={{ fontSize:'12px', color: isEsc ? '#DC2626' : '#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isEsc ? '600' : '400' }}>
                {isEsc ? 'Reply needed ↩' : (last?.content || 'No messages')}
              </div>
              <div style={{ marginTop:'5px', display:'flex', gap:'4px', flexWrap:'wrap' }}>
                <span style={{ fontSize:'10px', fontWeight:'600', padding:'2px 7px', borderRadius:'5px', background:lc.bg, color:lc.color }}>
                  {lc.name}
                </span>
                {isEsc && <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626' }}>escalated</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Issues & alerts panel ────────────────────────────────────
function IssuesPanel({ tickets, bookings }) {
  const issues    = tickets.filter(t => !['resolved','cancelled'].includes(t.status))
  const upcoming  = bookings.filter(b => ['confirmed','pending'].includes(b.status))
  const completed = bookings.filter(b => ['completed','resolved'].includes(b.status))

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>

      {/* Issues */}
      <div style={{ padding:'10px 16px 6px', fontSize:'12px', fontWeight:'700', color:'#374151', background:'white', borderBottom:'1px solid #E5E7EB', position:'sticky', top:0 }}>
        Issues & Alerts
        {issues.length > 0 && (
          <span style={{ marginLeft:'8px', fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'10px', background:'#FEE2E2', color:'#DC2626' }}>{issues.length}</span>
        )}
      </div>
      {issues.length === 0
        ? <div style={{ padding:'20px 16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px', background:'white', borderBottom:'1px solid #F3F4F6' }}>All clear ✓</div>
        : issues.map(t => (
          <div key={t.id} style={{ padding:'14px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', gap:'10px', alignItems:'flex-start' }}>
            <div style={{ width:'28px', height:'28px', borderRadius:'8px', background: t.priority==='urgent'?'#FEE2E2':'#FFFBEB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>
              {t.priority==='urgent' ? '🚨' : '⚠️'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'2px' }}>
                {t.description?.slice(0,60)}{t.description?.length>60?'…':''}
              </div>
              <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'6px' }}>
                Room {t.room} · {t.department} · <span style={{ textTransform:'capitalize', color: t.status==='escalated'?'#DC2626':'#D97706' }}>{t.status}</span>
              </div>
              {t.priority==='urgent' && (
                <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626' }}>URGENT</span>
              )}
            </div>
          </div>
        ))
      }

      {/* Upcoming bookings */}
      <div style={{ padding:'10px 16px 6px', fontSize:'12px', fontWeight:'700', color:'#374151', background:'white', borderBottom:'1px solid #E5E7EB', borderTop:'8px solid #F3F4F6', marginTop:'8px' }}>
        Upcoming
      </div>
      {upcoming.length === 0
        ? <div style={{ padding:'20px 16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px', background:'white', borderBottom:'1px solid #F3F4F6' }}>No upcoming bookings</div>
        : upcoming.slice(0,10).map(b => {
          const guest = b.guests || {}
          const typeColors = { taxi:{bg:'#DCFCE7',color:'#14532D',l:'T'}, restaurant:{bg:'#DBEAFE',color:'#1E3A5F',l:'R'}, activity:{bg:'#FEF3C7',color:'#78350F',l:'A'} }
          const tc = typeColors[b.type] || {bg:'#F1F5F9',color:'#334155',l:'?'}
          return (
            <div key={b.id} style={{ padding:'12px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:tc.color, flexShrink:0 }}>{tc.l}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{guest.name} · Room {guest.room||'?'}</div>
                <div style={{ fontSize:'12px', color:'#6B7280' }}>{b.partners?.name || b.type}</div>
              </div>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>
                {b.details?.time || new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          )
        })
      }

      {/* Completed */}
      {completed.length > 0 && (
        <>
          <div style={{ padding:'10px 16px 6px', fontSize:'12px', fontWeight:'700', color:'#374151', background:'white', borderBottom:'1px solid #E5E7EB', borderTop:'8px solid #F3F4F6', marginTop:'8px' }}>
            Completed today
          </div>
          {completed.slice(0,5).map(b => {
            const guest = b.guests || {}
            return (
              <div key={b.id} style={{ padding:'12px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#D1D5DB', flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', color:'#6B7280' }}>{guest.name} · Room {guest.room||'?'}</div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{b.partners?.name || b.type}</div>
                </div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>
                  {new Date(b.confirmed_at||b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Chat thread panel ────────────────────────────────────────
function ChatPanel({ conv, session, onBack, onReload }) {
  const [replyText, setReplyText] = useState('')
  const [sending,   setSending]   = useState(false)
  const chatEndRef  = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior:'smooth' })
  }, [conv])

  async function handleReply() {
    if (!replyText.trim() || !conv) return
    setSending(true)
    try {
      await fetch('/api/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ conversationId:conv.id, guestPhone:conv.guests?.phone, message:replyText.trim() }),
      })
      setReplyText('')
      onReload?.()
    } finally { setSending(false) }
  }

  const guest = conv?.guests || {}
  const room  = guest.room || guest.guest_room || '?'

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#F9FAFB' }}>
      {/* Mini header */}
      <div style={{ padding:'10px 16px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
        <button onClick={onBack}
          style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', color:'#6B7280', padding:'4px' }}>
          <BackArrow />
        </button>
        <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
          {(guest.name?.[0]||'?')}{(guest.surname?.[0]||'')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{guest.name||'Guest'} {guest.surname||''}</div>
          <div style={{ fontSize:'11px', color:'#9CA3AF' }}>Room {room}</div>
        </div>
        {conv?.status === 'escalated' && (
          <span style={{ fontSize:'10px', fontWeight:'700', padding:'3px 8px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626', flexShrink:0 }}>Needs reply</span>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
        {!conv
          ? <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:'13px', marginTop:'40px' }}>Select a conversation from Chats</div>
          : (conv.messages||[]).map((msg, idx) => {
            const isOut = msg.role === 'user'
            return (
              <div key={idx} style={{ display:'flex', flexDirection: isOut?'row-reverse':'row', gap:'8px', alignItems:'flex-end' }}>
                <div style={{ maxWidth:'80%', padding:'10px 14px', borderRadius: isOut?'14px 4px 14px 14px':'4px 14px 14px 14px', background: isOut?'#1C3D2E':'white', color: isOut?'white':'#111827', fontSize:'13px', lineHeight:'1.55', border: isOut?'none':'1px solid #E5E7EB' }}>
                  {msg.content}
                  {msg.sent_by && <div style={{ fontSize:'10px', opacity:0.55, marginTop:'4px' }}>— {msg.sent_by}</div>}
                </div>
                <div style={{ fontSize:'10px', color:'#9CA3AF', paddingBottom:'3px', flexShrink:0 }}>
                  {new Date(msg.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )
          })
        }
        <div ref={chatEndRef}/>
      </div>

      {/* Reply input */}
      {conv && (
        canReply(session?.role)
          ? (
            <div style={{ padding:'12px 16px', background:'white', borderTop:'1px solid #E5E7EB', display:'flex', gap:'10px', alignItems:'flex-end', flexShrink:0 }}>
              <textarea
                value={replyText} onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleReply()} }}
                placeholder="Reply to guest…"
                rows={2}
                style={{ flex:1, padding:'10px 13px', border:'1px solid #D1D5DB', borderRadius:'12px', fontSize:'14px', fontFamily:"'DM Sans', sans-serif", resize:'none', outline:'none', color:'#111827', lineHeight:'1.4' }}
              />
              <button onClick={handleReply} disabled={sending||!replyText.trim()}
                style={{ padding:'12px 18px', background: replyText.trim()?'#1C3D2E':'#E5E7EB', border:'none', borderRadius:'12px', fontSize:'14px', fontWeight:'600', color: replyText.trim()?'white':'#9CA3AF', cursor: replyText.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans', sans-serif", flexShrink:0 }}>
                {sending ? '…' : 'Send'}
              </button>
            </div>
          ) : (
            <div style={{ padding:'12px', background:'#F9FAFB', borderTop:'1px solid #E5E7EB', fontSize:'12px', color:'#9CA3AF', textAlign:'center' }}>
              Only reception can reply to guests
            </div>
          )
      )}
    </div>
  )
}

// ── Staff portal panel ───────────────────────────────────────
function PortalPanel({ conv, session, hotelId, onBack }) {
  const [requestType,  setRequestType]  = useState('external')
  const [category,     setCategory]     = useState('')
  const [department,   setDepartment]   = useState('')
  const [deptCategory, setDeptCategory] = useState('')
  const [priority,     setPriority]     = useState('today')
  const [requestText,  setRequestText]  = useState('')
  const [sending,      setSending]      = useState(false)
  const [sent,         setSent]         = useState(false)
  const [partnerTypes, setPartnerTypes] = useState([])
  const [departments,  setDepartments]  = useState([])

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
    if (!requestText.trim() || !conv) return
    setSending(true)
    try {
      const endpoint = requestType === 'external' ? '/api/bookings' : '/api/tickets'
      const body = requestType === 'external'
        ? { hotelId, guestId:conv.guests?.id, type:category, details:{ description:requestText }, createdBy:`staff:${session?.name||''}` }
        : { hotelId, guestId:conv.guests?.id, department, category:deptCategory||department, description:requestText, room:conv.guests?.room||conv.guests?.guest_room, priority, createdBy:`staff:${session?.name||''}` }
      await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      setSent(true); setRequestText('')
      setTimeout(() => setSent(false), 3000)
    } finally { setSending(false) }
  }

  const guest = conv?.guests || {}

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>
      {/* Mini header */}
      <div style={{ padding:'10px 16px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, position:'sticky', top:0, zIndex:10 }}>
        <button onClick={onBack}
          style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', color:'#6B7280', padding:'4px' }}>
          <BackArrow />
        </button>
        <span style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>Create request</span>
        {conv && (
          <span style={{ marginLeft:'auto', fontSize:'12px', color:'#9CA3AF' }}>
            {guest.name} · Room {guest.room||guest.guest_room||'?'}
          </span>
        )}
      </div>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:'14px' }}>

        {/* Guest chip */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Guest</div>
          {conv ? (
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'white', borderRadius:'12px', border:'1px solid #E5E7EB' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                {(guest.name?.[0]||'?')}{(guest.surname?.[0]||'')}
              </div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{guest.name} {guest.surname}</div>
                <div style={{ fontSize:'12px', color:'#6B7280' }}>Room {guest.room||guest.guest_room||'?'}</div>
              </div>
            </div>
          ) : (
            <div style={{ padding:'14px', background:'white', borderRadius:'12px', border:'1px dashed #D1D5DB', textAlign:'center', fontSize:'12px', color:'#9CA3AF' }}>
              Go to Chats and select a conversation first
            </div>
          )}
        </div>

        {/* Request type */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Request type</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            {[
              { key:'external', label:'External booking', sub:'Taxi, restaurant…' },
              { key:'internal', label:'Internal request',  sub:'Housekeeping, maintenance…' },
            ].map(t => (
              <button key={t.key} onClick={() => setRequestType(t.key)}
                style={{ padding:'12px 10px', borderRadius:'12px', border:'1px solid', textAlign:'center', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", transition:'all .15s', borderColor: requestType===t.key?'#1C3D2E':'#E5E7EB', background: requestType===t.key?'#1C3D2E':'white' }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color: requestType===t.key?'white':'#111827', marginBottom:'3px' }}>{t.label}</div>
                <div style={{ fontSize:'11px', color: requestType===t.key?'rgba(255,255,255,0.65)':'#9CA3AF' }}>{t.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* External categories */}
        {requestType === 'external' && partnerTypes.length > 0 && (
          <div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Category</div>
            <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
              {partnerTypes.map(pt => {
                const key  = pt.name.toLowerCase()
                const isSel = category === key
                return (
                  <button key={pt.id} onClick={() => setCategory(key)}
                    style={{ padding:'7px 14px', borderRadius:'20px', fontSize:'13px', fontWeight:'500', border:'1px solid', borderColor: isSel?'#C9A84C':'#E5E7EB', background: isSel?'rgba(201,168,76,0.1)':'white', color: isSel?'#78350F':'#374151', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {pt.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Internal departments */}
        {requestType === 'internal' && departments.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div>
              <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Department</div>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {departments.map(dept => {
                  const isSel = department === dept.key
                  return (
                    <button key={dept.id} onClick={() => { setDepartment(dept.key); setDeptCategory('') }}
                      style={{ padding:'7px 14px', borderRadius:'20px', fontSize:'13px', fontWeight:'500', border:'1px solid', borderColor: isSel?'#1C3D2E':'#E5E7EB', background: isSel?'#1C3D2E':'white', color: isSel?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                      {dept.name}
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
          </div>
        )}

        {/* Details textarea */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Details</div>
          <textarea value={requestText} onChange={e => setRequestText(e.target.value)}
            placeholder={requestType==='external'?'e.g. Taxi to airport at 6pm, 2 passengers':'e.g. AC not working, making strange noise'}
            rows={3}
            style={{ width:'100%', padding:'12px 14px', background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', fontSize:'14px', color:'#111827', resize:'none', fontFamily:"'DM Sans', sans-serif", outline:'none', lineHeight:'1.5' }}
          />
        </div>

        {/* CTA */}
        <button onClick={handleSend} disabled={sending||!requestText.trim()||!conv}
          style={{ width:'100%', padding:'14px', background: sent?'#16A34A':(!requestText.trim()||!conv)?'#E5E7EB':'#1C3D2E', border:'none', borderRadius:'12px', fontSize:'15px', fontWeight:'700', color:(!requestText.trim()||!conv)?'#9CA3AF':'white', cursor:(!requestText.trim()||!conv)?'not-allowed':'pointer', fontFamily:"'DM Sans', sans-serif" }}>
          {sent ? '✓ Sent' : sending ? 'Sending…' : requestType==='external' ? 'Send booking request' : 'Create internal ticket'}
        </button>

        {/* Bottom spacing for iOS */}
        <div style={{ height:'20px' }}/>
      </div>
    </div>
  )
}

// ── Department queue (mobile) ────────────────────────────────
function MobileDeptQueue({ hotelId, session }) {
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState(null)
  const [subtab,   setSubtab]   = useState('pending')

  const dept = session?.department || session?.role

  const DEPT_LABELS = {
    maintenance:  { label:'Maintenance',  color:'#64748B', bg:'#F1F5F9' },
    housekeeping: { label:'Housekeeping', color:'#16A34A', bg:'#F0FDF4' },
    concierge:    { label:'Concierge',    color:'#9333EA', bg:'#FDF2F8' },
    fnb:          { label:'F&B',          color:'#D97706', bg:'#FEF3C7' },
    security:     { label:'Security',     color:'#DC2626', bg:'#FEF2F2' },
    valet:        { label:'Valet',        color:'#2563EB', bg:'#EFF6FF' },
    frontdesk:    { label:'Front Desk',   color:'#7C3AED', bg:'#FAF5FF' },
  }
  const deptConfig = DEPT_LABELS[dept] || DEPT_LABELS.maintenance

  useEffect(() => {
    if (!hotelId) return
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [hotelId])

  async function load() {
    try {
      const res  = await fetch(`/api/tickets?hotelId=${hotelId}&department=${dept}`)
      const data = await res.json()
      setTickets(data.tickets || [])
    } finally { setLoading(false) }
  }

  async function updateStatus(ticketId, status) {
    setUpdating(ticketId)
    try {
      await fetch('/api/tickets', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ticketId, status }) })
      load()
    } finally { setUpdating(null) }
  }

  const pending    = tickets.filter(t => t.status === 'pending')
  const inProgress = tickets.filter(t => t.status === 'in_progress' || t.status === 'escalated')
  const resolved   = tickets.filter(t => t.status === 'resolved' || t.status === 'cancelled')

  const SUBTABS = [
    { key:'pending',     label:'Pending',     badge: pending.length,    badgeColor:'#FEF3C7', badgeText:'#D97706' },
    { key:'in_progress', label:'In progress', badge: inProgress.length, badgeColor:'#EFF6FF', badgeText:'#2563EB' },
    { key:'resolved',    label:'Completed',   badge: resolved.length,   badgeColor:'#DCFCE7', badgeText:'#16A34A' },
  ]

  const shown = { pending, in_progress: inProgress, resolved }[subtab] || []

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'#9CA3AF', fontSize:'13px' }}>
      Loading tickets…
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Dept badge */}
      <div style={{ padding:'8px 16px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
        <span style={{ fontSize:'11px', fontWeight:'700', padding:'3px 10px', borderRadius:'6px', background:deptConfig.bg, color:deptConfig.color }}>{deptConfig.label}</span>
        <span style={{ fontSize:'12px', color:'#9CA3AF' }}>{tickets.filter(t=>t.status!=='resolved').length} open · refreshes every 30s</span>
      </div>

      {/* Subtabs */}
      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
        {SUBTABS.map(t => (
          <button key={t.key} onClick={() => setSubtab(t.key)}
            style={{ flex:1, padding:'11px 8px', fontSize:'12px', fontWeight: subtab===t.key?'700':'500', color: subtab===t.key?'#1C3D2E':'#9CA3AF', background:'none', border:'none', borderBottom: subtab===t.key?'2px solid #C9A84C':'2px solid transparent', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ fontSize:'9px', fontWeight:'700', padding:'1px 5px', borderRadius:'8px', background:t.badgeColor, color:t.badgeText }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'10px' }}>
        {shown.length === 0 && (
          <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>No tickets here</div>
        )}
        {shown.map(t => {
          const minsOpen = Math.round(t.minutes_open || 0)
          const timeLabel = minsOpen < 60 ? `${minsOpen}m` : `${Math.floor(minsOpen/60)}h ${minsOpen%60}m`
          const isUrgent  = t.priority === 'urgent'
          const isOverdue = minsOpen > 30 && subtab !== 'resolved'
          return (
            <div key={t.id} style={{ background:'white', border:`1px solid ${isUrgent?'#FCA5A5':isOverdue?'#FDE68A':'#E5E7EB'}`, borderRadius:'14px', padding:'14px', position:'relative' }}>
              {isUrgent && (
                <div style={{ position:'absolute', top:'12px', right:'12px', fontSize:'9px', fontWeight:'700', padding:'2px 7px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626' }}>URGENT</div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
                <span style={{ fontSize:'10px', fontWeight:'600', color:'#9CA3AF' }}>#{t.ticket_number}</span>
                <span style={{ fontSize:'10px', color: isOverdue?'#D97706':'#9CA3AF', fontWeight: isOverdue?'600':'400' }}>
                  {subtab==='resolved' ? `Resolved in ${timeLabel}` : `Open ${timeLabel}`}
                </span>
              </div>
              <div style={{ fontSize:'11px', fontWeight:'600', color:deptConfig.color, marginBottom:'4px', textTransform:'capitalize' }}>
                {t.category?.replace(/_/g,' ')}
              </div>
              <div style={{ fontSize:'13px', color:'#1F2937', lineHeight:'1.45', marginBottom:'10px' }}>{t.description}</div>
              <div style={{ display:'flex', gap:'6px', marginBottom:'10px', flexWrap:'wrap' }}>
                {t.room && (
                  <span style={{ fontSize:'11px', fontWeight:'500', padding:'3px 9px', borderRadius:'5px', background:'#F3F4F6', color:'#6B7280' }}>Room {t.room}</span>
                )}
                {t.guest_name && (
                  <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{t.guest_name} {t.guest_surname||''}</span>
                )}
              </div>
              {subtab === 'pending' && (
                <button onClick={() => updateStatus(t.id,'in_progress')} disabled={updating===t.id}
                  style={{ width:'100%', padding:'10px', background:'#1C3D2E', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                  {updating===t.id ? 'Updating…' : '👍 Accept ticket'}
                </button>
              )}
              {subtab === 'in_progress' && (
                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={() => updateStatus(t.id,'resolved')} disabled={updating===t.id}
                    style={{ flex:1, padding:'10px', background:'#1C3D2E', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {updating===t.id ? '…' : '✅ Resolved'}
                  </button>
                  <button onClick={() => updateStatus(t.id,'escalated')} disabled={updating===t.id}
                    style={{ padding:'10px 14px', background:'white', border:'1px solid #E5E7EB', borderRadius:'10px', fontSize:'13px', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    ❌
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <div style={{ height:'16px' }}/>
      </div>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────
const DEPT_ROLES = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk']

export default function MobileLiveTab({ hotelId, session, onSelectGuest }) {
  const isDept = DEPT_ROLES.includes(session?.role)

  // Department staff → simplified queue with 3 status subtabs
  if (isDept) {
    return <MobileDeptQueue hotelId={hotelId} session={session} />
  }

  // Reception / Manager → full 4-subtab view
  return <MobileReceptionView hotelId={hotelId} session={session} onSelectGuest={onSelectGuest} />
}

function MobileReceptionView({ hotelId, session, onSelectGuest }) {
  const [conversations, setConversations] = useState([])
  const [bookings,      setBookings]      = useState([])
  const [tickets,       setTickets]       = useState([])
  const [selectedConv,  setSelectedConv]  = useState(null)
  const [subtab,        setSubtab]        = useState('chats')

  useEffect(() => {
    if (!hotelId) return
    loadData()
    const iv = setInterval(loadData, 10000)
    return () => clearInterval(iv)
  }, [hotelId])

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
    setSelectedConv(prev => prev ? (freshConvs.find(c => c.id === prev.id) || prev) : prev)
  }

  function selectConv(conv) {
    setSelectedConv(conv)
    setSubtab('thread')
    onSelectGuest?.(conv.guests)
  }

  const escalatedCount = conversations.filter(c => c.status === 'escalated').length
  const issueCount     = tickets.filter(t => !['resolved','cancelled'].includes(t.status)).length

  const SUBTABS = [
    { key:'chats',  label:'Chats',   icon:'💬', badge: escalatedCount, badgeColor:'#FEE2E2', badgeText:'#DC2626' },
    { key:'issues', label:'Issues',  icon:'⚠️', badge: issueCount,    badgeColor:'#FEF3C7', badgeText:'#D97706' },
    { key:'thread', label:'Thread',  icon:'🔍' },
    { key:'portal', label:'Portal',  icon:'✏️' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <SubtabBar tabs={SUBTABS} active={subtab} onChange={setSubtab} />

      {subtab === 'chats'  && <ConversationsList conversations={conversations} onSelect={selectConv} />}
      {subtab === 'issues' && <IssuesPanel tickets={tickets} bookings={bookings} />}
      {subtab === 'thread' && (
        <ChatPanel
          conv={selectedConv}
          session={session}
          onBack={() => setSubtab('chats')}
          onReload={loadData}
        />
      )}
      {subtab === 'portal' && (
        <PortalPanel
          conv={selectedConv}
          session={session}
          hotelId={hotelId}
          onBack={() => setSubtab('chats')}
        />
      )}
    </div>
  )
}
