// components/ShiftsManager.js
// Manager UI for setting up staff workers, weekly shift patterns, and day overrides
// Embedded inside SettingsTab under a new "Shifts" section

'use client'
import { useState, useEffect } from 'react'

const DEPT_ROLES = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk']
const DEPT_LABELS = {
  maintenance: 'Maintenance', housekeeping: 'Housekeeping', concierge: 'Concierge',
  fnb: 'F&B', security: 'Security', valet: 'Valet', frontdesk: 'Front Desk',
}
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// Common shift presets
const SHIFT_PRESETS = [
  { label: 'Morning',   start: '07:00', end: '15:00' },
  { label: 'Afternoon', start: '15:00', end: '23:00' },
  { label: 'Night',     start: '23:00', end: '07:00' },
  { label: 'Full day',  start: '08:00', end: '20:00' },
  { label: 'Custom',    start: '',      end: ''       },
]

function timeToLabel(t) {
  if (!t) return '—'
  const [h, m] = t.split(':')
  const hour   = parseInt(h)
  const ampm   = hour >= 12 ? 'pm' : 'am'
  const h12    = hour % 12 || 12
  return `${h12}:${m}${ampm}`
}

function isOnShiftNow(staff) {
  const now     = new Date()
  const timeStr = now.toTimeString().slice(0, 5)
  const today   = now.getDay()
  const todayIso= now.toISOString().split('T')[0]

  // Check override
  const override = (staff.overrides || []).find(o => o.override_date === todayIso)
  if (override) {
    if (override.override_type === 'off') return false
    if (override.override_type === 'custom') return timeStr >= override.start_time && timeStr <= override.end_time
  }

  // Check pattern
  const shift = (staff.shifts || []).find(s => s.day_of_week === today)
  if (!shift) return false
  return timeStr >= shift.start_time && timeStr <= shift.end_time
}

// ── SHIFT CELL ─────────────────────────────────────────────
function ShiftCell({ staffId, dayIndex, shift, onSave, onRemove }) {
  const [editing,   setEditing]   = useState(false)
  const [preset,    setPreset]    = useState(0)
  const [startTime, setStartTime] = useState(shift?.start_time || '07:00')
  const [endTime,   setEndTime]   = useState(shift?.end_time   || '15:00')
  const [saving,    setSaving]    = useState(false)

  function openEdit() {
    if (shift) {
      const pi = SHIFT_PRESETS.findIndex(p => p.start === shift.start_time && p.end === shift.end_time)
      setPreset(pi >= 0 ? pi : SHIFT_PRESETS.length - 1)
      setStartTime(shift.start_time)
      setEndTime(shift.end_time)
    } else {
      setPreset(0); setStartTime('07:00'); setEndTime('15:00')
    }
    setEditing(true)
  }

  function applyPreset(idx) {
    setPreset(idx)
    if (SHIFT_PRESETS[idx].start) { setStartTime(SHIFT_PRESETS[idx].start); setEndTime(SHIFT_PRESETS[idx].end) }
  }

  async function save() {
    setSaving(true)
    try { await onSave(staffId, dayIndex, startTime, endTime); setEditing(false) }
    finally { setSaving(false) }
  }

  async function remove() {
    setSaving(true)
    try { await onRemove(staffId, dayIndex); setEditing(false) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div onClick={openEdit}
        style={{ padding:'6px 8px', borderRadius:'8px', cursor:'pointer', minHeight:'36px', textAlign:'center', background: shift ? 'rgba(28,61,46,0.08)' : 'rgba(0,0,0,0.03)', border: `1px dashed ${shift ? '#2A5A42' : '#E5E7EB'}`, transition:'all .15s' }}
        onMouseEnter={e => e.currentTarget.style.background = shift ? 'rgba(28,61,46,0.14)' : 'rgba(0,0,0,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = shift ? 'rgba(28,61,46,0.08)' : 'rgba(0,0,0,0.03)'}
      >
        {shift ? (
          <>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#1C3D2E' }}>{timeToLabel(shift.start_time)}</div>
            <div style={{ fontSize:'10px', color:'#6B7280' }}>→ {timeToLabel(shift.end_time)}</div>
          </>
        ) : (
          <div style={{ fontSize:'11px', color:'#D1D5DB', lineHeight:'22px' }}>+ Add</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding:'8px', borderRadius:'8px', background:'white', border:'1px solid #1C3D2E', boxShadow:'0 2px 8px rgba(0,0,0,0.12)', position:'relative', zIndex:10, minWidth:'140px' }}>
      {/* Preset buttons */}
      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'8px' }}>
        {SHIFT_PRESETS.map((p, i) => (
          <button key={i} onClick={() => applyPreset(i)}
            style={{ padding:'3px 7px', borderRadius:'5px', fontSize:'10px', fontWeight:'600', border:'1px solid', borderColor: preset===i?'#1C3D2E':'#E5E7EB', background: preset===i?'#1C3D2E':'white', color: preset===i?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {p.label}
          </button>
        ))}
      </div>
      {/* Time inputs */}
      <div style={{ display:'flex', gap:'4px', alignItems:'center', marginBottom:'8px' }}>
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ flex:1, padding:'4px 6px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif" }} />
        <span style={{ fontSize:'11px', color:'#9CA3AF' }}>→</span>
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
          style={{ flex:1, padding:'4px 6px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif" }} />
      </div>
      {/* Actions */}
      <div style={{ display:'flex', gap:'4px' }}>
        <button onClick={save} disabled={saving}
          style={{ flex:1, padding:'5px', background:'#1C3D2E', border:'none', borderRadius:'6px', fontSize:'11px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          {saving ? '…' : 'Save'}
        </button>
        {shift && (
          <button onClick={remove} disabled={saving}
            style={{ padding:'5px 8px', background:'white', border:'1px solid #FCA5A5', borderRadius:'6px', fontSize:'11px', color:'#DC2626', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Off
          </button>
        )}
        <button onClick={() => setEditing(false)}
          style={{ padding:'5px 8px', background:'white', border:'1px solid #E5E7EB', borderRadius:'6px', fontSize:'11px', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ── OVERRIDE ROW ──────────────────────────────────────────
function OverrideRow({ staffId, overrides, onSave, onDelete }) {
  const [adding,    setAdding]    = useState(false)
  const [date,      setDate]      = useState('')
  const [type,      setType]      = useState('off')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime,   setEndTime]   = useState('15:00')
  const [note,      setNote]      = useState('')
  const [saving,    setSaving]    = useState(false)

  const today = new Date().toISOString().split('T')[0]

  async function save() {
    if (!date) return
    setSaving(true)
    try { await onSave(staffId, date, type, type==='custom'?startTime:null, type==='custom'?endTime:null, note); setAdding(false); setDate(''); setNote('') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop:'8px' }}>
      {/* Existing overrides */}
      {(overrides || []).map(ov => (
        <div key={ov.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 8px', background: ov.override_type==='off'?'#FEF2F2':'#EFF6FF', borderRadius:'7px', marginBottom:'4px', fontSize:'11px' }}>
          <span style={{ fontWeight:'600', color: ov.override_type==='off'?'#DC2626':'#2563EB' }}>
            {ov.override_type === 'off' ? '🚫 Off' : `⏰ ${timeToLabel(ov.start_time)}–${timeToLabel(ov.end_time)}`}
          </span>
          <span style={{ color:'#6B7280' }}>{ov.override_date}</span>
          {ov.note && <span style={{ color:'#9CA3AF', fontStyle:'italic' }}>{ov.note}</span>}
          <button onClick={() => onDelete(ov.id)}
            style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:'13px', lineHeight:1, padding:0 }}>✕</button>
        </div>
      ))}

      {/* Add override */}
      {adding ? (
        <div style={{ padding:'10px', background:'white', borderRadius:'8px', border:'1px solid #E5E7EB', display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)}
              style={{ padding:'5px 8px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif" }} />
            <select value={type} onChange={e => setType(e.target.value)}
              style={{ padding:'5px 8px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif" }}>
              <option value="off">Day off</option>
              <option value="custom">Custom hours</option>
            </select>
            {type === 'custom' && (
              <>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  style={{ padding:'5px 8px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif" }} />
                <span style={{ fontSize:'11px', color:'#9CA3AF' }}>→</span>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  style={{ padding:'5px 8px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif" }} />
              </>
            )}
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional, e.g. covering for Maria)"
            style={{ padding:'5px 8px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
          <div style={{ display:'flex', gap:'6px' }}>
            <button onClick={save} disabled={saving || !date}
              style={{ padding:'6px 14px', background:'#1C3D2E', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'white', cursor: date?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
              {saving ? 'Saving…' : 'Save override'}
            </button>
            <button onClick={() => setAdding(false)}
              style={{ padding:'6px 10px', background:'white', border:'1px solid #E5E7EB', borderRadius:'7px', fontSize:'12px', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ fontSize:'11px', fontWeight:'600', color:'#2563EB', background:'none', border:'none', cursor:'pointer', padding:'2px 0', fontFamily:"'DM Sans',sans-serif" }}>
          + Add day override
        </button>
      )}
    </div>
  )
}

// ── ADD STAFF FORM ─────────────────────────────────────────
function AddStaffForm({ hotelId, department, onSave, onCancel }) {
  const [name,     setName]     = useState('')
  const [dispName, setDispName] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function save() {
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      const res  = await fetch('/api/shifts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'create_staff', hotelId, name:name.trim(), displayName:dispName.trim()||name.trim(), email:email.trim()||undefined, department, password:password||undefined }) })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSave()
    } finally { setSaving(false) }
  }

  const inp = (v, onChange, ph, type='text') => (
    <input type={type} value={v} onChange={e=>onChange(e.target.value)} placeholder={ph}
      style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
  )

  return (
    <div style={{ padding:'16px', background:'white', borderRadius:'12px', border:'1px solid #E5E7EB', display:'flex', flexDirection:'column', gap:'10px' }}>
      <div style={{ fontSize:'13px', fontWeight:'700', color:'#111827' }}>Add staff member</div>
      {inp(name, setName, 'Full name *')}
      {inp(dispName, setDispName, 'Display name (e.g. Anastasia) — shown on tickets')}
      {inp(email, setEmail, 'Email for login')}
      {inp(password, setPassword, 'Password', 'password')}
      {error && <div style={{ fontSize:'12px', color:'#DC2626' }}>{error}</div>}
      <div style={{ display:'flex', gap:'8px' }}>
        <button onClick={save} disabled={saving || !name.trim()}
          style={{ flex:1, padding:'9px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'white', cursor: name.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
          {saving ? 'Adding…' : 'Add staff member'}
        </button>
        <button onClick={onCancel}
          style={{ padding:'9px 14px', background:'white', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function ShiftsManager({ hotelId }) {
  const [activeDept, setActiveDept] = useState(DEPT_ROLES[0])
  const [staff,      setStaff]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [addingStaff,setAddingStaff]= useState(false)

  useEffect(() => { if (hotelId) load() }, [hotelId, activeDept])

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/shifts?hotelId=${hotelId}&department=${activeDept}`)
      const data = await res.json()
      setStaff(data.staff || [])
    } finally { setLoading(false) }
  }

  async function saveShift(staffId, dayOfWeek, startTime, endTime) {
    await fetch('/api/shifts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'save_shift', staffId, dayOfWeek, startTime, endTime }) })
    load()
  }

  async function removeShift(staffId, dayOfWeek) {
    await fetch('/api/shifts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'remove_shift', staffId, dayOfWeek }) })
    load()
  }

  async function saveOverride(staffId, date, type, startTime, endTime, note) {
    await fetch('/api/shifts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'save_override', staffId, date, type, startTime, endTime, note }) })
    load()
  }

  async function deleteOverride(overrideId) {
    await fetch('/api/shifts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete_override', overrideId }) })
    load()
  }

  async function deactivateStaff(staffId) {
    if (!confirm('Remove this staff member?')) return
    await fetch(`/api/shifts?staffId=${staffId}`, { method:'DELETE' })
    load()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>Shift management</div>
      <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'16px' }}>
        Set weekly shift patterns per worker. Push notifications are sent only to staff currently on shift.
      </div>

      {/* Dept tabs */}
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'20px' }}>
        {DEPT_ROLES.map(d => (
          <button key={d} onClick={() => { setActiveDept(d); setAddingStaff(false) }}
            style={{ padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:'600', border:'1px solid', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", borderColor: activeDept===d?'#1C3D2E':'#E5E7EB', background: activeDept===d?'#1C3D2E':'white', color: activeDept===d?'white':'#374151' }}>
            {DEPT_LABELS[d]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>Loading…</div>
      ) : (
        <>
          {/* Staff cards */}
          {staff.map(s => {
            const onShift = isOnShiftNow(s)
            return (
              <div key={s.id} style={{ background:'white', borderRadius:'12px', border:'1px solid #E5E7EB', marginBottom:'16px', overflow:'hidden' }}>
                {/* Staff header */}
                <div style={{ padding:'14px 16px', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                    {(s.display_name||s.name)?.[0]?.toUpperCase()||'?'}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', display:'flex', alignItems:'center', gap:'8px' }}>
                      {s.display_name || s.name}
                      {onShift && (
                        <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'10px', background:'#DCFCE7', color:'#14532D' }}>
                          ● On shift
                        </span>
                      )}
                    </div>
                    {s.email && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{s.email}</div>}
                  </div>
                  <button onClick={() => deactivateStaff(s.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:'16px', padding:'4px', lineHeight:1 }}>✕</button>
                </div>

                {/* Weekly grid */}
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', marginBottom:'10px' }}>Weekly schedule</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'6px', marginBottom:'14px' }}>
                    {DAYS.map((day, i) => {
                      const shift = s.shifts?.find(sh => sh.day_of_week === i)
                      return (
                        <div key={i}>
                          <div style={{ fontSize:'10px', fontWeight:'600', color:'#9CA3AF', textAlign:'center', marginBottom:'4px' }}>{day}</div>
                          <ShiftCell
                            staffId={s.id}
                            dayIndex={i}
                            shift={shift}
                            onSave={saveShift}
                            onRemove={removeShift}
                          />
                        </div>
                      )
                    })}
                  </div>

                  {/* Overrides */}
                  <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:'12px' }}>
                    <div style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', marginBottom:'8px' }}>
                      Day overrides (exceptions, cover shifts, days off)
                    </div>
                    <OverrideRow
                      staffId={s.id}
                      overrides={s.overrides}
                      onSave={saveOverride}
                      onDelete={deleteOverride}
                    />
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add staff / empty state */}
          {staff.length === 0 && !addingStaff && (
            <div style={{ padding:'32px', textAlign:'center', background:'white', borderRadius:'12px', border:'1px dashed #D1D5DB' }}>
              <div style={{ fontSize:'13px', color:'#9CA3AF', marginBottom:'12px' }}>
                No {DEPT_LABELS[activeDept]} workers yet
              </div>
              <button onClick={() => setAddingStaff(true)}
                style={{ padding:'9px 20px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Add first worker
              </button>
            </div>
          )}

          {addingStaff && (
            <AddStaffForm hotelId={hotelId} department={activeDept} onSave={() => { setAddingStaff(false); load() }} onCancel={() => setAddingStaff(false)} />
          )}

          {staff.length > 0 && !addingStaff && (
            <button onClick={() => setAddingStaff(true)}
              style={{ padding:'10px 20px', background:'white', border:'1px dashed #D1D5DB', borderRadius:'10px', fontSize:'13px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", width:'100%', marginTop:'4px' }}>
              + Add {DEPT_LABELS[activeDept]} worker
            </button>
          )}
        </>
      )}
    </div>
  )
}
