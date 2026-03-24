// components/GuestsTab.js
'use client'
import { useState, useEffect } from 'react'

export default function GuestsTab({ hotelId, selectedGuest }) {
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    if (selectedGuest?.id) loadProfile(selectedGuest.id)
  }, [selectedGuest])

  async function loadProfile(guestId) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/guests/${guestId}`)
      const data = await res.json()
      setProfile(data)
      setNotes(data.guest?.notes || '')
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
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: '12px',
        color: 'var(--gray-400)', fontFamily: 'var(--font)',
      }}>
        <div style={{ fontSize: '32px', opacity: 0.3 }}>○</div>
        <div style={{ fontSize: '13px' }}>Search for a guest to view their profile</div>
        <div style={{ fontSize: '11px', color: 'var(--gray-300)' }}>Use the search bar at the top</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--gray-400)', fontFamily: 'var(--font)' }}>
        Loading guest profile...
      </div>
    )
  }

  if (!profile) return null

  const { guest, conversations, bookings } = profile
  const initials = `${guest.name?.[0]||'?'}${guest.surname?.[0]||''}`

  // Build timeline — merge all conversations' messages
  const allMessages = conversations.flatMap(conv =>
    (conv.messages || []).map(m => ({ ...m, convId: conv.id }))
  ).sort((a, b) => new Date(a.ts) - new Date(b.ts))

  // Group by date
  const grouped = {}
  allMessages.forEach(m => {
    const date = new Date(m.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(m)
  })

  // Also insert booking events by date
  bookings.forEach(b => {
    const date = new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push({ ...b, _isBooking: true, ts: b.created_at })
  })

  // Sort each group by time
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a, b) => new Date(a.ts) - new Date(b.ts))
  })

  const TYPE_COLORS = {
    taxi:          { bg: '#F0FDF4', color: '#16A34A', label: 'T' },
    restaurant:    { bg: '#EFF6FF', color: '#2563EB', label: 'R' },
    activity:      { bg: '#FEF3C7', color: '#D97706', label: 'B' },
    late_checkout: { bg: '#FDF2F8', color: '#9333EA', label: 'L' },
    housekeeping:  { bg: '#F1F5F9', color: '#64748B', label: 'HK' },
    maintenance:   { bg: '#F1F5F9', color: '#64748B', label: 'MT' },
    concierge:     { bg: '#FDF2F8', color: '#9333EA', label: 'CS' },
  }

  const isCheckinDate = (dateStr) => {
    if (!guest.check_in) return false
    return new Date(guest.check_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) === dateStr
  }

  const langColors = {
    en: { bg: '#F0FDF4', color: '#16A34A' },
    ru: { bg: '#EFF6FF', color: '#2563EB' },
    he: { bg: '#FEF3C7', color: '#D97706' },
  }
  const lc = langColors[guest.language] || langColors.en

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'var(--font)' }}>

      {/* Guest header */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid var(--border)',
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0,
      }}>
        <div style={{
          width: '46px', height: '46px', borderRadius: '50%',
          background: 'var(--green-800)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '15px', color: 'var(--gold)', fontWeight: '600', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '17px', fontWeight: '500', color: 'var(--gray-900)' }}>
            {guest.name} {guest.surname}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {guest.phone} {guest.email ? `· ${guest.email}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
            {guest.room && (
              <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '5px', background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                Room {guest.room}
              </span>
            )}
            {guest.check_in && (
              <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '5px', background: '#F0FDF4', color: '#16A34A' }}>
                In: {new Date(guest.check_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {guest.check_out && (
              <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '5px', background: '#EFF6FF', color: '#2563EB' }}>
                Out: {new Date(guest.check_out).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
            <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '5px', background: lc.bg, color: lc.color }}>
              {(guest.language || 'EN').toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Body: timeline + summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', flex: 1, overflow: 'hidden' }}>

        {/* Timeline */}
        <div style={{ borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '7px 12px', fontSize: '10px', fontWeight: '500', color: 'var(--gray-500)', borderBottom: '0.5px solid var(--border)', background: 'white', flexShrink: 0 }}>
            Full conversation history
            <span style={{ fontSize: '9px', color: 'var(--gray-300)', marginLeft: '6px' }}>
              {allMessages.length} messages · {bookings.length} bookings
            </span>
          </div>
          <div className="scrollable" style={{ padding: '14px 16px', background: 'var(--gray-50)' }}>
            {Object.keys(grouped).length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '12px', padding: '30px' }}>
                No conversation history yet
              </div>
            )}
            {Object.keys(grouped).map(date => (
              <div key={date} style={{ marginBottom: '16px' }}>
                {/* Day label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: isCheckinDate(date) ? '700' : '500', color: isCheckinDate(date) ? 'var(--gold)' : 'var(--gray-400)' }}>
                    {isCheckinDate(date) ? `Check-in · ${date}` : date}
                  </div>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                </div>

                {grouped[date].map((item, idx) => {
                  if (item._isBooking) {
                    const tc = TYPE_COLORS[item.type] || TYPE_COLORS.taxi
                    const isDone = ['confirmed','resolved','completed'].includes(item.status)
                    return (
                      <div key={`b-${item.id}-${idx}`} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 10px', marginBottom: '8px',
                        background: 'white', borderRadius: 'var(--radius-md)',
                        borderLeft: `2px solid ${isDone ? 'var(--gray-200)' : 'var(--green-600)'}`,
                        opacity: isDone ? 0.7 : 1,
                      }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', color: tc.color, flexShrink: 0 }}>
                          {tc.label}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', fontWeight: '500', color: 'var(--gray-800)' }}>
                            {item.partners?.name || item.type}
                            {item.details?.destination ? ` → ${item.details.destination}` : ''}
                            {item.details?.time ? ` · ${item.details.time}` : ''}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginTop: '1px' }}>
                            {new Date(item.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ fontSize: '9px', fontWeight: '500', color: isDone ? 'var(--gray-400)' : 'var(--gold)' }}>
                          {isDone ? 'Done' : item.status}
                        </div>
                      </div>
                    )
                  }

                  const isOut = item.role === 'user'
                  return (
                    <div key={`m-${idx}`} style={{
                      display: 'flex', gap: '8px', marginBottom: '6px',
                      flexDirection: isOut ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                    }}>
                      <div style={{
                        maxWidth: '68%', padding: '8px 11px',
                        borderRadius: isOut ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                        background: isOut ? 'var(--green-800)' : 'white',
                        color: isOut ? 'white' : 'var(--gray-800)',
                        fontSize: '11px', lineHeight: '1.5',
                        border: isOut ? 'none' : '0.5px solid var(--border)',
                      }}>
                        {item.content}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--gray-300)', flexShrink: 0, paddingBottom: '2px' }}>
                        {new Date(item.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Stay summary */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'white' }}>
          <div style={{ padding: '7px 12px', fontSize: '10px', fontWeight: '500', color: 'var(--gray-500)', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
            Stay summary
          </div>
          <div className="scrollable" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {[
                { label: 'Messages', value: allMessages.length },
                { label: 'Bookings', value: bookings.length },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', padding: '9px 11px' }}>
                  <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>{s.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: '500', color: 'var(--gray-900)', lineHeight: '1.2' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Booking list */}
            {bookings.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '6px', fontWeight: '500' }}>All bookings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {bookings.map(b => {
                    const TYPE_COLORS = {
                      taxi: { bg: '#F0FDF4', color: '#16A34A', label: 'T' },
                      restaurant: { bg: '#EFF6FF', color: '#2563EB', label: 'R' },
                      activity: { bg: '#FEF3C7', color: '#D97706', label: 'B' },
                      late_checkout: { bg: '#FDF2F8', color: '#9333EA', label: 'L' },
                    }
                    const tc = TYPE_COLORS[b.type] || { bg: '#F1F5F9', color: '#64748B', label: '?' }
                    const isDone = ['confirmed','resolved','completed'].includes(b.status)
                    return (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 9px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '3px', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '700', color: tc.color, flexShrink: 0 }}>
                          {tc.label}
                        </div>
                        <div style={{ flex: 1, fontSize: '10px', color: 'var(--gray-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.partners?.name || b.type} · {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ fontSize: '9px', fontWeight: '500', color: isDone ? 'var(--gray-400)' : 'var(--gold)', flexShrink: 0 }}>
                          {isDone ? 'Done' : 'upcoming'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Staff notes */}
            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '6px', fontWeight: '500' }}>Staff notes</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this guest — preferences, allergies, special requests..."
                style={{
                  width: '100%', height: '80px', padding: '8px 10px',
                  background: 'var(--gray-50)', border: '0.5px solid var(--border)',
                  borderRadius: 'var(--radius-md)', fontSize: '11px',
                  color: 'var(--gray-700)', resize: 'none',
                  fontFamily: 'var(--font)', outline: 'none',
                }}
              />
              <button onClick={handleSaveNotes} disabled={saving}
                style={{
                  width: '100%', padding: '7px', marginTop: '6px',
                  background: saved ? 'var(--success)' : 'var(--gray-100)',
                  border: '0.5px solid var(--border-md)',
                  borderRadius: 'var(--radius-sm)', fontSize: '11px',
                  fontWeight: '500', color: saved ? 'white' : 'var(--gray-600)',
                  cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.2s',
                }}>
                {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save notes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
