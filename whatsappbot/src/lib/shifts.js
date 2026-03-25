// src/lib/shifts.js
// Determines which staff are currently on shift for a given hotel/department
// Used by push.js to route notifications only to on-shift workers

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

// ── GET ON-SHIFT STAFF ───────────────────────────────────────
// Returns staff members currently on shift for a dept
// Falls back to ALL dept staff if nobody is on shift (queue-until-shift mode)
export async function getOnShiftStaff(hotelId, department) {
  const supabase = getSupabase()
  const now      = new Date()

  // Current time as HH:MM string (for Postgres time comparison)
  const timeStr  = now.toTimeString().slice(0, 5)   // e.g. "14:35"
  const dayOfWeek = now.getDay()                     // 0=Sun … 6=Sat
  const todayStr  = now.toISOString().split('T')[0]  // e.g. "2026-03-26"

  // 1. Get all active staff in this dept
  const { data: allStaff } = await supabase
    .from('staff')
    .select('id, name, display_name, role, department, email')
    .eq('hotel_id', hotelId)
    .eq('department', department)
    .eq('active', true)

  if (!allStaff || allStaff.length === 0) return { onShift: [], fallback: false }

  const staffIds = allStaff.map(s => s.id)

  // 2. Get today's overrides for all these staff
  const { data: overrides } = await supabase
    .from('staff_shift_overrides')
    .select('*')
    .in('staff_id', staffIds)
    .eq('override_date', todayStr)

  const overrideMap = {}
  ;(overrides || []).forEach(o => { overrideMap[o.staff_id] = o })

  // 3. Get weekly shift patterns for today's day_of_week
  const { data: shifts } = await supabase
    .from('staff_shifts')
    .select('*')
    .in('staff_id', staffIds)
    .eq('day_of_week', dayOfWeek)
    .eq('active', true)

  const shiftMap = {}
  ;(shifts || []).forEach(s => { shiftMap[s.staff_id] = s })

  // 4. Determine who is currently on shift
  const onShift = allStaff.filter(staff => {
    const override = overrideMap[staff.id]
    const shift    = shiftMap[staff.id]

    // Override takes priority
    if (override) {
      if (override.override_type === 'off') return false
      if (override.override_type === 'custom' && override.start_time && override.end_time) {
        return timeStr >= override.start_time && timeStr <= override.end_time
      }
    }

    // No shift defined for today → not on shift
    if (!shift) return false

    // Check time window
    return timeStr >= shift.start_time && timeStr <= shift.end_time
  })

  return { onShift, fallback: false }
}

// ── IS STAFF MEMBER ON SHIFT NOW ─────────────────────────────
export async function isOnShift(staffId) {
  const supabase  = getSupabase()
  const now       = new Date()
  const timeStr   = now.toTimeString().slice(0, 5)
  const dayOfWeek = now.getDay()
  const todayStr  = now.toISOString().split('T')[0]

  // Check override first
  const { data: override } = await supabase
    .from('staff_shift_overrides')
    .select('*')
    .eq('staff_id', staffId)
    .eq('override_date', todayStr)
    .single()

  if (override) {
    if (override.override_type === 'off') return false
    if (override.override_type === 'custom' && override.start_time && override.end_time) {
      return timeStr >= override.start_time && timeStr <= override.end_time
    }
  }

  // Check weekly pattern
  const { data: shift } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', staffId)
    .eq('day_of_week', dayOfWeek)
    .eq('active', true)
    .single()

  if (!shift) return false
  return timeStr >= shift.start_time && timeStr <= shift.end_time
}

// ── GET SHIFT SCHEDULE FOR DISPLAY ───────────────────────────
// Returns a week's schedule for a staff member (for the UI)
export async function getStaffWeekSchedule(staffId) {
  const supabase = getSupabase()

  const [{ data: shifts }, { data: overrides }] = await Promise.all([
    supabase.from('staff_shifts').select('*').eq('staff_id', staffId).eq('active', true),
    supabase.from('staff_shift_overrides').select('*').eq('staff_id', staffId).gte('override_date', new Date().toISOString().split('T')[0]).order('override_date'),
  ])

  return { shifts: shifts || [], overrides: overrides || [] }
}

// ── GET ALL DEPT STAFF WITH SHIFTS ───────────────────────────
// For the ShiftsManager UI
export async function getDeptStaffWithShifts(hotelId, department) {
  const supabase  = getSupabase()
  const todayStr  = new Date().toISOString().split('T')[0]
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: staff } = await supabase
    .from('staff')
    .select('id, name, display_name, email, role, department, active')
    .eq('hotel_id', hotelId)
    .eq('department', department)
    .eq('active', true)
    .order('name')

  if (!staff || staff.length === 0) return []

  const staffIds = staff.map(s => s.id)

  const [{ data: shifts }, { data: overrides }] = await Promise.all([
    supabase.from('staff_shifts').select('*').in('staff_id', staffIds).eq('active', true),
    supabase.from('staff_shift_overrides').select('*').in('staff_id', staffIds).gte('override_date', todayStr).lte('override_date', weekAhead),
  ])

  // Attach shifts and overrides to each staff member
  return staff.map(s => ({
    ...s,
    shifts:    (shifts    || []).filter(sh => sh.staff_id === s.id),
    overrides: (overrides || []).filter(ov => ov.staff_id === s.id),
  }))
}

// ── UPSERT SHIFT PATTERN ─────────────────────────────────────
export async function saveShiftPattern(staffId, dayOfWeek, startTime, endTime) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('staff_shifts')
    .upsert({ staff_id: staffId, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, active: true }, { onConflict: 'staff_id,day_of_week' })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

// ── REMOVE SHIFT PATTERN (day off permanently) ───────────────
export async function removeShiftPattern(staffId, dayOfWeek) {
  const supabase = getSupabase()
  await supabase.from('staff_shifts').update({ active: false }).eq('staff_id', staffId).eq('day_of_week', dayOfWeek)
}

// ── SAVE OVERRIDE ────────────────────────────────────────────
export async function saveOverride(staffId, date, type, startTime, endTime, note) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('staff_shift_overrides')
    .upsert({
      staff_id:      staffId,
      override_date: date,
      override_type: type,
      start_time:    startTime || null,
      end_time:      endTime   || null,
      note:          note      || null,
    }, { onConflict: 'staff_id,override_date' })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

// ── DELETE OVERRIDE ──────────────────────────────────────────
export async function deleteOverride(overrideId) {
  const supabase = getSupabase()
  await supabase.from('staff_shift_overrides').delete().eq('id', overrideId)
}
