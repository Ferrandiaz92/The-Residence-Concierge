// components/LiveTab.js
'use client'
import { useState, useEffect } from 'react'

const LANG_COLORS = {
  en: { bg: '#F0FDF4', color: '#16A34A' },
  ru: { bg: '#EFF6FF', color: '#2563EB' },
  he: { bg: '#FEF3C7', color: '#D97706' },
}

const TYPE_CONFIG = {
  taxi:         { label: 'T', bg: '#F0FDF4', color: '#16A34A' },
  restaurant:   { label: 'R', bg: '#EFF6FF', color: '#2563EB' },
  activity:     { label: 'B', bg: '#FEF3C7', color: '#D97706' },
  late_checkout:{ label: 'L', bg: '#FDF2F8', color: '#9333EA' },
  maintenance:  { label: 'MT', bg: '#F1F5F9', color: '#64748B' },
  housekeeping: { label: 'HK', bg: '#F0FDF4', color: '#16A34A' },
  concierge:    { label: 'CS', bg: '#FDF2F8', color: '#9333EA' },
  fnb:          { label: 'FB', bg: '#FEF3C7', color: '#D97706' },
}

export default function LiveTab({ hotelId, onSelectGuest }) {
  const [conversations, setConversations] = useState([])
  const [bookings, setBookings]           = useState([])
  const [tickets, setTickets]             = useState([])
  const [selectedConv, setSelectedConv]   = useState(null)
  const [requestType, setRequestType]     = useState('external')
  const [category, setCategory]           = useState('taxi')
  const [department, setDepartment]       = useState('maintenance')
  const [requestText, setRequestText]     = useState('')
  const [priority, setPriority]           = useState('normal')
  const [sending, setSending]             = useState(false)
  const [sent, setSent]                   = useState(false)

  useEffect(() => {
    if (!hotelId) return
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [hotelId])

  async function loadData() {
    const [convRes, bookRes, tickRes] = await Promise.all([
      fetch(`/api/conversations?hotelId=${hotelId}`),
      fetch(`/api/bookings?hotelId=${hotelId}`),
      fetch(`/api/tickets?hotelId=${hotelId}`),
    ])
    const [convData, bookData, tickData] = await Promise.all([
      convRes.json(), bookRes.json(), tickRes.json()
    ])
    setConversations(convData.conversations || [])
    setBookings(bookData.bookings || [])
    setTickets(tickData.tickets || [])
  }

  async function handleSend() {
    if (!requestText.trim() || !selectedConv) return
    setSending(true)
    try {
      const endpoint = requestType === 'external' ? '/api/bookings' : '/api/tickets'
      const body = requestType === 'external'
        ? { hotelId, guestId: selectedConv.guests?.id, type: category, details: { description: requestText }, createdBy: 'staff' }
        : { hotelId, guestId: selectedConv.guests?.id, department, category: department, description: requestText, room: selectedConv.guests?.room, priority, createdBy: 'staff' }
      await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSent(true)
      setRequestText('')
      setTimeout(() => setSent(false), 3000)
      loadData()
    } finally { setSending(false) }
  }

  // Split bookings
  const upcoming  = bookings.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const completed = bookings.filter(b => b.status === 'completed' || b.status === 'resolved')
  const issues    = tickets.filter(t => !['resolved','cancelled'].includes(t.status))

  const sh = (title, sub, warn) => (
    <div style={{
      padding: '7px 10px', fontSize: '10px', fontWeight: '500',
      color: warn ? '#92400E' : 'var(--gray-500)',
      borderBottom: '0.5px solid var(--border)',
      background: warn ? '#FFFBEB' : 'white',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexShrink: 0,
    }}>
      <span>{title}</span>
      {sub && <span style={{ fontSize: '9px', fontWeight: '400', color: warn ? '#B45309' : 'var(--gray-400)' }}>{sub}</span>}
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 220px', height: '100%', overflow: 'hidden' }}>

      {/* ── LEFT: Conversations ── */}
      <div style={{ borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>
        {sh('Conversations', `${conversations.length} active`)}
        <div className="scrollable">
          {conversations.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '12px' }}>
              No active conversations
            </div>
          )}
          {conversations.map(conv => {
            const guest = conv.guests || {}
            const msgs  = conv.messages || []
            const last  = msgs[msgs.length - 1]
            const lang  = guest.language || 'en'
            const lc    = LANG_COLORS[lang] || LANG_COLORS.en
            const isActive = selectedConv?.id === conv.id
            const initials = `${guest.name?.[0]||'?'}${guest.surname?.[0]||''}`
            const minutesAgo = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
            const timeLabel = minutesAgo === 0 ? 'now' : minutesAgo < 60 ? `${minutesAgo}m` : `${Math.floor(minutesAgo/60)}h`

            return (
              <div key={conv.id}
                onClick={() => setSelectedConv(conv)}
                style={{
                  padding: '9px 10px',
                  borderBottom: '0.5px solid var(--border)',
                  borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                  background: isActive ? 'rgba(201,168,76,0.05)' : 'white',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--gray-50)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'white' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {guest.name} {guest.surname}
                    {guest.room && <span style={{ color: 'var(--gray-400)', fontWeight: '400' }}> · {guest.room}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {minutesAgo < 2 && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
                    <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>{timeLabel}</div>
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '155px' }}>
                  {last?.content || 'No messages yet'}
                </div>
                <div style={{ marginTop: '3px' }}>
                  <span style={{ fontSize: '8px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: lc.bg, color: lc.color }}>
                    {lang.toUpperCase()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── CENTER: Staff Portal ── */}
      <div style={{ background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {sh('Staff portal', 'Guest requests & bookings')}
        <div className="scrollable" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Guest chip */}
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
                Select a conversation or search for a guest
              </div>
            )}
          </div>

          {/* Request type toggle */}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Request type</div>
            <div style={{ display: 'flex', gap: '5px' }}>
              {['external', 'internal'].map(t => (
                <button key={t} onClick={() => setRequestType(t)}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', fontSize: '11px',
                    border: '0.5px solid',
                    borderColor: requestType === t ? 'var(--green-800)' : 'var(--border-md)',
                    background: requestType === t ? 'var(--green-800)' : 'white',
                    color: requestType === t ? 'white' : 'var(--gray-500)',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}>
                  {t === 'external' ? 'External booking' : 'Internal request'}
                </button>
              ))}
            </div>
          </div>

          {/* External categories */}
          {requestType === 'external' && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Category</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {['taxi','restaurant','activity','boat tour','wine tour','late checkout'].map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    style={{
                      padding: '3px 9px', borderRadius: 'var(--radius-sm)', fontSize: '10px',
                      border: '0.5px solid',
                      borderColor: category === c ? 'var(--gold)' : 'var(--border)',
                      background: category === c ? 'var(--gold-dim)' : 'white',
                      color: category === c ? '#92400E' : 'var(--gray-500)',
                      cursor: 'pointer', fontFamily: 'var(--font)',
                    }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Internal departments */}
          {requestType === 'internal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[
                { dept: 'housekeeping', label: 'Housekeeping', items: ['Extra towels','Room clean','Turndown','Pillows','Toiletries'] },
                { dept: 'maintenance', label: 'Maintenance', items: ['Fix something','AC/heating','TV/wifi','Plumbing','Door/lock'] },
                { dept: 'concierge', label: 'Concierge services', items: ['Collect luggage','Deliver to room','Wake-up call','Baby cot','Iron'] },
                { dept: 'fnb', label: 'Food & beverage', items: ['Room service','Welcome drink','Special dietary'] },
              ].map(({ dept, label, items }) => (
                <div key={dept}>
                  <div style={{ fontSize: '9px', color: 'var(--gray-400)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {items.map(item => (
                      <button key={item}
                        onClick={() => { setDepartment(dept); setCategory(item.toLowerCase().replace(/\//g,'_').replace(/ /g,'_')) }}
                        style={{
                          padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: '10px',
                          border: '0.5px solid',
                          borderColor: department === dept && category === item.toLowerCase().replace(/\//g,'_').replace(/ /g,'_') ? 'var(--gold)' : 'var(--border)',
                          background: department === dept && category === item.toLowerCase().replace(/\//g,'_').replace(/ /g,'_') ? 'var(--gold-dim)' : 'white',
                          color: department === dept && category === item.toLowerCase().replace(/\//g,'_').replace(/ /g,'_') ? '#92400E' : 'var(--gray-500)',
                          cursor: 'pointer', fontFamily: 'var(--font)',
                        }}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* Priority */}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Priority</div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {['normal','urgent'].map(p => (
                    <button key={p} onClick={() => setPriority(p)}
                      style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '10px',
                        border: '0.5px solid',
                        borderColor: priority === p ? (p === 'urgent' ? 'var(--red)' : 'var(--green-800)') : 'var(--border-md)',
                        background: priority === p ? (p === 'urgent' ? 'var(--red-light)' : 'var(--green-800)') : 'white',
                        color: priority === p ? (p === 'urgent' ? 'var(--red)' : 'white') : 'var(--gray-500)',
                        cursor: 'pointer', fontFamily: 'var(--font)',
                      }}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Details textarea */}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px', fontWeight: '500' }}>Details</div>
            <textarea
              value={requestText}
              onChange={e => setRequestText(e.target.value)}
              placeholder={requestType === 'external' ? 'e.g. Taxi to Larnaca airport at 6pm, 2 passengers' : 'e.g. AC not working, making strange noise'}
              style={{
                width: '100%', height: '52px', padding: '8px 10px',
                background: 'white', border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius-md)', fontSize: '11px',
                color: 'var(--gray-700)', resize: 'none',
                fontFamily: 'var(--font)', outline: 'none',
              }}
            />
          </div>

          {/* CTA */}
          <button onClick={handleSend} disabled={sending || !requestText.trim() || !selectedConv}
            style={{
              width: '100%', padding: '9px',
              background: sent ? 'var(--success)' : (!requestText.trim() || !selectedConv) ? 'var(--gray-200)' : 'var(--green-800)',
              border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: '12px', fontWeight: '600',
              color: (!requestText.trim() || !selectedConv) ? 'var(--gray-400)' : 'white',
              cursor: (!requestText.trim() || !selectedConv) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)', transition: 'background 0.2s',
            }}>
            {sent ? '✓ Sent successfully' : sending ? 'Sending...' : requestType === 'external' ? 'Send request' : 'Create internal ticket'}
          </button>

          {/* Internal ticket log */}
          {requestType === 'internal' && issues.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '6px', fontWeight: '500' }}>Open tickets today</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {issues.slice(0, 5).map(t => {
                  const tc = TYPE_CONFIG[t.department] || TYPE_CONFIG.maintenance
                  const statusColor = t.status === 'resolved' ? 'var(--success)' : t.status === 'in_progress' ? 'var(--amber)' : 'var(--gray-400)'
                  const statusLabel = t.status === 'in_progress' ? 'In progress' : t.status.charAt(0).toUpperCase() + t.status.slice(1)
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: 'white', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)' }}>
                      <div style={{ fontSize: '8px', fontWeight: '700', padding: '2px 5px', borderRadius: '3px', background: tc.bg, color: tc.color, flexShrink: 0 }}>{tc.label}</div>
                      <div style={{ flex: 1, fontSize: '10px', color: 'var(--gray-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description} · Room {t.room}</div>
                      <div style={{ fontSize: '8px', fontWeight: '600', color: statusColor, flexShrink: 0 }}>{statusLabel}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Issues · Upcoming · Completed ── */}
      <div style={{ borderLeft: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>
        <div className="scrollable">

          {/* Issues */}
          <div style={{ borderBottom: '0.5px solid var(--border)' }}>
            {sh('Issues & alerts', `${issues.length} need action`, issues.length > 0)}
            {issues.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '10px', color: 'var(--gray-400)', textAlign: 'center' }}>All clear</div>
            ) : issues.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '8px 10px', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-sm)', background: t.priority === 'urgent' ? 'var(--red-light)' : 'var(--amber-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0, marginTop: '1px' }}>
                  {t.priority === 'urgent' ? '!' : '↩'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {t.description.slice(0, 30)}...
                    {t.priority === 'urgent' && <span style={{ fontSize: '8px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: 'var(--red-light)', color: 'var(--red)', marginLeft: '4px' }}>urgent</span>}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginTop: '1px' }}>Room {t.room} · {t.department} · {t.status}</div>
                  <button style={{ fontSize: '9px', fontWeight: '500', padding: '2px 7px', borderRadius: '4px', border: '0.5px solid var(--amber)', background: 'var(--amber-light)', color: 'var(--amber)', cursor: 'pointer', marginTop: '3px', fontFamily: 'var(--font)' }}>
                    {t.escalation_level === 0 ? 'Call supervisor' : t.escalation_level === 1 ? 'Call team' : 'Contact manager'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Upcoming */}
          <div style={{ borderBottom: '0.5px solid var(--border)' }}>
            {sh('Upcoming', 'today & tomorrow')}
            {upcoming.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '10px', color: 'var(--gray-400)', textAlign: 'center' }}>No upcoming bookings</div>
            ) : upcoming.slice(0, 6).map(b => {
              const tc = TYPE_CONFIG[b.type] || TYPE_CONFIG.taxi
              const guest = b.guests || {}
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                  <div style={{ width: '18px', height: '18px', borderRadius: '3px', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '700', color: tc.color, flexShrink: 0 }}>{tc.label}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: '500', color: 'var(--gray-900)' }}>{guest.name} · {guest.room}</div>
                    <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>{b.partners?.name || b.type}</div>
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: '500', color: 'var(--gray-600)' }}>
                    {b.details?.time || new Date(b.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Completed */}
          <div>
            {sh('Completed', `${completed.length} done`)}
            {completed.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '10px', color: 'var(--gray-400)', textAlign: 'center' }}>None yet today</div>
            ) : completed.slice(0, 5).map(b => {
              const tc = TYPE_CONFIG[b.type] || TYPE_CONFIG.taxi
              const guest = b.guests || {}
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gray-300)', flexShrink: 0 }} />
                  <div style={{ width: '18px', height: '18px', borderRadius: '3px', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '700', color: 'var(--gray-400)', flexShrink: 0 }}>{tc.label}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: '400', color: 'var(--gray-500)' }}>{guest.name} · {guest.room}</div>
                    <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>{b.partners?.name || b.type}</div>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>
                    {new Date(b.confirmed_at || b.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
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
