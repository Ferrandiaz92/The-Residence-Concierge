// components/MobileLiveTab.js — v3
// Fixes: conv selection → thread/portal, request creation flow
// Dept: 3 status subtabs (Pending / In progress / Completed)

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

const canReply    = (role) => ['receptionist','manager','admin'].includes(role)
const DEPT_ROLES  = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk']

// ── Shared back button ───────────────────────────────────────
function BackBtn({ onBack, label }) {
  return (
    <button onClick={onBack}
      style={{ display:'flex', alignItems:'center', gap:'5px', background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:'6px 4px', fontFamily:"'DM Sans', sans-serif", fontSize:'13px', fontWeight:'500' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label || 'Back'}
    </button>
  )
}

// ── Guest chip (used in thread and portal header) ─────────────
function GuestChip({ conv, compact }) {
  if (!conv) return null
  const g    = conv.guests || {}
  const room = g.room || g.guest_room || '?'
  const lc   = LANG_COLORS[g.language || 'en'] || LANG_COLORS.en
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
      <div style={{ width: compact?28:34, height: compact?28:34, borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize: compact?'11px':'13px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
        {(g.name?.[0]||'?')}{(g.surname?.[0]||'')}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize: compact?'12px':'13px', fontWeight:'600', color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {g.name||'Guest'} {g.surname||''}
        </div>
        <div style={{ fontSize:'11px', color:'#9CA3AF' }}>Room {room}</div>
      </div>
      {conv.status === 'escalated' && (
        <span style={{ fontSize:'9px', fontWeight:'700', padding:'2px 6px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626', flexShrink:0 }}>Needs reply</span>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  CONVERSATIONS LIST
// ════════════════════════════════════════════════════════════
function ConversationsList({ conversations, selectedConvId, onSelect, onOpenPortal }) {
  const escalated = conversations.filter(c => c.status === 'escalated')

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>
      {escalated.length > 0 && (
        <div style={{ padding:'9px 16px', background:'#FEF2F2', borderBottom:'1px solid #FCA5A5', fontSize:'12px', fontWeight:'600', color:'#DC2626', display:'flex', alignItems:'center', gap:'6px' }}>
          ⚠️ {escalated.length} conversation{escalated.length>1?'s':''} need{escalated.length===1?'s':''} reply
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
        const room    = g.room || g.guest_room || '?'

        return (
          <div key={conv.id}
            style={{ padding:'14px 16px', background: isActive ? 'rgba(28,61,46,0.04)' : 'white', borderBottom:'1px solid #F3F4F6', borderLeft: isEsc ? '3px solid #DC2626' : isActive ? '3px solid #C9A84C' : '3px solid transparent', cursor:'pointer' }}
          >
            {/* Main row — tap to open thread */}
            <div onClick={() => onSelect(conv)} style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                {(g.name?.[0]||'?')}{(g.surname?.[0]||'')}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2px' }}>
                  <span style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>{g.name||'Guest'} {g.surname||''}</span>
                  <span style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0, marginLeft:'8px' }}>{time}</span>
                </div>
                <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'4px' }}>Room {room}</div>
                <div style={{ fontSize:'12px', color: isEsc?'#DC2626':'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isEsc?'600':'400' }}>
                  {isEsc ? '↩ Reply needed' : (last?.content || 'No messages')}
                </div>
                <div style={{ marginTop:'5px', display:'flex', gap:'5px', alignItems:'center' }}>
                  <span style={{ fontSize:'10px', fontWeight:'600', padding:'2px 7px', borderRadius:'5px', background:lc.bg, color:lc.color }}>{lc.name}</span>
                  {isEsc && <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626' }}>escalated</span>}
                </div>
              </div>
            </div>

            {/* Quick action row */}
            <div style={{ display:'flex', gap:'6px', marginTop:'10px', paddingLeft:'52px' }}>
              <button onClick={() => onSelect(conv)}
                style={{ flex:1, padding:'6px 10px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'11px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                💬 Chat
              </button>
              <button onClick={() => onOpenPortal(conv)}
                style={{ flex:1, padding:'6px 10px', background:'white', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'11px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                ✏️ Request
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  CHAT THREAD
// ════════════════════════════════════════════════════════════
function ChatThread({ conv, session, onBack, onReload }) {
  const [replyText, setReplyText] = useState('')
  const [sending,   setSending]   = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior:'smooth' })
  }, [conv?.messages?.length])

  async function send() {
    if (!replyText.trim() || !conv) return
    setSending(true)
    try {
      await fetch('/api/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ conversationId: conv.id, guestPhone: conv.guests?.phone, message: replyText.trim() }),
      })
      setReplyText('')
      onReload?.()
    } finally { setSending(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', background:'#F9FAFB' }}>

      {/* Header */}
      <div style={{ padding:'10px 16px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
        <BackBtn onBack={onBack} label="Chats" />
        <div style={{ flex:1 }}><GuestChip conv={conv} compact /></div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
        {(conv?.messages || []).length === 0 && (
          <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:'13px', marginTop:'40px' }}>No messages yet</div>
        )}
        {(conv?.messages || []).map((msg, i) => {
          const isOut = msg.role === 'user'
          return (
            <div key={i} style={{ display:'flex', flexDirection: isOut?'row-reverse':'row', gap:'8px', alignItems:'flex-end' }}>
              <div style={{ maxWidth:'80%', padding:'10px 14px', borderRadius: isOut?'14px 4px 14px 14px':'4px 14px 14px 14px', background: isOut?'#1C3D2E':'white', color: isOut?'white':'#111827', fontSize:'13px', lineHeight:'1.55', border: isOut?'none':'1px solid #E5E7EB' }}>
                {msg.content}
                {msg.sent_by && <div style={{ fontSize:'10px', opacity:0.5, marginTop:'4px' }}>— {msg.sent_by}</div>}
              </div>
              <div style={{ fontSize:'10px', color:'#9CA3AF', paddingBottom:'3px', flexShrink:0 }}>
                {new Date(msg.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Reply bar */}
      {canReply(session?.role) ? (
        <div style={{ padding:'12px 16px', background:'white', borderTop:'1px solid #E5E7EB', display:'flex', gap:'10px', alignItems:'flex-end', flexShrink:0 }}>
          <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
            placeholder="Reply to guest…" rows={2}
            style={{ flex:1, padding:'10px 13px', border:'1px solid #D1D5DB', borderRadius:'12px', fontSize:'14px', fontFamily:"'DM Sans', sans-serif", resize:'none', outline:'none', color:'#111827', lineHeight:'1.4' }}
          />
          <button onClick={send} disabled={sending||!replyText.trim()}
            style={{ padding:'12px 18px', background: replyText.trim()?'#1C3D2E':'#E5E7EB', border:'none', borderRadius:'12px', fontSize:'14px', fontWeight:'600', color: replyText.trim()?'white':'#9CA3AF', cursor: replyText.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans', sans-serif", flexShrink:0 }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      ) : (
        <div style={{ padding:'12px 16px', background:'#F9FAFB', borderTop:'1px solid #E5E7EB', fontSize:'12px', color:'#9CA3AF', textAlign:'center' }}>
          Only reception can reply to guests
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  STAFF PORTAL (create request / booking)
// ════════════════════════════════════════════════════════════
function StaffPortal({ conv, session, hotelId, onBack }) {
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
    if (!details.trim() || !conv) return
    setSending(true)
    try {
      const endpoint = reqType === 'external' ? '/api/bookings' : '/api/tickets'
      const body = reqType === 'external'
        ? { hotelId, guestId: conv.guests?.id, type: category, details: { description: details }, createdBy: `staff:${session?.name||''}` }
        : { hotelId, guestId: conv.guests?.id, department, category: deptCategory||department, description: details, room: conv.guests?.room||conv.guests?.guest_room, priority, createdBy: `staff:${session?.name||''}` }
      await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      setSent(true); setDetails('')
      setTimeout(() => setSent(false), 3000)
    } finally { setSending(false) }
  }

  const g = conv?.guests || {}

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>

      {/* Sticky header */}
      <div style={{ padding:'10px 16px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
        <BackBtn onBack={onBack} label="Chats" />
        <span style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>Create request</span>
        {conv && (
          <div style={{ marginLeft:'auto' }}>
            <GuestChip conv={conv} compact />
          </div>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>
        <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Guest chip — big */}
          {!conv && (
            <div style={{ padding:'16px', background:'white', borderRadius:'12px', border:'1px dashed #D1D5DB', textAlign:'center', fontSize:'13px', color:'#9CA3AF' }}>
              Go to Chats, tap a conversation, then tap ✏️ Request
            </div>
          )}

          {/* Request type */}
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

          {/* External categories */}
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

          {/* Internal dept + priority */}
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

          {/* Details */}
          <div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Details</div>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3}
              placeholder={reqType==='external'?'e.g. Taxi to airport at 6pm, 2 passengers':'e.g. AC not working in room'}
              style={{ width:'100%', padding:'12px 14px', background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', fontSize:'14px', color:'#111827', resize:'none', fontFamily:"'DM Sans', sans-serif", outline:'none', lineHeight:'1.5' }}
            />
          </div>

          {/* CTA */}
          <button onClick={handleSend} disabled={sending || !details.trim() || !conv}
            style={{ width:'100%', padding:'14px', background: sent?'#16A34A': (!details.trim()||!conv)?'#E5E7EB':'#1C3D2E', border:'none', borderRadius:'12px', fontSize:'15px', fontWeight:'700', color: (!details.trim()||!conv)?'#9CA3AF':'white', cursor: (!details.trim()||!conv)?'not-allowed':'pointer', fontFamily:"'DM Sans', sans-serif" }}>
            {sent ? '✓ Sent!' : sending ? 'Sending…' : reqType==='external' ? 'Send booking request' : 'Create internal ticket'}
          </button>
          <div style={{ height:'20px' }} />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  ISSUES PANEL
// ════════════════════════════════════════════════════════════
function IssuesPanel({ tickets, bookings }) {
  const issues   = tickets.filter(t => !['resolved','cancelled'].includes(t.status))
  const upcoming = bookings.filter(b => ['confirmed','pending'].includes(b.status))
  const done     = bookings.filter(b => ['completed','resolved'].includes(b.status))
  const typeColors = { taxi:{bg:'#DCFCE7',color:'#14532D',l:'T'}, restaurant:{bg:'#DBEAFE',color:'#1E3A5F',l:'R'}, activity:{bg:'#FEF3C7',color:'#78350F',l:'A'} }

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#F9FAFB' }}>

      <Section title="Issues & Alerts" badge={issues.length} badgeBg="#FEE2E2" badgeColor="#DC2626">
        {issues.length === 0
          ? <Empty text="All clear ✓" />
          : issues.map(t => (
            <div key={t.id} style={{ padding:'14px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', gap:'10px', alignItems:'flex-start' }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'8px', background: t.priority==='urgent'?'#FEE2E2':'#FFFBEB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>
                {t.priority==='urgent'?'🚨':'⚠️'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'2px' }}>{t.description?.slice(0,70)}{t.description?.length>70?'…':''}</div>
                <div style={{ fontSize:'12px', color:'#6B7280' }}>Room {t.room} · {t.department} · <span style={{ color: t.status==='escalated'?'#DC2626':'#D97706', textTransform:'capitalize' }}>{t.status}</span></div>
                {t.priority==='urgent' && <span style={{ display:'inline-block', marginTop:'4px', fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'4px', background:'#FEE2E2', color:'#DC2626' }}>URGENT</span>}
              </div>
            </div>
          ))
        }
      </Section>

      <Section title="Upcoming bookings" divider>
        {upcoming.length === 0
          ? <Empty text="No upcoming bookings" />
          : upcoming.slice(0,10).map(b => {
            const g  = b.guests || {}
            const tc = typeColors[b.type] || {bg:'#F1F5F9',color:'#334155',l:'?'}
            return (
              <div key={b.id} style={{ padding:'12px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:tc.color, flexShrink:0 }}>{tc.l}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{g.name} · Room {g.room||'?'}</div>
                  <div style={{ fontSize:'12px', color:'#6B7280' }}>{b.partners?.name||b.type}</div>
                </div>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>
                  {b.details?.time || new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )
          })
        }
      </Section>

      {done.length > 0 && (
        <Section title="Completed today" divider>
          {done.slice(0,6).map(b => {
            const g = b.guests || {}
            return (
              <div key={b.id} style={{ padding:'12px 16px', background:'white', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#D1D5DB', flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', color:'#6B7280' }}>{g.name} · Room {g.room||'?'}</div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{b.partners?.name||b.type}</div>
                </div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>
                  {new Date(b.confirmed_at||b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )
          })}
        </Section>
      )}
    </div>
  )
}

function Section({ title, badge, badgeBg, badgeColor, divider, children }) {
  return (
    <div style={{ marginTop: divider?8:0 }}>
      <div style={{ padding:'10px 16px 8px', fontSize:'12px', fontWeight:'700', color:'#374151', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'7px' }}>
        {title}
        {badge > 0 && <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 7px', borderRadius:'10px', background:badgeBg||'#F3F4F6', color:badgeColor||'#374151' }}>{badge}</span>}
      </div>
      {children}
    </div>
  )
}
function Empty({ text }) {
  return <div style={{ padding:'20px 16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px', background:'white', borderBottom:'1px solid #F3F4F6' }}>{text}</div>
}

// ════════════════════════════════════════════════════════════
//  DEPT QUEUE (mobile)
// ════════════════════════════════════════════════════════════
function DeptQueue({ hotelId, session }) {
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState(null)
  const [subtab,   setSubtab]   = useState('pending')

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
    load(); const iv = setInterval(load, 30000); return () => clearInterval(iv)
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
    try {
      await fetch('/api/tickets', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ticketId:id,status}) })
      load()
    } finally { setUpdating(null) }
  }

  const pending    = tickets.filter(t => t.status === 'pending')
  const inProgress = tickets.filter(t => ['in_progress','escalated'].includes(t.status))
  const resolved   = tickets.filter(t => ['resolved','cancelled'].includes(t.status))

  const TABS = [
    {key:'pending',     label:'Pending',     badge:pending.length,    badgeBg:'#FEF3C7',badgeColor:'#D97706'},
    {key:'in_progress', label:'In progress', badge:inProgress.length, badgeBg:'#EFF6FF',badgeColor:'#2563EB'},
    {key:'resolved',    label:'Done',        badge:resolved.length,   badgeBg:'#DCFCE7',badgeColor:'#16A34A'},
  ]
  const shown = {pending, in_progress:inProgress, resolved}[subtab] || []

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,color:'#9CA3AF',fontSize:'13px'}}>Loading tickets…</div>

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      {/* Dept badge */}
      <div style={{padding:'8px 16px',background:'white',borderBottom:'1px solid #E5E7EB',display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
        <span style={{fontSize:'11px',fontWeight:'700',padding:'3px 10px',borderRadius:'6px',background:dc.bg,color:dc.color}}>{dc.label}</span>
        <span style={{fontSize:'12px',color:'#9CA3AF'}}>{tickets.filter(t=>t.status!=='resolved').length} open · auto-refresh 30s</span>
      </div>

      {/* Subtabs */}
      <div style={{display:'flex',background:'white',borderBottom:'1px solid #E5E7EB',flexShrink:0}}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setSubtab(t.key)}
            style={{flex:1,padding:'11px 8px',fontSize:'12px',fontWeight:subtab===t.key?'700':'500',color:subtab===t.key?'#1C3D2E':'#9CA3AF',background:'none',border:'none',borderBottom:subtab===t.key?'2px solid #C9A84C':'2px solid transparent',cursor:'pointer',fontFamily:"'DM Sans', sans-serif",display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
            {t.label}
            {t.badge > 0 && <span style={{fontSize:'9px',fontWeight:'700',padding:'1px 5px',borderRadius:'8px',background:t.badgeBg,color:t.badgeColor}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Ticket cards */}
      <div style={{flex:1,overflowY:'auto',background:'#F9FAFB',padding:'12px',display:'flex',flexDirection:'column',gap:'10px'}}>
        {shown.length === 0 && <div style={{padding:'40px',textAlign:'center',color:'#9CA3AF',fontSize:'13px'}}>No tickets here</div>}
        {shown.map(t => {
          const mins    = Math.round(t.minutes_open||0)
          const timeStr = mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
          const urgent  = t.priority === 'urgent'
          const overdue = mins > 30 && subtab !== 'resolved'
          return (
            <div key={t.id} style={{background:'white',border:`1px solid ${urgent?'#FCA5A5':overdue?'#FDE68A':'#E5E7EB'}`,borderRadius:'14px',padding:'14px',position:'relative'}}>
              {urgent && <span style={{position:'absolute',top:'12px',right:'12px',fontSize:'9px',fontWeight:'700',padding:'2px 7px',borderRadius:'5px',background:'#FEE2E2',color:'#DC2626'}}>URGENT</span>}
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                <span style={{fontSize:'10px',fontWeight:'600',color:'#9CA3AF'}}>#{t.ticket_number}</span>
                <span style={{fontSize:'10px',color:overdue?'#D97706':'#9CA3AF',fontWeight:overdue?'600':'400'}}>
                  {subtab==='resolved'?`Resolved in ${timeStr}`:`Open ${timeStr}`}
                </span>
              </div>
              <div style={{fontSize:'11px',fontWeight:'600',color:dc.color,marginBottom:'4px',textTransform:'capitalize'}}>{t.category?.replace(/_/g,' ')}</div>
              <div style={{fontSize:'13px',color:'#1F2937',lineHeight:'1.45',marginBottom:'10px'}}>{t.description}</div>
              {t.room && <span style={{display:'inline-block',fontSize:'11px',fontWeight:'500',padding:'3px 9px',borderRadius:'5px',background:'#F3F4F6',color:'#6B7280',marginBottom:'10px'}}>Room {t.room}</span>}
              {subtab === 'pending' && (
                <button onClick={()=>updateStatus(t.id,'in_progress')} disabled={updating===t.id}
                  style={{width:'100%',padding:'10px',background:'#1C3D2E',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',color:'white',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                  {updating===t.id?'Updating…':'👍 Accept ticket'}
                </button>
              )}
              {subtab === 'in_progress' && (
                <div style={{display:'flex',gap:'8px'}}>
                  <button onClick={()=>updateStatus(t.id,'resolved')} disabled={updating===t.id}
                    style={{flex:1,padding:'10px',background:'#1C3D2E',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',color:'white',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    {updating===t.id?'…':'✅ Resolved'}
                  </button>
                  <button onClick={()=>updateStatus(t.id,'escalated')} disabled={updating===t.id}
                    style={{padding:'10px 14px',background:'white',border:'1px solid #E5E7EB',borderRadius:'10px',fontSize:'13px',color:'#6B7280',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    ❌
                  </button>
                </div>
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
//  RECEPTION / MANAGER VIEW  — 4 subtabs
// ════════════════════════════════════════════════════════════
function ReceptionView({ hotelId, session, onSelectGuest }) {
  const [conversations, setConversations] = useState([])
  const [bookings,      setBookings]      = useState([])
  const [tickets,       setTickets]       = useState([])
  const [selectedConv,  setSelectedConv]  = useState(null)
  const [view,          setView]          = useState('chats') // 'chats'|'issues'|'thread'|'portal'

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
      // keep selected conv in sync
      setSelectedConv(prev => prev ? (fresh.find(c => c.id === prev.id) || prev) : prev)
    } catch {}
  }

  // Open thread for a conversation
  function openThread(conv) {
    setSelectedConv(conv)
    setView('thread')
    onSelectGuest?.(conv.guests)
  }

  // Open portal for a conversation
  function openPortal(conv) {
    setSelectedConv(conv)
    setView('portal')
    onSelectGuest?.(conv.guests)
  }

  const escalated  = conversations.filter(c => c.status === 'escalated').length
  const issueCount = tickets.filter(t => !['resolved','cancelled'].includes(t.status)).length

  // Thread and Portal render full-screen (no subtab bar shown)
  if (view === 'thread') {
    return (
      <ChatThread
        conv={selectedConv}
        session={session}
        onBack={() => setView('chats')}
        onReload={load}
      />
    )
  }
  if (view === 'portal') {
    return (
      <StaffPortal
        conv={selectedConv}
        session={session}
        hotelId={hotelId}
        onBack={() => setView('chats')}
      />
    )
  }

  // Chats / Issues — show subtab bar
  const TABS = [
    { key:'chats',  label:'Chats',  icon:'💬', badge:escalated,  badgeBg:'#FEE2E2', badgeColor:'#DC2626' },
    { key:'issues', label:'Issues', icon:'⚠️', badge:issueCount, badgeBg:'#FEF3C7', badgeColor:'#D97706' },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Subtab bar */}
      <div style={{display:'flex',background:'white',borderBottom:'1px solid #E5E7EB',flexShrink:0}}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setView(t.key)}
            style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',padding:'10px 12px',fontSize:'12px',fontWeight:view===t.key?'700':'500',color:view===t.key?'#1C3D2E':'#9CA3AF',background:'none',border:'none',borderBottom:view===t.key?'2px solid #C9A84C':'2px solid transparent',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
            <span style={{fontSize:'16px'}}>{t.icon}</span>
            {t.label}
            {t.badge > 0 && <span style={{fontSize:'9px',fontWeight:'700',padding:'1px 6px',borderRadius:'10px',background:t.badgeBg,color:t.badgeColor}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {view === 'chats'  && <ConversationsList conversations={conversations} selectedConvId={selectedConv?.id} onSelect={openThread} onOpenPortal={openPortal} />}
      {view === 'issues' && <IssuesPanel tickets={tickets} bookings={bookings} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════
export default function MobileLiveTab({ hotelId, session, onSelectGuest }) {
  if (DEPT_ROLES.includes(session?.role)) {
    return <DeptQueue hotelId={hotelId} session={session} />
  }
  return <ReceptionView hotelId={hotelId} session={session} onSelectGuest={onSelectGuest} />
}
