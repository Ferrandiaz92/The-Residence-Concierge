// components/LiveTab.js (updated v2 - adds chat reply panel)
'use client'
import { useState, useEffect, useRef } from 'react'

const LANG_COLORS = {
  en: { bg: '#F0FDF4', color: '#16A34A' },
  ru: { bg: '#EFF6FF', color: '#2563EB' },
  he: { bg: '#FEF3C7', color: '#D97706' },
}

const TYPE_CONFIG = {
  taxi:          { label: 'T',  bg: '#F0FDF4', color: '#16A34A' },
  restaurant:    { label: 'R',  bg: '#EFF6FF', color: '#2563EB' },
  activity:      { label: 'B',  bg: '#FEF3C7', color: '#D97706' },
  late_checkout: { label: 'L',  bg: '#FDF2F8', color: '#9333EA' },
  maintenance:   { label: 'MT', bg: '#F1F5F9', color: '#64748B' },
  housekeeping:  { label: 'HK', bg: '#F0FDF4', color: '#16A34A' },
  concierge:     { label: 'CS', bg: '#FDF2F8', color: '#9333EA' },
  fnb:           { label: 'FB', bg: '#FEF3C7', color: '#D97706' },
}

const canReply = (role) => ['receptionist','manager','admin'].includes(role)

export default function LiveTab({ hotelId, session, onSelectGuest }) {
  const [conversations, setConversations] = useState([])
  const [bookings, setBookings]           = useState([])
  const [tickets, setTickets]             = useState([])
  const [selectedConv, setSelectedConv]   = useState(null)
  const [centreMode, setCentreMode]       = useState('portal') // 'portal' | 'chat'
  const [replyText, setReplyText]         = useState('')
  const [sending, setSending]             = useState(false)
  const [requestType, setRequestType]     = useState('external')
  const [category, setCategory]           = useState('taxi')
  const [department, setDepartment]       = useState('maintenance')
  const [requestText, setRequestText]     = useState('')
  const [priority, setPriority]           = useState('normal')
  const [sent, setSent]                   = useState(false)
  const chatEndRef                        = useRef(null)

  useEffect(() => {
    if (!hotelId) return
    loadData()
    const interval = setInterval(loadData, 20000)
    return () => clearInterval(interval)
  }, [hotelId])

  useEffect(() => {
    if (centreMode === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selectedConv, centreMode])

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

  function handleConvClick(conv) {
    setSelectedConv(conv)
    setCentreMode('chat')
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
      // Refresh conversation
      const res  = await fetch(`/api/conversations?hotelId=${hotelId}`)
      const data = await res.json()
      const updated = (data.conversations || []).find(c => c.id === selectedConv.id)
      if (updated) setSelectedConv(updated)
      setConversations(data.conversations || [])
    } finally { setSending(false) }
  }

  async function handleSendRequest() {
    if (!requestText.trim() || !selectedConv) return
    setSending(true)
    try {
      const endpoint = requestType === 'external' ? '/api/bookings' : '/api/tickets'
      const body = requestType === 'external'
        ? { hotelId, guestId: selectedConv.guests?.id, type: category, details: { description: requestText }, createdBy: `staff:${session?.name||''}` }
        : { hotelId, guestId: selectedConv.guests?.id, department, category, description: requestText, room: selectedConv.guests?.room, priority, createdBy: `staff:${session?.name||''}` }
      await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSent(true)
      setRequestText('')
      setTimeout(() => setSent(false), 3000)
      loadData()
    } finally { setSending(false) }
  }

  const upcoming  = bookings.filter(b => ['confirmed','pending'].includes(b.status))
  const completed = bookings.filter(b => ['completed','resolved'].includes(b.status))
  const issues    = tickets.filter(t => !['resolved','cancelled'].includes(t.status))

  const sh = (title, sub, warn) => (
    <div style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '500', color: warn ? '#92400E' : 'var(--gray-500)', borderBottom: '0.5px solid var(--border)', background: warn ? '#FFFBEB' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <span>{title}</span>
      {sub && <span style={{ fontSize: '9px', fontWeight: '400', color: warn ? '#B45309' : 'var(--gray-400)' }}>{sub}</span>}
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 220px', height: '100%', overflow: 'hidden' }}>

      {/* LEFT: Conversations */}
      <div style={{ borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>
        {sh('Conversations', `${conversations.length} active`)}
        <div className="scrollable">
          {conversations.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '12px' }}>No active conversations</div>
          )}
          {conversations.map(conv => {
            const guest  = conv.guests || {}
            const msgs   = conv.messages || []
            const last   = msgs[msgs.length - 1]
            const lang   = guest.language || 'en'
            const lc     = LANG_COLORS[lang] || LANG_COLORS.en
            const isActive = selectedConv?.id === conv.id
            const minsAgo  = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
            const timeLabel = minsAgo === 0 ? 'now' : minsAgo < 60 ? `${minsAgo}m` : `${Math.floor(minsAgo/60)}h`
            const isEscalated = conv.status === 'escalated'
            return (
              <div key={conv.id} onClick={() => handleConvClick(conv)}
                style={{ padding: '9px 10px', borderBottom: '0.5px solid var(--border)', borderLeft: isActive ? '2px solid var(--gold)' : isEscalated ? '2px solid #D94040' : '2px solid transparent', background: isActive ? 'rgba(201,168,76,0.05)' : 'white', cursor: 'pointer' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--gray-50)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'white' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {guest.name} {guest.surname}
                    {guest.room && <span style={{ color: 'var(--gray-400)', fontWeight: '400' }}> · {guest.room}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {minsAgo < 2 && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
                    <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>{timeLabel}</div>
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '155px' }}>
                  {isEscalated && <span style={{ color: '#D94040', fontSize: '9px', fontWeight: '600', marginRight: '4px' }}>NEEDS REPLY</span>}
                  {last?.content || 'No messages yet'}
                </div>
                <div style={{ marginTop: '3px' }}>
                  <span style={{ fontSize: '8px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: lc.bg, color: lc.color }}>{lang.toUpperCase()}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CENTRE: Chat thread OR Staff portal */}
      <div style={{ background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Centre mode toggle */}
        <div style={{ background: 'white', borderBottom: '0.5px solid var(--border)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {['chat','portal'].map(mode => (
            <button key={mode} onClick={() => setCentreMode(mode)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px',
                border: '0.5px solid',
                borderColor: centreMode === mode ? 'var(--green-800)' : 'var(--border-md)',
                background: centreMode === mode ? 'var(--green-800)' : 'white',
                color: centreMode === mode ? 'white' : 'var(--gray-500)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
              {mode === 'chat' ? 'Chat thread' : 'Staff portal'}
            </button>
          ))}
          {selectedConv && (
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginLeft: '4px' }}>
              {selectedConv.guests?.name} {selectedConv.guests?.surname} · Room {selectedConv.guests?.room}
            </div>
          )}
          {centreMode === 'portal' && (
            <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--gray-400)' }}>
              Guest requests & bookings
            </div>
          )}
        </div>

        {/* ── CHAT THREAD MODE ── */}
        {centreMode === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {!selectedConv ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--gray-400)', fontSize: '12px' }}>
                Select a conversation to view the chat
              </div>
            ) : (
              <>
                <div className="scrollable" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(selectedConv.messages || []).map((msg, idx) => {
                    const isOut = msg.role === 'user'
                    return (
                      <div key={idx} style={{ display: 'flex', gap: '8px', flexDirection: isOut ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                        <div style={{
                          maxWidth: '68%', padding: '8px 11px',
                          borderRadius: isOut ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                          background: isOut ? 'var(--green-800)' : 'white',
                          color: isOut ? 'white' : 'var(--gray-800)',
                          fontSize: '11px', lineHeight: '1.5',
                          border: isOut ? 'none' : '0.5px solid var(--border)',
                        }}>
                          {msg.content}
                          {msg.sent_by && <div style={{ fontSize: '9px', opacity: 0.6, marginTop: '3px' }}>— {msg.sent_by}</div>}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--gray-300)', flexShrink: 0, paddingBottom: '2px' }}>
                          {new Date(msg.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Reply input — only for receptionist and manager */}
                {canReply(session?.role) ? (
                  <div style={{ padding: '10px 14px', background: 'white', borderTop: '0.5px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply() } }}
                      placeholder="Type a reply to the guest... (Enter to send)"
                      style={{
                        flex: 1, height: '60px', padding: '8px 10px',
                        border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-md)',
                        fontSize: '12px', fontFamily: 'var(--font)', resize: 'none', outline: 'none',
                        color: 'var(--gray-800)',
                      }}
                    />
                    <button onClick={handleReply} disabled={sending || !replyText.trim()}
                      style={{
                        padding: '8px 16px', background: replyText.trim() ? 'var(--green-800)' : 'var(--gray-200)',
                        border: 'none', borderRadius: 'var(--radius-md)', fontSize: '12px',
                        fontWeight: '500', color: replyText.trim() ? 'white' : 'var(--gray-400)',
                        cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                        fontFamily: 'var(--font)', flexShrink: 0, height: '60px',
                      }}>
                      {sending ? '...' : 'Send'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderTop: '0.5px solid var(--border)', fontSize: '11px', color: 'var(--gray-400)', textAlign: 'center' }}>
                    Only reception staff can reply to guests
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STAFF PORTAL MODE ── */}
        {centreMode === 'portal' && (
          <div className="scrollable" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Selected guest</div>
              {selectedConv ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'white', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--green-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--gold)', fontWeight: '600', flexShrink: 0 }}>
                    {(selectedConv.guests?.name?.[0]||'?')}{(selectedConv.guests?.surname?.[0]||'')}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-900)' }}>{selectedConv.guests?.name} {selectedConv.guests?.surname}</div>
                    <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>Room {selectedConv.guests?.room} · {(selectedConv.guests?.language||'en').toUpperCase()}</div>
                  </div>
                  <button onClick={() => setSelectedConv(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--gray-300)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <div style={{ padding: '10px', background: 'white', borderRadius: 'var(--radius-md)', border: '0.5px dashed var(--border-md)', textAlign: 'center', fontSize: '11px', color: 'var(--gray-400)' }}>
                  Select a conversation from the left
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Request type</div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {['external','internal'].map(t => (
                  <button key={t} onClick={() => setRequestType(t)}
                    style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '11px', border: '0.5px solid', borderColor: requestType === t ? 'var(--green-800)' : 'var(--border-md)', background: requestType === t ? 'var(--green-800)' : 'white', color: requestType === t ? 'white' : 'var(--gray-500)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {t === 'external' ? 'External booking' : 'Internal request'}
                  </button>
                ))}
              </div>
            </div>

            {requestType === 'external' && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Category</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {['taxi','restaurant','activity','boat tour','wine tour','late checkout'].map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      style={{ padding: '3px 9px', borderRadius: 'var(--radius-sm)', fontSize: '10px', border: '0.5px solid', borderColor: category === c ? 'var(--gold)' : 'var(--border)', background: category === c ? 'var(--gold-dim)' : 'white', color: category === c ? '#92400E' : 'var(--gray-500)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {requestType === 'internal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {[
                  { dept: 'housekeeping', label: 'Housekeeping', items: ['Extra towels','Room clean','Turndown','Pillows','Toiletries'] },
                  { dept: 'maintenance',  label: 'Maintenance',  items: ['Fix something','AC/heating','TV/wifi','Plumbing','Door/lock'] },
                  { dept: 'concierge',    label: 'Concierge',    items: ['Collect luggage','Deliver to room','Wake-up call','Baby cot','Iron'] },
                  { dept: 'fnb',          label: 'Food & bev',   items: ['Room service','Welcome drink','Special dietary'] },
                ].map(({ dept, label, items }) => (
                  <div key={dept}>
                    <div style={{ fontSize: '9px', color: 'var(--gray-400)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {items.map(item => {
                        const catKey = item.toLowerCase().replace(/\//g,'_').replace(/ /g,'_')
                        const isSel  = department === dept && category === catKey
                        return (
                          <button key={item} onClick={() => { setDepartment(dept); setCategory(catKey) }}
                            style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: '10px', border: '0.5px solid', borderColor: isSel ? 'var(--gold)' : 'var(--border)', background: isSel ? 'var(--gold-dim)' : 'white', color: isSel ? '#92400E' : 'var(--gray-500)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            {item}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Priority</div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {['normal','urgent'].map(p => (
                      <button key={p} onClick={() => setPriority(p)}
                        style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', border: '0.5px solid', borderColor: priority === p ? (p==='urgent'?'var(--red)':'var(--green-800)') : 'var(--border-md)', background: priority === p ? (p==='urgent'?'var(--red-light)':'var(--green-800)') : 'white', color: priority === p ? (p==='urgent'?'var(--red)':'white') : 'var(--gray-500)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                        {p.charAt(0).toUpperCase()+p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Details</div>
              <textarea value={requestText} onChange={e => setRequestText(e.target.value)}
                placeholder={requestType === 'external' ? 'e.g. Taxi to Larnaca airport at 6pm, 2 passengers' : 'e.g. AC not working in Room 312'}
                style={{ width: '100%', height: '52px', padding: '8px 10px', background: 'white', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '11px', color: 'var(--gray-700)', resize: 'none', fontFamily: 'var(--font)', outline: 'none' }}
              />
            </div>

            <button onClick={handleSendRequest} disabled={sending || !requestText.trim() || !selectedConv}
              style={{ width: '100%', padding: '9px', background: sent ? 'var(--success)' : (!requestText.trim()||!selectedConv) ? 'var(--gray-200)' : 'var(--green-800)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: '600', color: (!requestText.trim()||!selectedConv) ? 'var(--gray-400)' : 'white', cursor: (!requestText.trim()||!selectedConv) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', transition: 'background 0.2s' }}>
              {sent ? '✓ Sent' : sending ? 'Sending...' : requestType === 'external' ? 'Send request' : 'Create internal ticket'}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Issues · Upcoming · Completed */}
      <div style={{ borderLeft: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>
        <div className="scrollable">
          <div style={{ borderBottom: '0.5px solid var(--border)' }}>
            {sh('Issues & alerts', `${issues.length} need action`, issues.length > 0)}
            {issues.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '10px', color: 'var(--gray-400)', textAlign: 'center' }}>All clear ✓</div>
            ) : issues.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '8px 10px', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-sm)', background: t.priority==='urgent'?'var(--red-light)':'var(--amber-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0, marginTop: '1px' }}>
                  {t.priority==='urgent'?'!':'↩'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {t.description?.slice(0,35)}
                    {t.priority==='urgent'&&<span style={{ fontSize:'8px',fontWeight:'700',padding:'1px 5px',borderRadius:'4px',background:'var(--red-light)',color:'var(--red)',marginLeft:'4px' }}>urgent</span>}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginTop: '1px' }}>Room {t.room} · {t.department} · {t.status}</div>
                  <button style={{ fontSize:'9px',fontWeight:'500',padding:'2px 7px',borderRadius:'4px',border:'0.5px solid var(--amber)',background:'var(--amber-light)',color:'var(--amber)',cursor:'pointer',marginTop:'3px',fontFamily:'var(--font)' }}>
                    {t.escalation_level===0?'Call supervisor':t.escalation_level===1?'Call team':'Contact manager'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderBottom: '0.5px solid var(--border)' }}>
            {sh('Upcoming', 'today & tomorrow')}
            {upcoming.length===0 ? (
              <div style={{ padding:'12px 10px',fontSize:'10px',color:'var(--gray-400)',textAlign:'center' }}>No upcoming bookings</div>
            ) : upcoming.slice(0,6).map(b => {
              const tc    = TYPE_CONFIG[b.type]||TYPE_CONFIG.taxi
              const guest = b.guests||{}
              return (
                <div key={b.id} style={{ display:'flex',alignItems:'center',gap:'6px',padding:'7px 10px',borderBottom:'0.5px solid var(--border)' }}>
                  <div style={{ width:'6px',height:'6px',borderRadius:'50%',background:'var(--success)',flexShrink:0 }} />
                  <div style={{ width:'18px',height:'18px',borderRadius:'3px',background:tc.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:tc.color,flexShrink:0 }}>{tc.label}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'10px',fontWeight:'500',color:'var(--gray-900)' }}>{guest.name} · {guest.room}</div>
                    <div style={{ fontSize:'9px',color:'var(--gray-400)' }}>{b.partners?.name||b.type}</div>
                  </div>
                  <div style={{ fontSize:'9px',fontWeight:'500',color:'var(--gray-600)' }}>
                    {b.details?.time||new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              )
            })}
          </div>
          <div>
            {sh('Completed', `${completed.length} done`)}
            {completed.length===0 ? (
              <div style={{ padding:'12px 10px',fontSize:'10px',color:'var(--gray-400)',textAlign:'center' }}>None yet today</div>
            ) : completed.slice(0,5).map(b => {
              const tc    = TYPE_CONFIG[b.type]||TYPE_CONFIG.taxi
              const guest = b.guests||{}
              return (
                <div key={b.id} style={{ display:'flex',alignItems:'center',gap:'6px',padding:'7px 10px',borderBottom:'0.5px solid var(--border)' }}>
                  <div style={{ width:'6px',height:'6px',borderRadius:'50%',background:'var(--gray-300)',flexShrink:0 }} />
                  <div style={{ width:'18px',height:'18px',borderRadius:'3px',background:'var(--gray-100)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:'var(--gray-400)',flexShrink:0 }}>{tc.label}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'10px',fontWeight:'400',color:'var(--gray-500)' }}>{guest.name} · {guest.room}</div>
                    <div style={{ fontSize:'9px',color:'var(--gray-400)' }}>{b.partners?.name||b.type}</div>
                  </div>
                  <div style={{ fontSize:'9px',color:'var(--gray-400)' }}>
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
