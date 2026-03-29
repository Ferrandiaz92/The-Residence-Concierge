'use client'
// components/CancellationAlerts.js
// ─────────────────────────────────────────────────────────────
// Cancellation alert cards with acknowledgement buttons.
// Shows in the Alerts/Live column for receptionist, manager, supervisor.
// Works on both desktop and mobile.
//
// Three ack states:
//   "Acknowledged"              — seen it, no issues
//   "Partner confirmed cancel"  — partner confirmed they got the message
//   "Issue — follow up needed"  — partner didn't respond or there's a dispute
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

const TYPE_CONFIG = {
  taxi:       { emoji: '🚗', label: 'Taxi',       color: '#16A34A', bg: '#DCFCE7' },
  restaurant: { emoji: '🍽️', label: 'Restaurant', color: '#2563EB', bg: '#DBEAFE' },
  activity:   { emoji: '⛵', label: 'Activity',   color: '#D97706', bg: '#FEF3C7' },
  default:    { emoji: '📋', label: 'Booking',    color: '#64748B', bg: '#F1F5F9' },
}

const ACK_BUTTONS = [
  {
    key:   'acknowledged',
    label: 'Acknowledged',
    short: 'Ack',
    color: '#16A34A',
    bg:    '#DCFCE7',
    border:'#86EFAC',
    icon:  '✓',
  },
  {
    key:   'partner_confirmed',
    label: 'Partner confirmed',
    short: 'Partner OK',
    color: '#2563EB',
    bg:    '#DBEAFE',
    border:'#93C5FD',
    icon:  '✅',
  },
  {
    key:   'issue',
    label: 'Issue — follow up',
    short: 'Issue',
    color: '#DC2626',
    bg:    '#FEF2F2',
    border:'#FCA5A5',
    icon:  '⚠',
  },
]

// ── SINGLE CANCELLATION CARD ──────────────────────────────────
function CancellationCard({ cancellation, onAcknowledge, isMobile = false }) {
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [note,     setNote]     = useState('')
  const [showNote, setShowNote] = useState(false)

  const guest   = cancellation.guests   || {}
  const partner = cancellation.partners || {}
  const tc      = TYPE_CONFIG[cancellation.type] || TYPE_CONFIG.default

  const cancelledAt = cancellation.cancelled_at
    ? new Date(cancellation.cancelled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '—'

  const time    = cancellation.details?.time || ''
  const date    = cancellation.details?.date || ''

  async function handleAck(ackStatus) {
    setLoading(true)
    try {
      await onAcknowledge(cancellation.id, ackStatus, showNote ? note : null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background:   'white',
      border:       '0.5px solid #E5E7EB',
      borderLeft:   '3px solid #DC2626',
      borderRadius: '8px',
      marginBottom: '8px',
      overflow:     'hidden',
      opacity:      loading ? 0.6 : 1,
      transition:   'opacity .2s',
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: isMobile ? '10px 12px' : '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
      >
        {/* Type badge */}
        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
          {tc.emoji}
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 5px', borderRadius: '3px', background: '#FEF2F2', color: '#DC2626', flexShrink: 0 }}>CANCELLED</span>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {guest.name || 'Guest'}{guest.room ? ` · Room ${guest.room}` : ''}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            {tc.label}{partner.name ? ` · ${partner.name}` : ''}{time ? ` · ${time}` : ''}{date ? ` · ${date}` : ''}
          </div>
        </div>

        {/* Time + partner notified status */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: '#374151', fontWeight: '500' }}>{cancelledAt}</div>
          <div style={{ fontSize: '10px', color: cancellation.partner_notified ? '#16A34A' : '#D97706', marginTop: '1px' }}>
            {cancellation.partner_notified ? '✓ Notified' : '⏳ Notifying'}
          </div>
        </div>

        {/* Expand chevron */}
        <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d={expanded ? 'M1 7L5 3L9 7' : 'M1 3L5 7L9 3'} stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div style={{ padding: isMobile ? '0 12px 12px' : '0 14px 12px', borderTop: '0.5px solid #F3F4F6' }}>
          {/* Details */}
          <div style={{ fontSize: '11px', color: '#374151', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {guest.phone && <div>📞 {guest.phone}</div>}
            {cancellation.cancel_reason && <div>💬 Reason: {cancellation.cancel_reason}</div>}
            {cancellation.commission_amount > 0 && (
              <div style={{ color: '#D97706' }}>💰 Commission reversed: €{cancellation.commission_amount}</div>
            )}
            {!cancellation.partner_notified && (
              <div style={{ color: '#DC2626', fontWeight: '500' }}>⚠ Partner notification pending — retry in progress</div>
            )}
          </div>

          {/* Acknowledgement buttons */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
            {ACK_BUTTONS.map(btn => (
              <button
                key={btn.key}
                onClick={() => handleAck(btn.key)}
                disabled={loading}
                style={{
                  padding:      isMobile ? '6px 10px' : '5px 10px',
                  fontSize:     '11px',
                  fontWeight:   '600',
                  borderRadius: '6px',
                  border:       `0.5px solid ${btn.border}`,
                  background:   btn.bg,
                  color:        btn.color,
                  cursor:       loading ? 'not-allowed' : 'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '4px',
                  flexShrink:   0,
                  fontFamily:   'inherit',
                  transition:   'opacity .15s',
                }}
              >
                <span>{btn.icon}</span>
                <span>{isMobile ? btn.short : btn.label}</span>
              </button>
            ))}
          </div>

          {/* Optional note */}
          <div style={{ marginTop: '8px' }}>
            <button
              onClick={() => setShowNote(n => !n)}
              style={{ fontSize: '10px', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              {showNote ? '− Hide note' : '+ Add note'}
            </button>
            {showNote && (
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional note for the team..."
                rows={2}
                style={{
                  width:        '100%',
                  marginTop:    '6px',
                  padding:      '6px 8px',
                  fontSize:     '12px',
                  border:       '0.5px solid #E5E7EB',
                  borderRadius: '6px',
                  fontFamily:   'inherit',
                  resize:       'none',
                  color:        '#374151',
                  background:   '#F9FAFB',
                  boxSizing:    'border-box',
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function CancellationAlerts({ hotelId, session, isMobile = false }) {
  const [cancellations, setCancellations] = useState([])
  const [loading,       setLoading]       = useState(true)

  // Only show to roles that need to acknowledge
  const allowedRoles = ['manager', 'receptionist', 'supervisor']
  if (!allowedRoles.includes(session?.role)) return null

  useEffect(() => {
    if (!hotelId) return
    loadCancellations()
    const interval = setInterval(loadCancellations, 30000)
    return () => clearInterval(interval)
  }, [hotelId])

  async function loadCancellations() {
    try {
      const res  = await fetch(`/api/cancellations?hotelId=${hotelId}`)
      const data = await res.json()
      setCancellations(data.cancellations || [])
    } catch {} finally {
      setLoading(false)
    }
  }

  async function handleAcknowledge(bookingId, ackStatus, note) {
    try {
      await fetch('/api/cancellations', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingId, ackStatus, note }),
      })
      // Remove from list
      setCancellations(prev => prev.filter(c => c.id !== bookingId))
    } catch (err) {
      console.error('Acknowledge failed:', err)
    }
  }

  if (loading) return null
  if (cancellations.length === 0) return null

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cancellations
        </div>
        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#FEF2F2', border: '0.5px solid #FCA5A5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#DC2626' }}>
          {cancellations.length}
        </div>
        <div style={{ flex: 1, height: '0.5px', background: '#FCA5A5' }} />
      </div>

      {/* Cards */}
      {cancellations.map(c => (
        <CancellationCard
          key={c.id}
          cancellation={c}
          onAcknowledge={handleAcknowledge}
          isMobile={isMobile}
        />
      ))}
    </div>
  )
}
