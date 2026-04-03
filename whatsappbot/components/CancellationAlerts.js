'use client'
// components/CancellationAlerts.js
// Sequential acknowledgement flow with time-urgency display

import { useState, useEffect } from 'react'

const TYPE_CONFIG = {
  taxi:       { emoji: '🚗', label: 'Taxi',       color: '#16A34A', bg: '#DCFCE7' },
  restaurant: { emoji: '🍽️', label: 'Restaurant', color: '#2563EB', bg: '#DBEAFE' },
  activity:   { emoji: '⛵', label: 'Activity',   color: '#D97706', bg: '#FEF3C7' },
  default:    { emoji: '📋', label: 'Booking',    color: '#64748B', bg: '#F1F5F9' },
}

const F = "DM Sans,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

// ── TIME REMAINING HELPER ─────────────────────────────────────
function getTimeToService(details) {
  if (!details?.time || !details?.date) return null
  try {
    const [h, m]   = details.time.split(':').map(Number)
    const dateStr  = details.date  // e.g. "2026-04-05"
    const svcDate  = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
    const diffMs   = svcDate - Date.now()
    if (diffMs < 0) return { past: true, label: 'Service time passed', urgent: false }
    const diffMins = Math.floor(diffMs / 60000)
    const diffHrs  = Math.floor(diffMins / 60)
    const remMins  = diffMins % 60
    const urgent   = diffMins < 120  // under 2 hours
    const label    = diffHrs > 0
      ? `${diffHrs}h ${remMins}m until service`
      : `${diffMins}m until service`
    return { past: false, label, urgent, diffMins }
  } catch { return null }
}

// ── SINGLE CANCELLATION CARD ──────────────────────────────────
function CancellationCard({ cancellation, onAcknowledge, isMobile = false }) {
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState(true)  // default open — needs action
  const [note,     setNote]     = useState('')
  const [showNote, setShowNote] = useState(false)
  const [step,     setStep]     = useState(
    // Determine current step from existing ack state
    cancellation.ack_status === 'partner_confirmed' ? 'done' :
    cancellation.ack_status === 'issue'             ? 'done' :
    cancellation.ack_status === 'acknowledged'      ? 'step2' :
    'step1'
  )

  const guest    = cancellation.guests   || {}
  const partner  = cancellation.partners || {}
  const tc       = TYPE_CONFIG[cancellation.type] || TYPE_CONFIG.default
  const timeInfo = getTimeToService(cancellation.details)

  const cancelledAt = cancellation.cancelled_at
    ? new Date(cancellation.cancelled_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
    : '—'

  const serviceTime  = cancellation.details?.time || ''
  const serviceDate  = cancellation.details?.date  || ''
  const partnerPhone = partner.phone || guest.phone || ''

  async function handleAck(ackStatus) {
    setLoading(true)
    try {
      await onAcknowledge(cancellation.id, ackStatus, showNote ? note : null)
      if (ackStatus === 'acknowledged') {
        setStep('step2')
      } else {
        setStep('done')
      }
    } finally {
      setLoading(false)
    }
  }

  // Card left border color
  const borderColor = step === 'done'  ? '#86EFAC'
    : timeInfo?.urgent                 ? '#DC2626'
    : '#E5E7EB'

  return (
    <div style={{ background:'white', border:'0.5px solid #E5E7EB', borderLeft:`3px solid ${borderColor}`,
      borderRadius:'8px', marginBottom:'8px', overflow:'hidden', opacity:loading?0.6:1, transition:'opacity .2s', fontFamily:F }}>

      {/* Card header — always visible */}
      <div onClick={() => setExpanded(e => !e)}
        style={{ padding:isMobile?'10px 12px':'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:'10px' }}>

        <div style={{ width:'28px', height:'28px', borderRadius:'6px', background:tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>
          {tc.emoji}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'2px' }}>
            <span style={{ fontSize:'9px', fontWeight:'700', padding:'2px 5px', borderRadius:'3px', background:'#FEF2F2', color:'#DC2626', flexShrink:0 }}>CANCELLED</span>
            <span style={{ fontSize:'12px', fontWeight:'600', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {guest.name||'Guest'}{guest.room?` · Room ${guest.room}`:''}
            </span>
          </div>
          <div style={{ fontSize:'11px', color:'#6B7280' }}>
            {tc.label}{partner.name?` · ${partner.name}`:''}{serviceTime?` · ${serviceTime}`:''}{serviceDate?` · ${serviceDate}`:''}
          </div>

          {/* Time urgency — shown in header always */}
          {timeInfo && !timeInfo.past && (
            <div style={{ marginTop:'3px', display:'flex', alignItems:'center', gap:'5px' }}>
              {timeInfo.urgent
                ? <span style={{ fontSize:'10px', fontWeight:'700', color:'#DC2626', background:'#FEF2F2', padding:'1px 6px', borderRadius:'4px' }}>
                    ⚠ Call partner now · {timeInfo.label}
                  </span>
                : <span style={{ fontSize:'10px', color:'#D97706', fontWeight:'500' }}>
                    ⏱ {timeInfo.label}
                  </span>
              }
            </div>
          )}
          {timeInfo?.past && (
            <div style={{ marginTop:'3px', fontSize:'10px', color:'#9CA3AF' }}>Service time has passed</div>
          )}
        </div>

        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:'11px', color:'#374151', fontWeight:'500' }}>{cancelledAt}</div>
          {/* Partner notified — only show if NOT notified (if notified, no need to highlight) */}
          {!cancellation.partner_notified && (
            <div style={{ fontSize:'10px', color:'#D97706', marginTop:'1px' }}>⏳ Notifying partner</div>
          )}
          {step === 'done' && (
            <div style={{ fontSize:'10px', color:'#16A34A', marginTop:'1px', fontWeight:'600' }}>✓ Done</div>
          )}
        </div>

        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink:0 }}>
          <path d={expanded?'M1 7L5 3L9 7':'M1 3L5 7L9 3'} stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding:isMobile?'0 12px 12px':'0 14px 12px', borderTop:'0.5px solid #F3F4F6' }}>

          {/* Details */}
          <div style={{ fontSize:'11px', color:'#374151', padding:'8px 0', display:'flex', flexDirection:'column', gap:'3px' }}>
            {partnerPhone && (
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <span>📞 {partnerPhone}</span>
                {timeInfo?.urgent && (
                  <a href={`tel:${partnerPhone}`}
                    style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'4px', background:'#DC2626', color:'white', textDecoration:'none' }}>
                    Call now
                  </a>
                )}
              </div>
            )}
            {cancellation.cancel_reason && <div>💬 Reason: {cancellation.cancel_reason}</div>}
            {cancellation.commission_amount > 0 && (
              <div style={{ color:'#D97706' }}>💰 Commission reversed: €{cancellation.commission_amount}</div>
            )}
          </div>

          {/* ── STEP 1: Not yet acknowledged ── */}
          {step === 'step1' && (
            <div style={{ marginTop:'4px' }}>
              <div style={{ fontSize:'11px', color:'#6B7280', marginBottom:'8px' }}>
                {timeInfo?.urgent
                  ? '⚠ Service is imminent — call the partner to confirm cancellation, then mark as seen.'
                  : 'Read the details above, then mark as seen to proceed.'
                }
              </div>
              <button onClick={() => handleAck('acknowledged')} disabled={loading}
                style={{ padding:'7px 16px', fontSize:'12px', fontWeight:'700', borderRadius:'7px',
                  border:'0.5px solid #86EFAC', background:'#DCFCE7', color:'#14532D',
                  cursor:loading?'not-allowed':'pointer', fontFamily:F }}>
                👁 Mark as seen
              </button>
            </div>
          )}

          {/* ── STEP 2: Acknowledged — now confirm partner ── */}
          {step === 'step2' && (
            <div style={{ marginTop:'4px' }}>
              {/* Partner notification status — explicit, not just a tick */}
              <div style={{ padding:'8px 10px', borderRadius:'7px', marginBottom:'8px',
                background: cancellation.partner_notified ? '#F0FDF4' : '#FFF7ED',
                border: `0.5px solid ${cancellation.partner_notified ? '#86EFAC' : '#FCD34D'}` }}>
                {cancellation.partner_notified
                  ? <span style={{ fontSize:'11px', color:'#14532D' }}>✓ Partner was sent a WhatsApp cancellation notice</span>
                  : <span style={{ fontSize:'11px', color:'#92400E' }}>⚠ WhatsApp to partner failed — contact them directly</span>
                }
              </div>

              <div style={{ fontSize:'11px', color:'#6B7280', marginBottom:'8px' }}>
                {timeInfo?.urgent
                  ? 'Did you call the partner and confirm they will not proceed?'
                  : 'Did the partner confirm they received the cancellation?'
                }
              </div>

              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                <button onClick={() => handleAck('partner_confirmed')} disabled={loading}
                  style={{ padding:'6px 14px', fontSize:'11px', fontWeight:'700', borderRadius:'7px',
                    border:'0.5px solid #93C5FD', background:'#DBEAFE', color:'#1E3A5F',
                    cursor:loading?'not-allowed':'pointer', fontFamily:F }}>
                  {timeInfo?.urgent ? '✅ Called and confirmed' : '✅ Partner confirmed'}
                </button>
                <button onClick={() => handleAck('issue')} disabled={loading}
                  style={{ padding:'6px 14px', fontSize:'11px', fontWeight:'700', borderRadius:'7px',
                    border:'0.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626',
                    cursor:loading?'not-allowed':'pointer', fontFamily:F }}>
                  ⚠ Issue — follow up
                </button>
              </div>
            </div>
          )}

          {/* ── DONE: resolved ── */}
          {step === 'done' && (
            <div style={{ padding:'8px 10px', borderRadius:'7px', background:'#F0FDF4', border:'0.5px solid #86EFAC' }}>
              <span style={{ fontSize:'11px', color:'#14532D', fontWeight:'600' }}>
                {cancellation.ack_status === 'partner_confirmed'
                  ? '✓ Cancellation resolved — partner confirmed'
                  : '⚠ Flagged for follow up'
                }
              </span>
            </div>
          )}

          {/* Note — available at all steps */}
          <div style={{ marginTop:'8px' }}>
            <button onClick={() => setShowNote(n => !n)}
              style={{ fontSize:'10px', color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:F }}>
              {showNote ? '− Hide note' : '+ Add note'}
            </button>
            {showNote && (
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="Note for the team..."
                rows={2}
                style={{ width:'100%', marginTop:'6px', padding:'6px 8px', fontSize:'12px',
                  border:'0.5px solid #E5E7EB', borderRadius:'6px', fontFamily:F,
                  resize:'none', color:'#374151', background:'#F9FAFB', boxSizing:'border-box' }}
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
      // Remove from active queue once fully resolved
      if (ackStatus === 'partner_confirmed' || ackStatus === 'issue') {
        setCancellations(prev => prev.filter(c => c.id !== bookingId))
      }
    } catch (err) {
      console.error('Acknowledge failed:', err)
    }
  }

  if (loading || cancellations.length === 0) return null

  return (
    <div style={{ marginBottom:'12px', fontFamily:F }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'8px' }}>
        <div style={{ fontSize:'10px', fontWeight:'700', color:'#DC2626', textTransform:'uppercase', letterSpacing:'0.05em' }}>
          Cancellations
        </div>
        <div style={{ width:'18px', height:'18px', borderRadius:'50%', background:'#FEF2F2', border:'0.5px solid #FCA5A5',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#DC2626' }}>
          {cancellations.length}
        </div>
        <div style={{ flex:1, height:'0.5px', background:'#FCA5A5' }} />
      </div>

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
