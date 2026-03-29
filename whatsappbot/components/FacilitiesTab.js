'use client'
// components/FacilitiesTab.js
// ─────────────────────────────────────────────────────────────
// 7th dashboard tab — Facilities management + booking queue
//
// Roles:
//   Manager    — full edit (add/edit/delete facilities) + confirm bookings
//   Receptionist/Supervisor/Concierge — read-only facilities + confirm bookings
//   Communications — read-only, no confirm
//   Employee   — no access
//
// Sections:
//   1. Booking queue — pending/confirmed/alternative requests with ✅/❌/🕐
//   2. Facility list — cards per facility (manager can edit)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

const DEPT_COLORS = {
  sports:    { bg: '#DCFCE7', color: '#14532D', label: 'Sports' },
  wellness:  { bg: '#FAF5FF', color: '#581C87', label: 'Wellness' },
  business:  { bg: '#DBEAFE', color: '#1E3A5F', label: 'Business' },
  leisure:   { bg: '#FEF3C7', color: '#78350F', label: 'Leisure' },
  other:     { bg: '#F1F5F9', color: '#334155', label: 'Other' },
}
const CAT_EMOJI = {
  court: '🎾', pool: '🏊', spa: '💆', gym: '🏋️', conference: '💼',
  restaurant: '🍽️', rooftop: '🌅', beach: '🏖️', other: '🏨',
}
const STATUS_CONFIG = {
  pending:     { bg: '#FEF3C7', color: '#78350F', label: 'Pending' },
  confirmed:   { bg: '#DCFCE7', color: '#14532D', label: 'Confirmed' },
  rejected:    { bg: '#FEF2F2', color: '#DC2626', label: 'Rejected' },
  alternative: { bg: '#DBEAFE', color: '#1E3A5F', label: 'Alternative offered' },
}

const canEdit    = (role) => ['manager'].includes(role)
const canConfirm = (role) => ['manager','receptionist','supervisor','concierge'].includes(role)
const canView    = (role) => ['manager','receptionist','supervisor','concierge','communications'].includes(role)

// ── BOOKING CARD ──────────────────────────────────────────────
function BookingCard({ booking, session, onAction, isMobile }) {
  const [expanded,    setExpanded]    = useState(false)
  const [altTime,     setAltTime]     = useState('')
  const [altDate,     setAltDate]     = useState('')
  const [altNote,     setAltNote]     = useState('')
  const [showAlt,     setShowAlt]     = useState(false)
  const [loading,     setLoading]     = useState(false)

  const guest   = booking.guests   || {}
  const fac     = booking.facilities || {}
  const sc      = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
  const emoji   = CAT_EMOJI[fac.category] || '🏨'
  const isPending = booking.status === 'pending'

  async function act(action) {
    if (action === 'alternative' && !altTime) return
    setLoading(true)
    try {
      await fetch('/api/facility-bookings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          bookingId:       booking.id,
          action,
          alternativeTime: altTime,
          alternativeDate: altDate,
          alternativeNote: altNote,
        }),
      })
      onAction()
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      background:   'white',
      border:       `0.5px solid ${isPending ? '#FCD34D' : '#E5E7EB'}`,
      borderLeft:   `3px solid ${isPending ? '#D97706' : booking.status === 'confirmed' ? '#16A34A' : booking.status === 'rejected' ? '#DC2626' : '#2563EB'}`,
      borderRadius: '8px',
      marginBottom: '8px',
      opacity:      loading ? 0.6 : 1,
    }}>
      {/* Header */}
      <div onClick={() => setExpanded(e => !e)}
        style={{ padding: isMobile ? '12px 14px' : '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '20px', flexShrink: 0 }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
              {booking.facility_name}
            </span>
            <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px', background: sc.bg, color: sc.color, flexShrink: 0 }}>
              {sc.label.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            {guest.name ? `${guest.name}${guest.room ? ` · Room ${guest.room}` : ''}` : 'No guest'}
            {booking.date ? ` · ${booking.date}` : ''}
            {booking.time ? ` at ${booking.time}` : ''}
            {booking.guests_count > 1 ? ` · ${booking.guests_count} people` : ''}
          </div>
          {booking.status === 'alternative' && booking.alternative_time && (
            <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '2px' }}>
              Alternative offered: {booking.alternative_time}{booking.alternative_date ? ` on ${booking.alternative_date}` : ''}
            </div>
          )}
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path d={expanded ? 'M1 7L5 3L9 7' : 'M1 3L5 7L9 3'} stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ padding: isMobile ? '0 14px 14px' : '0 14px 12px', borderTop: '0.5px solid #F3F4F6' }}>
          <div style={{ fontSize: '11px', color: '#374151', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {booking.notes && <div>📝 {booking.notes}</div>}
            {fac.contact_name && <div>👤 Contact: {fac.contact_name}</div>}
            {booking.ack_by && <div style={{ color: '#9CA3AF' }}>Handled by: {booking.ack_by}</div>}
          </div>

          {/* Action buttons — only if pending and can confirm */}
          {isPending && canConfirm(session?.role) && (
            <div style={{ marginTop: '6px' }}>
              {!showAlt && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => act('confirmed')} disabled={loading}
                    style={{ padding: isMobile ? '9px 16px' : '6px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '7px', border: '0.5px solid #86EFAC', background: '#DCFCE7', color: '#14532D', cursor: 'pointer', fontFamily: 'inherit', flex: isMobile ? 1 : 'none' }}>
                    ✅ Confirm
                  </button>
                  <button onClick={() => act('rejected')} disabled={loading}
                    style={{ padding: isMobile ? '9px 16px' : '6px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '7px', border: '0.5px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', flex: isMobile ? 1 : 'none' }}>
                    ❌ Reject
                  </button>
                  <button onClick={() => setShowAlt(true)} disabled={loading}
                    style={{ padding: isMobile ? '9px 16px' : '6px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '7px', border: '0.5px solid #93C5FD', background: '#DBEAFE', color: '#1E3A5F', cursor: 'pointer', fontFamily: 'inherit', flex: isMobile ? 1 : 'none' }}>
                    🕐 Alternative
                  </button>
                </div>
              )}

              {/* Alternative time form */}
              {showAlt && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>Suggest alternative time</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input type="time" value={altTime} onChange={e => setAltTime(e.target.value)}
                      placeholder="Time e.g. 11:00"
                      style={{ padding: '8px 10px', border: '0.5px solid #E5E7EB', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
                    <input type="date" value={altDate} onChange={e => setAltDate(e.target.value)}
                      style={{ padding: '8px 10px', border: '0.5px solid #E5E7EB', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <input value={altNote} onChange={e => setAltNote(e.target.value)}
                    placeholder="Optional note for guest..."
                    style={{ padding: '8px 10px', border: '0.5px solid #E5E7EB', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => act('alternative')} disabled={loading || !altTime}
                      style={{ flex: 1, padding: '9px', fontSize: '12px', fontWeight: '600', borderRadius: '7px', border: '0.5px solid #93C5FD', background: '#DBEAFE', color: '#1E3A5F', cursor: altTime ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                      Send alternative
                    </button>
                    <button onClick={() => setShowAlt(false)}
                      style={{ padding: '9px 14px', fontSize: '12px', borderRadius: '7px', border: '0.5px solid #E5E7EB', background: 'white', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── FACILITY CARD ─────────────────────────────────────────────
function FacilityCard({ facility, session, onEdit, isMobile }) {
  const dc    = DEPT_COLORS[facility.department] || DEPT_COLORS.other
  const emoji = CAT_EMOJI[facility.category] || '🏨'

  return (
    <div style={{
      background: 'white', border: '0.5px solid #E5E7EB', borderRadius: '10px',
      padding: isMobile ? '14px' : '12px 14px', marginBottom: '8px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ fontSize: '24px', flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{facility.name}</span>
          <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px', background: dc.bg, color: dc.color }}>{dc.label}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#6B7280', lineHeight: '1.5' }}>
          {facility.description && <div>{facility.description}</div>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
            {facility.max_capacity && <span>👥 Up to {facility.max_capacity}</span>}
            {facility.price_per_hour ? <span>💰 €{facility.price_per_hour}/hr</span> : <span>Free</span>}
            {facility.contact_name && <span>👤 {facility.contact_name}</span>}
          </div>
        </div>
      </div>
      {canEdit(session?.role) && (
        <button onClick={() => onEdit(facility)}
          style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '600', borderRadius: '7px', border: '0.5px solid #E5E7EB', background: 'white', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Edit
        </button>
      )}
    </div>
  )
}

// ── FACILITY FORM (add/edit) ──────────────────────────────────
function FacilityForm({ facility, hotelId, onSave, onCancel }) {
  const [form, setForm] = useState(facility || {
    name: '', description: '', department: 'sports', category: 'court',
    max_capacity: '', price_per_hour: '', contact_name: '', contact_phone: '',
    min_duration: 60, booking_notes: '',
  })
  const [saving, setSaving] = useState(false)

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    try {
      const method = form.id ? 'PATCH' : 'POST'
      await fetch('/api/facilities', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hotel_id: hotelId }),
      })
      onSave()
    } finally { setSaving(false) }
  }

  const inp = { padding: '9px 12px', border: '0.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl = { fontSize: '11px', fontWeight: '600', color: '#374151', marginBottom: '4px', display: 'block' }

  return (
    <div style={{ background: 'white', border: '0.5px solid #E5E7EB', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '14px' }}>
        {form.id ? 'Edit facility' : 'Add new facility'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={lbl}>Name *</label>
          <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="e.g. Tennis Court A" style={inp} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={lbl}>Department</label>
            <select value={form.department} onChange={e => upd('department', e.target.value)} style={inp}>
              {Object.entries(DEPT_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Category</label>
            <select value={form.category} onChange={e => upd('category', e.target.value)} style={inp}>
              {Object.entries(CAT_EMOJI).map(([k, v]) => <option key={k} value={k}>{v} {k.charAt(0).toUpperCase()+k.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Description</label>
          <input value={form.description || ''} onChange={e => upd('description', e.target.value)} placeholder="Brief description for guests" style={inp} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={lbl}>Max capacity</label>
            <input type="number" value={form.max_capacity || ''} onChange={e => upd('max_capacity', e.target.value)} placeholder="e.g. 4" style={inp} />
          </div>
          <div>
            <label style={lbl}>Price per hour (€)</label>
            <input type="number" value={form.price_per_hour || ''} onChange={e => upd('price_per_hour', e.target.value)} placeholder="Leave blank if free" style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={lbl}>Contact name</label>
            <input value={form.contact_name || ''} onChange={e => upd('contact_name', e.target.value)} placeholder="e.g. Nikos (Sports)" style={inp} />
          </div>
          <div>
            <label style={lbl}>Contact WhatsApp</label>
            <input value={form.contact_phone || ''} onChange={e => upd('contact_phone', e.target.value)} placeholder="+35799..." style={inp} />
          </div>
        </div>
        <div>
          <label style={lbl}>Booking notes (shown to guest on confirmation)</label>
          <input value={form.booking_notes || ''} onChange={e => upd('booking_notes', e.target.value)} placeholder="e.g. Bring your own racket. Court shoes required." style={inp} />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button onClick={save} disabled={saving || !form.name}
            style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: 'none', background: form.name ? '#1C3D2E' : '#E5E7EB', color: form.name ? 'white' : '#9CA3AF', cursor: form.name ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add facility'}
          </button>
          <button onClick={onCancel}
            style={{ padding: '10px 16px', fontSize: '13px', borderRadius: '8px', border: '0.5px solid #E5E7EB', background: 'white', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function FacilitiesTab({ hotelId, session, isMobile = false }) {
  const [bookings,   setBookings]   = useState([])
  const [facilities, setFacilities] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [section,    setSection]    = useState('bookings')  // 'bookings' | 'facilities'
  const [editingFac, setEditingFac] = useState(null)        // null | {} (new) | {id,...} (edit)
  const [statusFilter, setStatusFilter] = useState('pending')

  if (!canView(session?.role)) return null

  useEffect(() => {
    if (!hotelId) return
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [hotelId])

  async function load() {
    try {
      const [bRes, fRes] = await Promise.all([
        fetch(`/api/facility-bookings?hotelId=${hotelId}&status=${statusFilter}`),
        fetch(`/api/facilities?hotelId=${hotelId}`),
      ])
      const [bData, fData] = await Promise.all([bRes.json(), fRes.json()])
      setBookings(bData.bookings || [])
      setFacilities(fData.facilities || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { if (hotelId) load() }, [statusFilter])

  const pendingCount = bookings.filter(b => b.status === 'pending').length

  // ── Section toggle ────────────────────────────────────────
  const SectionToggle = () => (
    <div style={{ display: 'flex', gap: '4px', padding: isMobile ? '10px 16px' : '10px 14px', background: 'white', borderBottom: '0.5px solid #E5E7EB', flexShrink: 0 }}>
      {[
        { key: 'bookings',   label: 'Booking requests', badge: pendingCount },
        { key: 'facilities', label: 'Facilities' },
      ].map(s => (
        <button key={s.key} onClick={() => setSection(s.key)}
          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: section === s.key ? '600' : '400', borderRadius: '7px', border: '0.5px solid', borderColor: section === s.key ? '#1C3D2E' : '#E5E7EB', background: section === s.key ? '#1C3D2E' : 'white', color: section === s.key ? 'white' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
          {s.label}
          {s.badge > 0 && (
            <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '8px', background: '#FEF3C7', color: '#D97706' }}>{s.badge}</span>
          )}
        </button>
      ))}
    </div>
  )

  // ── Status filter for bookings ────────────────────────────
  const StatusFilter = () => (
    <div style={{ display: 'flex', gap: '4px', padding: '8px 14px', background: '#F9FAFB', borderBottom: '0.5px solid #E5E7EB', flexShrink: 0, overflowX: 'auto' }}>
      {['pending', 'confirmed', 'alternative', 'rejected'].map(s => {
        const sc = STATUS_CONFIG[s]
        return (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: '4px 10px', fontSize: '11px', fontWeight: statusFilter === s ? '600' : '400', borderRadius: '6px', border: '0.5px solid', borderColor: statusFilter === s ? sc.color : '#E5E7EB', background: statusFilter === s ? sc.bg : 'white', color: statusFilter === s ? sc.color : '#6B7280', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            {sc.label}
          </button>
        )
      })}
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9CA3AF', fontSize: '13px' }}>
      Loading facilities…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      <SectionToggle />

      {/* Bookings section */}
      {section === 'bookings' && (
        <>
          <StatusFilter />
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 16px' : '12px 14px', background: '#F9FAFB' }}>
            {bookings.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
                {statusFilter === 'pending' ? 'No pending facility requests ✓' : `No ${statusFilter} bookings`}
              </div>
            ) : bookings.map(b => (
              <BookingCard key={b.id} booking={b} session={session} onAction={load} isMobile={isMobile} />
            ))}
          </div>
        </>
      )}

      {/* Facilities list section */}
      {section === 'facilities' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 16px' : '12px 14px', background: '#F9FAFB' }}>

          {/* Add button — manager only */}
          {canEdit(session?.role) && !editingFac && (
            <button onClick={() => setEditingFac({})}
              style={{ width: '100%', padding: '10px', marginBottom: '12px', fontSize: '13px', fontWeight: '600', borderRadius: '9px', border: '0.5px dashed #C9A84C', background: 'rgba(201,168,76,0.06)', color: '#78350F', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add facility
            </button>
          )}

          {/* Add/Edit form */}
          {editingFac && (
            <FacilityForm
              facility={editingFac.id ? editingFac : null}
              hotelId={hotelId}
              onSave={() => { setEditingFac(null); load() }}
              onCancel={() => setEditingFac(null)}
            />
          )}

          {/* Group by department */}
          {Object.entries(
            facilities.reduce((acc, f) => {
              const dept = f.department || 'other'
              if (!acc[dept]) acc[dept] = []
              acc[dept].push(f)
              return acc
            }, {})
          ).map(([dept, facs]) => {
            const dc = DEPT_COLORS[dept] || DEPT_COLORS.other
            return (
              <div key={dept} style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: dc.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ padding: '1px 7px', borderRadius: '8px', background: dc.bg, color: dc.color }}>{dc.label}</span>
                  <div style={{ flex: 1, height: '0.5px', background: dc.bg }} />
                </div>
                {facs.map(f => (
                  <FacilityCard key={f.id} facility={f} session={session} onEdit={setEditingFac} isMobile={isMobile} />
                ))}
              </div>
            )
          })}

          {facilities.length === 0 && !editingFac && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              No facilities configured yet.{canEdit(session?.role) ? ' Click "+ Add facility" to get started.' : ' Ask your manager to add facilities.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
