// app/api/local-guide/route.js
// GET    — list items for a hotel (with preferences merged)
// POST   — create new item + preference
// PATCH  — update preference (enable/disable, priority, notes)
// DELETE — deactivate item

import { createClient } from '@supabase/supabase-js'
import { cookies }      from 'next/headers'
import { requireSession, requireHotel } from '../../../lib/route-helpers.js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

// GET — list all local guide items for a hotel with preferences
export async function GET(request) {
  const { session, error: authErr } = requireSession(request)
  if (authErr) return authErr
  const { hotelId, error: hotelErr } = requireHotel(request, session)
  if (hotelErr) return hotelErr

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')

  const supabase = getSupabase()

  let query = supabase
    .from('local_guide_preferences')
    .select(`
      id, is_enabled, custom_priority, custom_notes, promoted_by_hotel,
      commission_percentage, commission_eligible, partner_id,
      distance_km, distance_min_walk, distance_min_drive,
      local_guide_items (
        id, category, name, area, subarea, description, vibe, tags,
        cuisine_type, price_range, google_rating, review_count,
        phone, website, reservation_url, booking_method,
        opening_hours, seasonal_notes, popular_item,
        popular_item_description, popular_item_price, popular_item_image_url,
        image_url, distance_km, notes, active, google_place_id,
        last_auto_updated, data_source
      )
    `)
    .eq('hotel_id', hotelId)

  if (category) query = query.eq('local_guide_items.category', category)

  const { data: prefs, error } = await query.order('custom_priority', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Also get global items not yet in hotel preferences
  const { data: allItems } = await supabase
    .from('local_guide_items')
    .select('id, category, name, area, description, tags, cuisine_type, price_range, google_rating, booking_method, phone, active')
    .eq('active', true)
    .order('google_rating', { ascending: false })

  const enabledIds = new Set((prefs || []).map(p => p.local_guide_items?.id).filter(Boolean))
  const unlinked   = (allItems || []).filter(i => !enabledIds.has(i.id))

  return Response.json({
    preferences: prefs || [],
    available:   unlinked,  // global items not yet added to this hotel
  })
}

// POST — add item to hotel (create preference row, optionally create item too)
export async function POST(request) {
  const { session, error: authErr } = requireSession(request)
  if (authErr) return authErr

  const body = await request.json()
  const hotelId = body.hotelId || session.hotelId

  if (session.hotelId && session.hotelId !== hotelId) {
    return Response.json({ error: 'Access denied' }, { status: 403 })
  }

  const supabase = getSupabase()

  // If item_id provided — just create preference for existing item
  if (body.item_id) {
    const { data, error } = await supabase
      .from('local_guide_preferences')
      .upsert({
        hotel_id:             hotelId,
        item_id:              body.item_id,
        is_enabled:           body.is_enabled ?? true,
        custom_priority:      body.custom_priority ?? 50,
        custom_notes:         body.custom_notes || null,
        promoted_by_hotel:    body.promoted_by_hotel ?? false,
        commission_percentage: body.commission_percentage ?? 0,
        commission_eligible:  body.commission_eligible ?? false,
        partner_id:           body.partner_id || null,
        distance_km:          body.distance_km || null,
        distance_min_walk:    body.distance_min_walk || null,
      }, { onConflict: 'hotel_id,item_id' })
      .select().single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ status: 'created', preference: data })
  }

  // Otherwise — create new item + preference
  const { data: item, error: itemErr } = await supabase
    .from('local_guide_items')
    .insert({
      category:                body.category,
      name:                    body.name,
      area:                    body.area || null,
      description:             body.description || null,
      vibe:                    body.vibe || null,
      tags:                    body.tags || [],
      cuisine_type:            body.cuisine_type || null,
      price_range:             body.price_range || null,
      phone:                   body.phone || null,
      website:                 body.website || null,
      reservation_url:         body.reservation_url || null,
      booking_method:          body.booking_method || 'phone',
      popular_item:            body.popular_item || null,
      popular_item_description: body.popular_item_description || null,
      popular_item_price:      body.popular_item_price || null,
      google_rating:           body.google_rating || null,
      google_place_id:         body.google_place_id || null,
      is_global:               false,
      data_source:             'manual',
    })
    .select().single()

  if (itemErr) return Response.json({ error: itemErr.message }, { status: 500 })

  const { data: pref, error: prefErr } = await supabase
    .from('local_guide_preferences')
    .insert({
      hotel_id:             hotelId,
      item_id:              item.id,
      is_enabled:           true,
      custom_priority:      body.custom_priority ?? 50,
      commission_eligible:  body.commission_eligible ?? false,
      commission_percentage: body.commission_percentage ?? 0,
      partner_id:           body.partner_id || null,
    })
    .select().single()

  if (prefErr) return Response.json({ error: prefErr.message }, { status: 500 })
  return Response.json({ status: 'created', item, preference: pref })
}

// PATCH — update hotel preference
export async function PATCH(request) {
  const { session, error: authErr } = requireSession(request)
  if (authErr) return authErr

  const { preference_id, ...updates } = await request.json()
  if (!preference_id) return Response.json({ error: 'preference_id required' }, { status: 400 })

  const supabase  = getSupabase()
  const allowed   = ['is_enabled','custom_priority','custom_notes','promoted_by_hotel',
                     'commission_percentage','commission_eligible','partner_id',
                     'distance_km','distance_min_walk','distance_min_drive']
  const filtered  = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
  filtered.last_updated = new Date().toISOString()

  const { data, error } = await supabase
    .from('local_guide_preferences')
    .update(filtered)
    .eq('id', preference_id)
    .select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ status: 'updated', preference: data })
}

// DELETE — remove item from hotel (delete preference, keep global item)
export async function DELETE(request) {
  const { session, error: authErr } = requireSession(request)
  if (authErr) return authErr

  const { searchParams } = new URL(request.url)
  const preferenceId = searchParams.get('id')
  if (!preferenceId) return Response.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabase()
  await supabase.from('local_guide_preferences').delete().eq('id', preferenceId)
  return Response.json({ status: 'removed' })
}
