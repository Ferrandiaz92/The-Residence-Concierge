// app/api/shifts/route.js
// Manages staff workers, weekly shift patterns, and day overrides
// Manager/Admin only

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth:{ persistSession:false } })
}
function getSession() {
  try { const c = cookies().get('session'); return c ? JSON.parse(c.value) : null } catch { return null }
}
function requireManager(session) {
  return session && ['manager','admin'].includes(session.role)
}

// ── GET ───────────────────────────────────────────────────────
// ?hotelId=&department=   → staff list with shifts + overrides
// ?hotelId=&staffId=      → single staff member schedule
export async function GET(request) {
  try {
    const session = getSession()
    if (!session) return Response.json({ error:'Unauthorized' }, { status:401 })

    const { searchParams } = new URL(request.url)
    const hotelId    = searchParams.get('hotelId')
    const department = searchParams.get('department')
    const staffId    = searchParams.get('staffId')

    if (!hotelId) return Response.json({ error:'Missing hotelId' }, { status:400 })

    const supabase = getSupabase()
    const today    = new Date().toISOString().split('T')[0]
    const weekFwd  = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

    if (staffId) {
      // Single staff schedule
      const [{ data:shifts }, { data:overrides }] = await Promise.all([
        supabase.from('staff_shifts').select('*').eq('staff_id', staffId).eq('active', true).order('day_of_week'),
        supabase.from('staff_shift_overrides').select('*').eq('staff_id', staffId).gte('override_date', today).lte('override_date', weekFwd).order('override_date'),
      ])
      return Response.json({ shifts:shifts||[], overrides:overrides||[] })
    }

    // Dept staff list
    let query = supabase.from('staff').select('id,name,display_name,email,role,department,active').eq('hotel_id', hotelId).eq('active', true).order('name')
    if (department) query = query.eq('department', department)
    const { data:staff } = await query

    if (!staff || staff.length === 0) return Response.json({ staff:[] })

    const ids = staff.map(s => s.id)
    const [{ data:shifts }, { data:overrides }] = await Promise.all([
      supabase.from('staff_shifts').select('*').in('staff_id', ids).eq('active', true),
      supabase.from('staff_shift_overrides').select('*').in('staff_id', ids).gte('override_date', today).lte('override_date', weekFwd),
    ])

    const enriched = staff.map(s => ({
      ...s,
      shifts:    (shifts    ||[]).filter(sh => sh.staff_id === s.id).sort((a,b)=>a.day_of_week-b.day_of_week),
      overrides: (overrides ||[]).filter(ov => ov.staff_id === s.id),
    }))

    return Response.json({ staff:enriched })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}

// ── POST ──────────────────────────────────────────────────────
// Create staff worker, shift pattern, or override
export async function POST(request) {
  try {
    const session = getSession()
    if (!requireManager(session)) return Response.json({ error:'Forbidden' }, { status:403 })

    const body = await request.json()
    const { action } = body
    const supabase   = getSupabase()

    // ── Create staff worker ──────────────────────────────────
    if (action === 'create_staff') {
      const { hotelId, name, displayName, email, department, password } = body
      if (!hotelId || !name || !department) return Response.json({ error:'Missing fields' }, { status:400 })

      const { data, error } = await supabase
        .from('staff')
        .insert({ hotel_id:hotelId, name, display_name:displayName||name, email:email||null, role:department, department, password:password||null, active:true })
        .select().single()
      if (error) return Response.json({ error:error.message }, { status:500 })
      return Response.json({ status:'created', staff:data })
    }

    // ── Save shift pattern (upsert by staff_id + day_of_week) ─
    if (action === 'save_shift') {
      const { staffId, dayOfWeek, startTime, endTime } = body
      if (!staffId || dayOfWeek === undefined || !startTime || !endTime) return Response.json({ error:'Missing fields' }, { status:400 })

      const { data, error } = await supabase
        .from('staff_shifts')
        .upsert({ staff_id:staffId, day_of_week:dayOfWeek, start_time:startTime, end_time:endTime, active:true }, { onConflict:'staff_id,day_of_week' })
        .select().single()
      if (error) return Response.json({ error:error.message }, { status:500 })
      return Response.json({ status:'saved', shift:data })
    }

    // ── Remove shift for a day (set active=false) ─────────────
    if (action === 'remove_shift') {
      const { staffId, dayOfWeek } = body
      await supabase.from('staff_shifts').update({ active:false }).eq('staff_id', staffId).eq('day_of_week', dayOfWeek)
      return Response.json({ status:'removed' })
    }

    // ── Save override ─────────────────────────────────────────
    if (action === 'save_override') {
      const { staffId, date, type, startTime, endTime, note } = body
      if (!staffId || !date || !type) return Response.json({ error:'Missing fields' }, { status:400 })

      const { data, error } = await supabase
        .from('staff_shift_overrides')
        .upsert({ staff_id:staffId, override_date:date, override_type:type, start_time:startTime||null, end_time:endTime||null, note:note||null }, { onConflict:'staff_id,override_date' })
        .select().single()
      if (error) return Response.json({ error:error.message }, { status:500 })
      return Response.json({ status:'saved', override:data })
    }

    // ── Delete override ───────────────────────────────────────
    if (action === 'delete_override') {
      const { overrideId } = body
      await supabase.from('staff_shift_overrides').delete().eq('id', overrideId)
      return Response.json({ status:'deleted' })
    }

    return Response.json({ error:'Unknown action' }, { status:400 })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}

// ── DELETE — deactivate staff member ─────────────────────────
export async function DELETE(request) {
  try {
    const session = getSession()
    if (!requireManager(session)) return Response.json({ error:'Forbidden' }, { status:403 })

    const { searchParams } = new URL(request.url)
    const staffId = searchParams.get('staffId')
    if (!staffId) return Response.json({ error:'Missing staffId' }, { status:400 })

    const supabase = getSupabase()
    await supabase.from('staff').update({ active:false }).eq('id', staffId)
    return Response.json({ status:'deactivated' })
  } catch(err) { return Response.json({ error:err.message }, { status:500 }) }
}
