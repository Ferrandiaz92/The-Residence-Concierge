// components/LocalGuideManager.js — v3
// Full-width spreadsheet table for local guide management
// Features: category-adaptive columns, inline cell editing,
// multi-hotel apply, hover tooltips, visible flags
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const GREEN = '#1C3D2E'
const GOLD  = '#C9A84C'
const font  = "'DM Sans',sans-serif"

const CATEGORIES = [
  { key:'all',            label:'All',               emoji:'🗺️' },
  { key:'restaurant',     label:'Restaurants',        emoji:'🍽️' },
  { key:'beach',          label:'Beaches',            emoji:'🏖️' },
  { key:'nightlife',      label:'Nightlife & Bars',   emoji:'🍹' },
  { key:'cafe',           label:'Coffee & Cafés',     emoji:'☕' },
  { key:'museum',         label:'Museums & Culture',  emoji:'🏛️' },
  { key:'archaeological', label:'Archaeological',     emoji:'🏺' },
  { key:'nature',         label:'Nature & Hiking',    emoji:'🌿' },
  { key:'winery',         label:'Wineries',           emoji:'🍷' },
  { key:'other',          label:'Other',              emoji:'📍' },
]

const BOOKING_METHODS = [
  { key:'partner', label:'Via partner' },
  { key:'phone',    label:'📞 Phone' },
  { key:'whatsapp', label:'💬 WhatsApp' },
  { key:'link',     label:'🔗 Book online' },
  { key:'walkin',  label:'Walk-in' },
  { key:'none',    label:'—' },
]

const PRICE_RANGES = ['$','$$','$$$','$$$$']
const VIBES        = ['romantic','family','business','lively','relaxed','adventurous','cultural']
// ── Flat tags (legacy / fallback) ────────────────────────────
const COMMON_TAGS = ['sea_view','outdoor','vegetarian','vegan','halal','kosher',
                     'late_night','live_music','pet_friendly','wheelchair','parking','instagram_worthy']

// ── Category-specific structured attributes ───────────────────
// Stored as "group:value" in tags[] e.g. "vibe:romantic", "bestfor:couples"
const CATEGORY_ATTRS = {
  restaurant: [
    { key:'vibe', label:'Vibe', emoji:'😌', multi:true, options:[
      {key:'romantic',    label:'Romantic'},
      {key:'family',      label:'Family-friendly'},
      {key:'casual',      label:'Casual & relaxed'},
      {key:'lively',      label:'Lively & social'},
      {key:'fine_dining', label:'Fine dining'},
      {key:'authentic',   label:'Authentic & local'},
      {key:'business',    label:'Business lunch'},
    ]},
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'couples',     label:'Couples'},
      {key:'families',    label:'Families with kids'},
      {key:'groups',      label:'Groups & friends'},
      {key:'solo',        label:'Solo dining'},
      {key:'special_occ', label:'Special occasions'},
      {key:'business',    label:'Business meetings'},
    ]},
    { key:'setting', label:'Setting', emoji:'📍', multi:true, options:[
      {key:'sea_view',    label:'Sea view'},
      {key:'rooftop',     label:'Rooftop'},
      {key:'beachfront',  label:'Beachfront'},
      {key:'outdoor',     label:'Outdoor terrace'},
      {key:'indoor',      label:'Indoor only'},
      {key:'cave',        label:'Cave / unique setting'},
    ]},
    { key:'diet', label:'Dietary', emoji:'🥗', multi:true, options:[
      {key:'vegetarian',  label:'Vegetarian options'},
      {key:'vegan',       label:'Vegan options'},
      {key:'gluten_free', label:'Gluten-free'},
      {key:'halal',       label:'Halal'},
      {key:'kosher',      label:'Kosher'},
    ]},
  ],
  beach: [
    { key:'vibe', label:'Vibe / Atmosphere', emoji:'😌', multi:true, options:[
      {key:'calm',        label:'Calm & peaceful'},
      {key:'family',      label:'Family-friendly'},
      {key:'lively',      label:'Lively & social'},
      {key:'romantic',    label:'Romantic'},
      {key:'secluded',    label:'Secluded & private'},
      {key:'trendy',      label:'Trendy & Instagram'},
    ]},
    { key:'bestfor', label:'Best for', emoji:'🏄', multi:true, options:[
      {key:'couples',     label:'Couples'},
      {key:'families',    label:'Families with kids'},
      {key:'solo',        label:'Solo relaxation'},
      {key:'groups',      label:'Groups & friends'},
      {key:'snorkeling',  label:'Snorkeling & exploring'},
      {key:'watersports', label:'Water sports'},
      {key:'sunbathing',  label:'Sunbathing'},
      {key:'photography', label:'Photography & sunset'},
    ]},
    { key:'access', label:'Accessibility', emoji:'🚶', multi:false, options:[
      {key:'easy_parking',label:'Easy — parking nearby'},
      {key:'short_walk',  label:'Short walk from road'},
      {key:'stairs',      label:'Stairs access'},
      {key:'hike',        label:'Requires short hike'},
      {key:'boat_only',   label:'Boat access only'},
      {key:'hidden_gem',  label:'Hidden gem'},
    ]},
    { key:'amenity', label:'Amenities', emoji:'🏖️', multi:true, options:[
      {key:'sunbeds',     label:'Sunbeds & umbrellas'},
      {key:'beach_bar',   label:'Beach bar / restaurant'},
      {key:'showers',     label:'Showers & toilets'},
      {key:'watersports', label:'Water sports rentals'},
      {key:'lifeguard',   label:'Lifeguard'},
      {key:'parking',     label:'Parking available'},
    ]},
  ],
  nightlife: [
    { key:'vibe', label:'Vibe / Atmosphere', emoji:'🎶', multi:false, options:[
      {key:'chill',       label:'Chill & laid-back'},
      {key:'lively',      label:'Lively & social'},
      {key:'party',       label:'Party / high-energy'},
      {key:'upscale',     label:'Upscale & classy'},
      {key:'alternative', label:'Alternative / underground'},
    ]},
    { key:'venue', label:'Venue Type', emoji:'🍹', multi:false, options:[
      {key:'cocktail_bar',label:'Cocktail bar'},
      {key:'beach_bar',   label:'Beach bar'},
      {key:'nightclub',   label:'Nightclub'},
      {key:'lounge',      label:'Lounge bar'},
      {key:'pub',         label:'Pub / casual bar'},
      {key:'rooftop_bar', label:'Rooftop bar'},
      {key:'wine_bar',    label:'Wine bar'},
    ]},
    { key:'setting', label:'Setting', emoji:'📍', multi:true, options:[
      {key:'beachfront',  label:'Beachfront'},
      {key:'city_center', label:'City centre'},
      {key:'rooftop',     label:'Rooftop'},
      {key:'marina',      label:'Marina'},
      {key:'hidden',      label:'Hidden / speakeasy'},
      {key:'resort',      label:'Resort / hotel bar'},
    ]},
    { key:'price', label:'Price Level', emoji:'💸', multi:false, options:[
      {key:'budget',      label:'Budget-friendly'},
      {key:'midrange',    label:'Mid-range'},
      {key:'premium',     label:'Premium'},
      {key:'luxury',      label:'Luxury'},
      {key:'bottle',      label:'Bottle service'},
    ]},
    { key:'time', label:'Best Time', emoji:'⏰', multi:true, options:[
      {key:'sunset',      label:'Sunset drinks'},
      {key:'early_eve',   label:'Early evening'},
      {key:'late_night',  label:'Late-night'},
      {key:'after_hours', label:'After-hours'},
      {key:'day_to_night',label:'Day-to-night'},
    ]},
  ],
  cafe: [
    { key:'vibe', label:'Vibe', emoji:'☕', multi:true, options:[
      {key:'chill',       label:'Chill & relaxed'},
      {key:'lively',      label:'Lively & social'},
      {key:'coworking',   label:'Coworking-friendly'},
      {key:'instagram',   label:'Instagram-worthy'},
      {key:'local',       label:'Local favourite'},
      {key:'artsy',       label:'Artsy & creative'},
    ]},
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'remote_work', label:'Remote work'},
      {key:'first_date',  label:'First date / catch up'},
      {key:'family',      label:'Family with kids'},
      {key:'groups',      label:'Groups & friends'},
      {key:'solo',        label:'Solo & reading'},
      {key:'meetings',    label:'Informal meetings'},
    ]},
    { key:'amenity', label:'Amenities', emoji:'🔌', multi:true, options:[
      {key:'fast_wifi',   label:'Fast WiFi'},
      {key:'power',       label:'Power outlets'},
      {key:'outdoor',     label:'Outdoor seating'},
      {key:'food',        label:'Food menu'},
      {key:'specialty',   label:'Specialty coffee'},
      {key:'vegan',       label:'Vegan options'},
    ]},
    { key:'setting', label:'Setting', emoji:'📍', multi:false, options:[
      {key:'city_center', label:'City centre'},
      {key:'beachfront',  label:'Beachfront'},
      {key:'quiet',       label:'Quiet side street'},
      {key:'marina',      label:'Marina'},
      {key:'old_town',    label:'Old town'},
    ]},
  ],
  museum: [
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'history',     label:'History enthusiasts'},
      {key:'families',    label:'Families with kids'},
      {key:'photography', label:'Photography'},
      {key:'groups',      label:'School & tour groups'},
      {key:'culture',     label:'Art & culture lovers'},
      {key:'rainy_day',   label:'Rainy day option'},
    ]},
    { key:'type', label:'Collection', emoji:'🏛️', multi:false, options:[
      {key:'archaeology', label:'Archaeological'},
      {key:'art',         label:'Art & contemporary'},
      {key:'history',     label:'History & heritage'},
      {key:'science',     label:'Science & technology'},
      {key:'local',       label:'Local culture'},
      {key:'maritime',    label:'Maritime & nautical'},
    ]},
    { key:'visit', label:'Visit Duration', emoji:'⏱️', multi:false, options:[
      {key:'quick',       label:'Quick — under 1 hour'},
      {key:'half_day',    label:'Half day'},
      {key:'full_day',    label:'Full day'},
    ]},
  ],
  archaeological: [
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'history',     label:'History enthusiasts'},
      {key:'families',    label:'Families'},
      {key:'photography', label:'Photography'},
      {key:'guided',      label:'Guided tours'},
      {key:'self_guided', label:'Self-guided'},
    ]},
    { key:'period', label:'Historical Period', emoji:'🏺', multi:false, options:[
      {key:'neolithic',   label:'Neolithic'},
      {key:'bronze_age',  label:'Bronze Age'},
      {key:'greek',       label:'Ancient Greek'},
      {key:'roman',       label:'Roman'},
      {key:'byzantine',   label:'Byzantine'},
      {key:'medieval',    label:'Medieval'},
    ]},
    { key:'practical', label:'Practical Info', emoji:'ℹ️', multi:true, options:[
      {key:'shade',       label:'Shaded areas'},
      {key:'parking',     label:'Parking available'},
      {key:'cafe',        label:'Café on site'},
      {key:'audio_guide', label:'Audio guide'},
      {key:'wheelchair',  label:'Wheelchair accessible'},
    ]},
  ],
  nature: [
    { key:'difficulty', label:'Difficulty', emoji:'💪', multi:false, options:[
      {key:'easy',        label:'Easy — flat & paved'},
      {key:'moderate',    label:'Moderate — some elevation'},
      {key:'hard',        label:'Challenging — steep'},
      {key:'expert',      label:'Expert only'},
    ]},
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'couples',     label:'Couples'},
      {key:'families',    label:'Families with kids'},
      {key:'groups',      label:'Groups'},
      {key:'solo',        label:'Solo hikers'},
      {key:'photography', label:'Nature photography'},
      {key:'birdwatch',   label:'Birdwatching'},
    ]},
    { key:'terrain', label:'Terrain', emoji:'🌿', multi:true, options:[
      {key:'forest',      label:'Forest trail'},
      {key:'mountain',    label:'Mountain'},
      {key:'coastal',     label:'Coastal path'},
      {key:'gorge',       label:'Gorge / canyon'},
      {key:'vineyard',    label:'Vineyard landscape'},
      {key:'waterfall',   label:'Waterfall'},
    ]},
    { key:'season', label:'Best Season', emoji:'🗓️', multi:true, options:[
      {key:'spring',      label:'Spring'},
      {key:'summer',      label:'Summer (early morning)'},
      {key:'autumn',      label:'Autumn'},
      {key:'winter',      label:'Winter'},
      {key:'year_round',  label:'Year-round'},
    ]},
  ],
  winery: [
    { key:'experience', label:'Experience Type', emoji:'🍷', multi:true, options:[
      {key:'tasting',     label:'Wine tasting'},
      {key:'tour',        label:'Winery tour'},
      {key:'food_pairing',label:'Food & wine pairing'},
      {key:'harvest',     label:'Harvest experience'},
      {key:'private',     label:'Private events'},
    ]},
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'couples',     label:'Couples'},
      {key:'groups',      label:'Groups'},
      {key:'enthusiasts', label:'Wine enthusiasts'},
      {key:'casual',      label:'Casual introduction'},
      {key:'corporate',   label:'Corporate events'},
    ]},
    { key:'setting', label:'Setting', emoji:'📍', multi:false, options:[
      {key:'mountain',    label:'Mountain vineyard'},
      {key:'valley',      label:'Valley / plains'},
      {key:'coastal',     label:'Coastal area'},
      {key:'traditional', label:'Traditional stone building'},
      {key:'modern',      label:'Modern facility'},
    ]},
  ],
  other: [
    { key:'vibe', label:'Vibe', emoji:'✨', multi:true, options:[
      {key:'relaxed',     label:'Relaxed'},
      {key:'lively',      label:'Lively'},
      {key:'romantic',    label:'Romantic'},
      {key:'family',      label:'Family-friendly'},
      {key:'unique',      label:'Unique experience'},
    ]},
    { key:'bestfor', label:'Best for', emoji:'👥', multi:true, options:[
      {key:'couples',     label:'Couples'},
      {key:'families',    label:'Families'},
      {key:'groups',      label:'Groups'},
      {key:'solo',        label:'Solo'},
    ]},
  ],
}

// Helper: get tags for a category as prefixed strings
function getTagsForCategory(cat) {
  return (CATEGORY_ATTRS[cat] || CATEGORY_ATTRS.other)
}

// Helper: parse prefixed tag → {group, value}
function parseTag(tag) {
  const idx = tag.indexOf(':')
  return idx > -1 ? { group: tag.slice(0,idx), value: tag.slice(idx+1) } : { group:'tag', value:tag }
}

// Helper: get display label for a prefixed tag
function tagLabel(tag, cat) {
  const {group, value} = parseTag(tag)
  const attrs = CATEGORY_ATTRS[cat] || CATEGORY_ATTRS.other
  const grp = attrs.find(g => g.key === group)
  const opt = grp?.options.find(o => o.key === value)
  return opt?.label || value
}

// ── Category-specific column definitions ─────────────────────
// Each category overrides 3 flexible columns: col4, col5, col6
// Fixed: toggle | emoji | name+flags | area | rating | walk | booking | actions
const CAT_COLS = {
  restaurant:     { col4:'Cuisine',     col5:'Signature dish',  field4:'cuisine_type', field5:'popular_item' },
  beach:          { col4:'Type',        col5:'Water quality',   field4:'vibe',         field5:'popular_item' },
  nightlife:      { col4:'Vibe',        col5:'Signature drink', field4:'vibe',         field5:'popular_item' },
  cafe:           { col4:'Specialty',   col5:'Must-try item',   field4:'cuisine_type', field5:'popular_item' },
  museum:         { col4:'Theme',       col5:'Top exhibit',     field4:'vibe',         field5:'popular_item' },
  archaeological: { col4:'Period',      col5:'Highlight',       field4:'cuisine_type', field5:'popular_item' },
  nature:         { col4:'Difficulty',  col5:'Best season',     field4:'vibe',         field5:'popular_item' },
  winery:         { col4:'Grape type',  col5:'Signature wine',  field4:'cuisine_type', field5:'popular_item' },
  other:          { col4:'Type',        col5:'Highlight',       field4:'vibe',         field5:'popular_item' },
  all:            { col4:'Cuisine/Type',col5:'Signature item',  field4:'cuisine_type', field5:'popular_item' },
}

function getCols(cat) { return CAT_COLS[cat] || CAT_COLS.all }

// ── Tooltip ───────────────────────────────────────────────────
function Tooltip({ item }) {
  const lines = [
    item.description && `📝 ${item.description}`,
    item.custom_notes && `💬 ${item.custom_notes}`,
    item.popular_item && `⭐ ${item.popular_item}${item.popular_item_price ? ` — €${item.popular_item_price}` : ''}`,
    item.seasonal_notes && `🗓 ${item.seasonal_notes}`,
    (item.tags||[]).length && `🏷 ${item.tags.map(t=>{const{group,value}=parseTag(t);return tagLabel(t,item.category)||value}).join(' · ')}`,
    item.website && `🌐 ${item.website}`,
  ].filter(Boolean)

  if (!lines.length) return null
  return (
    <div style={{ position:'absolute', zIndex:999, bottom:'calc(100% + 6px)', left:'0',
      background:'#1C3D2E', color:'white', borderRadius:'8px', padding:'10px 12px',
      fontSize:'11px', lineHeight:'1.6', minWidth:'220px', maxWidth:'320px',
      boxShadow:'0 4px 16px rgba(0,0,0,0.25)', pointerEvents:'none' }}>
      {lines.map((l,i) => <div key={i}>{l}</div>)}
      <div style={{ position:'absolute', bottom:'-5px', left:'12px', width:'10px', height:'10px',
        background:'#1C3D2E', transform:'rotate(45deg)' }}/>
    </div>
  )
}

// ── Editable cell ─────────────────────────────────────────────
function EditableCell({ value, field, item, allItems, hotels, onSave, type='text', options=null, width='100%' }) {
  const [editing, setEditing]     = useState(false)
  const [val, setVal]             = useState(value||'')
  const [showScope, setShowScope] = useState(false)
  const [selectedHotels, setSelectedHotels] = useState([])
  const [saving, setSaving]       = useState(false)
  const ref = useRef()

  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  function startEdit(e) { e.stopPropagation(); setEditing(true); setVal(value||'') }

  async function commit() {
    if (val === (value||'')) { setEditing(false); setShowScope(false); return }
    if (hotels && hotels.length > 1) { setShowScope(true); return }
    // Single hotel — save directly
    setSaving(true)
    await onSave(item.pref_id, { [field]: val })
    setSaving(false); setEditing(false)
  }

  async function commitScope() {
    setSaving(true)
    const targets = selectedHotels.length > 0 ? selectedHotels : [item.pref_id]
    for (const prefId of targets) {
      await onSave(prefId, { [field]: val })
    }
    setSaving(false); setEditing(false); setShowScope(false)
  }

  if (!editing) return (
    <div onClick={startEdit} title="Click to edit"
      style={{ cursor:'text', minHeight:'18px', padding:'2px 4px', borderRadius:'4px',
        color: val ? '#374151' : '#D1D5DB', fontSize:'12px',
        transition:'background .1s' }}
      onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      {val || '—'}
    </div>
  )

  const inputStyle = { width, padding:'3px 6px', border:`1px solid ${GREEN}`, borderRadius:'5px',
    fontSize:'12px', fontFamily:font, outline:'none', boxSizing:'border-box' }

  return (
    <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
      {options ? (
        <select ref={ref} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} style={inputStyle}>
          {options.map(o=><option key={o.key||o} value={o.key||o}>{o.label||o}</option>)}
        </select>
      ) : (
        <input ref={ref} type={type} value={val} onChange={e=>setVal(e.target.value)}
          onBlur={commit} onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape'){setEditing(false)} }}
          style={inputStyle} />
      )}

      {/* Multi-hotel scope selector */}
      {showScope && hotels && (
        <div style={{ position:'absolute', top:'100%', left:0, zIndex:200, background:'white',
          border:'1px solid #E5E7EB', borderRadius:'10px', padding:'12px', minWidth:'240px',
          boxShadow:'0 4px 16px rgba(0,0,0,0.12)' }}>
          <div style={{ fontSize:'12px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>
            Apply "{val}" to which hotels?
          </div>
          {hotels.map(h => (
            <label key={h.pref_id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', fontSize:'12px', cursor:'pointer' }}>
              <input type="checkbox" checked={selectedHotels.includes(h.pref_id)}
                onChange={e => setSelectedHotels(prev => e.target.checked ? [...prev, h.pref_id] : prev.filter(id=>id!==h.pref_id))} />
              {h.hotelName || h.hotel_id}
            </label>
          ))}
          <div style={{ display:'flex', gap:'6px', marginTop:'10px' }}>
            <button onClick={()=>{setSelectedHotels(hotels.map(h=>h.pref_id));}} 
              style={{ fontSize:'11px', color:GREEN, background:'none', border:'none', cursor:'pointer', fontFamily:font }}>Select all</button>
            <button onClick={()=>setShowScope(false)}
              style={{ flex:1, padding:'5px 10px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'6px', fontSize:'11px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>Cancel</button>
            <button onClick={commitScope} disabled={saving}
              style={{ flex:1, padding:'5px 10px', background:GREEN, border:'none', borderRadius:'6px', fontSize:'11px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:font }}>
              {saving ? '…' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Toggle cell ───────────────────────────────────────────────
function ToggleCell({ on, onChange }) {
  return (
    <button onClick={e=>{e.stopPropagation();onChange()}}
      style={{ width:'36px', height:'20px', borderRadius:'10px', border:'none',
        cursor:'pointer', position:'relative', background:on?'#16A34A':'#D1D5DB', transition:'background .2s', flexShrink:0 }}>
      <div style={{ position:'absolute', top:'2px', left:on?'18px':'2px', width:'16px', height:'16px',
        borderRadius:'50%', background:'white', transition:'left .2s' }}/>
    </button>
  )
}

// ── Flag toggle (star / commission) ──────────────────────────
function FlagBtn({ active, label, color, bgActive, bgInactive, onClick }) {
  return (
    <button onClick={e=>{e.stopPropagation();onClick()}}
      title={label}
      style={{ padding:'2px 7px', borderRadius:'20px', fontSize:'10px', fontWeight:'700',
        border:`0.5px solid ${active ? color : '#E5E7EB'}`,
        background: active ? bgActive : bgInactive || 'white',
        color: active ? color : '#D1D5DB',
        cursor:'pointer', fontFamily:font, transition:'all .15s', whiteSpace:'nowrap' }}>
      {label}
    </button>
  )
}


// ── Category-aware tags popover ───────────────────────────────
function TagsPopover({ item, onSave, onClose }) {
  const [selected, setSelected] = useState(item.tags || [])
  const attrs = getTagsForCategory(item.category)

  function toggle(group, value, multi) {
    const prefixed = `${group}:${value}`
    setSelected(prev => {
      if (prev.includes(prefixed)) return prev.filter(t => t !== prefixed)
      if (!multi) {
        // Single-select: remove other values in same group
        const filtered = prev.filter(t => !t.startsWith(`${group}:`))
        return [...filtered, prefixed]
      }
      return [...prev, prefixed]
    })
  }

  function isSelected(group, value) { return selected.includes(`${group}:${value}`) }

  async function save() { await onSave(item.pref_id, { tags: selected }); onClose() }

  return (
    <div style={{ position:'absolute', zIndex:400, top:'calc(100% + 4px)', left:0,
      background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'14px',
      minWidth:'300px', maxWidth:'380px', boxShadow:'0 8px 30px rgba(0,0,0,0.15)' }}
      onClick={e=>e.stopPropagation()}>
      <div style={{ fontSize:'12px', fontWeight:'700', color:'#111827', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
        🏷 Attributes — {item.name}
        <span style={{ fontSize:'10px', fontWeight:'400', color:'#9CA3AF', marginLeft:'auto' }}>
          {selected.length} selected
        </span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'12px', maxHeight:'360px', overflowY:'auto', marginBottom:'10px' }}>
        {attrs.map(group => (
          <div key={group.key}>
            <div style={{ fontSize:'10px', fontWeight:'700', color:'#6B7280', marginBottom:'5px', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {group.emoji} {group.label} {!group.multi && <span style={{ fontWeight:'400', color:'#D1D5DB' }}>· pick one</span>}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
              {group.options.map(opt => {
                const active = isSelected(group.key, opt.key)
                return (
                  <button key={opt.key} onClick={()=>toggle(group.key, opt.key, group.multi)}
                    style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500',
                      cursor:'pointer', fontFamily:font, transition:'all .1s',
                      border:`0.5px solid ${active?GREEN:'#D1D5DB'}`,
                      background:active?GREEN:'white',
                      color:active?'white':'#374151' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end', borderTop:'0.5px solid #F3F4F6', paddingTop:'10px' }}>
        <button onClick={onClose} style={{ padding:'6px 14px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'11px', color:'#374151', cursor:'pointer', fontFamily:font }}>Cancel</button>
        <button onClick={save} style={{ padding:'6px 14px', background:GREEN, border:'none', borderRadius:'7px', fontSize:'11px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:font }}>Save attributes</button>
      </div>
    </div>
  )
}

export default function LocalGuideManager({ hotelId }) {
  const [items, setItems]             = useState([])
  const [available, setAvailable]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [catFilter, setCatFilter]     = useState('all')
  const [areaFilter, setAreaFilter]   = useState('')
  const [search, setSearch]           = useState('')
  const [showEnabled, setShowEnabled] = useState('all')
  const [sortBy, setSortBy]           = useState('priority')
  const [adding, setAdding]           = useState(false)
  const [importing, setImporting]     = useState(false)
  const [importText, setImportText]   = useState('')
  const [importPreview, setImportPreview] = useState([])
  const [importError, setImportError]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [hoveredRow, setHoveredRow]   = useState(null)
  const [hoverTimer, setHoverTimer]   = useState(null)
  const [visibleTooltip, setVisibleTooltip] = useState(null)
  const [tagsPopover, setTagsPopover]     = useState(null)
  const fileRef = useRef()

  const blank = () => ({
    category:'restaurant', name:'', area:'', cuisine_type:'', price_range:'$$',
    vibe:'', tags:[], description:'', popular_item:'', popular_item_price:'',
    phone:'', booking_method:'phone', google_rating:'', google_place_id:'',
    website:'', reservation_url:'', notes:'',
    custom_priority:50, promoted_by_hotel:false,
    commission_eligible:false, commission_percentage:0,
    distance_km:'', distance_min_walk:'',
  })
  const [newRow, setNewRow] = useState(blank())

  useEffect(() => { if (hotelId) load() }, [hotelId])

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/local-guide?hotelId=${hotelId}`)
      const data = await res.json()
      const merged = (data.preferences || []).map(p => ({
        pref_id: p.id, is_enabled: p.is_enabled,
        custom_priority: p.custom_priority, custom_notes: p.custom_notes,
        promoted_by_hotel: p.promoted_by_hotel,
        commission_eligible: p.commission_eligible,
        commission_percentage: p.commission_percentage,
        partner_id: p.partner_id,
        distance_km: p.distance_km, distance_min_walk: p.distance_min_walk,
        ...p.local_guide_items,
      }))
      setItems(merged)
      setAvailable(data.available || [])
    } finally { setLoading(false) }
  }

  const areas    = [...new Set(items.map(i => i.area).filter(Boolean))].sort()
  const catCounts = {}
  for (const i of items) catCounts[i.category] = (catCounts[i.category]||0) + 1

  const filtered = items
    .filter(i => catFilter === 'all' || i.category === catFilter)
    .filter(i => !areaFilter || i.area === areaFilter)
    .filter(i => showEnabled === 'all' || (showEnabled==='enabled' ? i.is_enabled : !i.is_enabled))
    .filter(i => !search || [i.name,i.area,i.description,i.cuisine_type].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      if (sortBy==='priority')   return (b.custom_priority||0)-(a.custom_priority||0)
      if (sortBy==='rating')     return (b.google_rating||0)-(a.google_rating||0)
      if (sortBy==='name')       return a.name.localeCompare(b.name)
      if (sortBy==='commission') return (b.commission_percentage||0)-(a.commission_percentage||0)
      return 0
    })

  const cols = getCols(catFilter)

  // Save a preference field (single hotel)
  async function patchPref(prefId, updates) {
    const res = await fetch('/api/local-guide', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ preference_id: prefId, ...updates }) })
    if (res.ok) {
      setItems(prev => prev.map(i => i.pref_id === prefId ? {...i,...updates} : i))
    }
  }

  function handleMouseEnter(prefId) {
    const t = setTimeout(() => setVisibleTooltip(prefId), 500)
    setHoverTimer(t)
  }
  function handleMouseLeave() {
    clearTimeout(hoverTimer)
    setVisibleTooltip(null)
  }

  async function removeItem(item) {
    if (!confirm(`Remove "${item.name}"?`)) return
    await fetch(`/api/local-guide?id=${item.pref_id}`, { method:'DELETE' })
    setItems(prev => prev.filter(i => i.pref_id !== item.pref_id))
  }

  async function enableGlobal(item) {
    await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hotelId, item_id: item.id, is_enabled:true, custom_priority:50 }) })
    await load()
  }

  async function saveNew() {
    if (!newRow.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ hotelId, ...newRow,
          google_rating: newRow.google_rating ? parseFloat(newRow.google_rating) : null,
          popular_item_price: newRow.popular_item_price ? parseFloat(newRow.popular_item_price) : null,
        })
      })
      if (res.ok) { await load(); setAdding(false); setNewRow(blank()) }
    } finally { setSaving(false) }
  }

  function parseImport(text, name='import.json') {
    setImportError(''); setImportPreview([])
    try {
      let rows = []
      if (name.endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
        const p = JSON.parse(text); rows = Array.isArray(p) ? p : [p]
      } else {
        const lines = text.split('\n').filter(Boolean)
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''))
        rows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''))
          return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||'']))
        })
      }
      setImportPreview(rows.slice(0,3))
      setImportText(JSON.stringify(rows))
    } catch(e) { setImportError('Cannot parse: ' + e.message) }
  }

  async function runImport() {
    setSaving(true)
    try {
      const rows = JSON.parse(importText)
      let ok = 0
      for (const r of rows) {
        const res = await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hotelId,
            category: r.category||'restaurant', name: r.name||'',
            area: r.area||'', description: r.description||'',
            cuisine_type: r.cuisine_type||r.cuisine||'',
            price_range: r.price_range||'$$',
            google_rating: r.google_rating ? parseFloat(r.google_rating) : null,
            phone: r.phone||'', booking_method: r.booking_method||'phone',
            popular_item: r.popular_item||'',
            popular_item_price: r.popular_item_price ? parseFloat(r.popular_item_price) : null,
            vibe: r.vibe||'', google_place_id: r.google_place_id||'',
            website: r.website||'', reservation_url: r.reservation_url||'',
            tags: r.tags ? (Array.isArray(r.tags) ? r.tags : r.tags.split(',').map(t=>t.trim())) : [],
            notes: r.notes||'', custom_priority: r.custom_priority ? parseInt(r.custom_priority) : 50,
          })
        })
        if (res.ok) ok++
      }
      alert(`Imported ${ok}/${rows.length} items`)
      setImporting(false); setImportText(''); setImportPreview([])
      await load()
    } finally { setSaving(false) }
  }

  // ── Add row inline ─────────────────────────────────────────
  const AddRowInline = () => {
    const [d, setD] = useState({...newRow, category: catFilter !== 'all' ? catFilter : 'restaurant'})
    const tc = (field, ph, type='text', w='100%') => (
      <input type={type} value={d[field]||''} placeholder={ph}
        onChange={e=>setD(p=>({...p,[field]:e.target.value}))}
        style={{ width:w, padding:'4px 6px', border:'0.5px solid #93C5FD', borderRadius:'5px',
          fontSize:'11px', fontFamily:font, outline:'none', boxSizing:'border-box', background:'#EFF6FF' }} />
    )
    const sc = (field, opts) => (
      <select value={d[field]||''} onChange={e=>setD(p=>({...p,[field]:e.target.value}))}
        style={{ width:'100%', padding:'4px 5px', border:'0.5px solid #93C5FD', borderRadius:'5px',
          fontSize:'11px', fontFamily:font, outline:'none', background:'#EFF6FF' }}>
        {opts.map(o=><option key={o.key||o} value={o.key||o}>{o.label||o}</option>)}
      </select>
    )
    return (
      <tr style={{ background:'#EFF6FF' }}>
        <td style={{ padding:'5px 8px' }}><div style={{ width:'36px' }}/></td>
        <td style={{ padding:'4px 5px' }}>
          {sc('category', CATEGORIES.filter(c=>c.key!=='all').map(c=>({key:c.key,label:`${c.emoji}`})))}
        </td>
        <td style={{ padding:'4px 5px' }}>{tc('name','Name *')}</td>
        <td style={{ padding:'4px 5px' }}>{tc('area','Area')}</td>
        <td style={{ padding:'4px 5px' }}>{tc(cols.field4, cols.col4)}</td>
        <td style={{ padding:'4px 5px' }}>{tc('google_rating','4.5','number','70px')}</td>
        <td style={{ padding:'4px 5px' }}>
          <div style={{ display:'flex', gap:'3px' }}>
            {sc('booking_method', BOOKING_METHODS.map(b=>({key:b.key,label:b.label})))}
            {tc('phone','+357...')}
          </div>
        </td>
        <td style={{ padding:'4px 5px' }}>{tc(cols.field5, cols.col5)}</td>
        <td style={{ padding:'4px 5px' }}>{tc('distance_min_walk','min','number','60px')}</td>
        <td style={{ padding:'4px 5px' }}>
          <div style={{ display:'flex', gap:'4px' }}>
            <button onClick={()=>{setNewRow(d);saveNew()}} disabled={!d.name.trim()||saving}
              style={{ padding:'4px 10px', background:d.name.trim()?GREEN:'#E5E7EB', border:'none', borderRadius:'5px',
                fontSize:'11px', fontWeight:'700', color:d.name.trim()?'white':'#9CA3AF',
                cursor:d.name.trim()?'pointer':'not-allowed', fontFamily:font }}>
              {saving?'…':'✓ Add'}
            </button>
            <button onClick={()=>setAdding(false)}
              style={{ padding:'4px 7px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'5px',
                fontSize:'11px', color:'#9CA3AF', cursor:'pointer', fontFamily:font }}>✕</button>
          </div>
        </td>
      </tr>
    )
  }

  const thStyle = (field) => ({
    padding:'8px 10px', fontSize:'11px', fontWeight:'700', textAlign:'left',
    whiteSpace:'nowrap', cursor:'pointer', userSelect:'none',
    color: sortBy===field ? GREEN : '#6B7280',
    background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB',
  })

  return (
    <div style={{ fontFamily:font, height:'100%', display:'flex', flexDirection:'column' }}>

      {/* Info banner */}
      <div style={{ padding:'10px 16px', background:'#FFFBEB', borderBottom:'0.5px solid #FDE68A',
        fontSize:'11px', color:'#78350F', flexShrink:0, display:'flex', gap:'8px', alignItems:'center' }}>
        <span>🗺️ <strong>Local Guide</strong> — what the bot recommends when guests ask "where to eat?" or "things to do?".</span>
        <span style={{ color:'#9CA3AF' }}>|</span>
        <span>Import CSV/JSON with columns: <code style={{ background:'#FEF3C7', padding:'1px 5px', borderRadius:'3px', fontSize:'10px' }}>name, category, area, cuisine_type, price_range, google_rating, phone, booking_method, popular_item, vibe, description, google_place_id</code></span>
        <span style={{ color:'#9CA3AF' }}>|</span>
        <span>💡 Grey rows = hidden from bot. Click any cell to edit inline.</span>
      </div>

      {/* Category pills + toolbar */}
      <div style={{ padding:'8px 16px', background:'white', borderBottom:'0.5px solid #E5E7EB',
        display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', flexShrink:0 }}>
        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', flex:1 }}>
          {CATEGORIES.map(cat => {
            const count  = cat.key==='all' ? items.length : (catCounts[cat.key]||0)
            const active = catFilter === cat.key
            return (
              <button key={cat.key} onClick={()=>setCatFilter(cat.key)}
                style={{ padding:'4px 11px', borderRadius:'20px', fontSize:'12px', fontWeight:'600',
                  border:`0.5px solid ${active?GREEN:'#E5E7EB'}`,
                  background:active?GREEN:'white', color:active?'white':'#6B7280',
                  cursor:'pointer', fontFamily:font, display:'flex', alignItems:'center', gap:'4px', whiteSpace:'nowrap' }}>
                {cat.emoji} {cat.label} {count>0&&<span style={{ fontSize:'10px', opacity:0.7 }}>({count})</span>}
              </button>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:'6px', flexShrink:0, alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            style={{ width:'130px', padding:'6px 10px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none' }} />
          <select value={areaFilter} onChange={e=>setAreaFilter(e.target.value)}
            style={{ padding:'6px 8px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
            <option value="">All areas</option>
            {areas.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <select value={showEnabled} onChange={e=>setShowEnabled(e.target.value)}
            style={{ padding:'6px 8px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{ padding:'6px 8px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
            <option value="priority">↕ Priority</option>
            <option value="rating">↕ Rating</option>
            <option value="name">↕ Name</option>
            <option value="commission">↕ Commission</option>
          </select>
          <button onClick={()=>setImporting(o=>!o)}
            style={{ padding:'6px 12px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px',
              fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>
            📥 Import
          </button>
          <button onClick={()=>setAdding(o=>!o)}
            style={{ padding:'6px 14px', background:GREEN, border:'none', borderRadius:'7px',
              fontSize:'12px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:font }}>
            + Add row
          </button>
        </div>
      </div>

      {/* Import panel */}
      {importing && (
        <div style={{ padding:'12px 16px', background:'#F0F9FF', borderBottom:'0.5px solid #BAE6FD', flexShrink:0 }}>
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <input type="file" ref={fileRef} accept=".csv,.json" onChange={e=>{
                const f=e.target.files?.[0]; if(!f) return
                const r=new FileReader(); r.onload=ev=>parseImport(ev.target.result,f.name); r.readAsText(f)
              }} style={{ display:'none' }} />
              <textarea value={importText} onChange={e=>{setImportText(e.target.value);parseImport(e.target.value)}}
                placeholder='Paste CSV or JSON here…'
                style={{ width:'100%', height:'56px', padding:'8px', border:'0.5px solid #BAE6FD', borderRadius:'7px',
                  fontSize:'11px', fontFamily:'monospace', resize:'none', outline:'none', boxSizing:'border-box' }} />
              {importError && <div style={{ color:'#DC2626', fontSize:'11px', marginTop:'3px' }}>{importError}</div>}
              {importPreview.length > 0 && (
                <div style={{ fontSize:'11px', color:'#374151', marginTop:'5px' }}>
                  Preview: {importPreview.map((r,i)=><span key={i} style={{ marginRight:'10px' }}>{r.name} ({r.category})</span>)}
                  {(() => { try { const n=JSON.parse(importText).length; return n>3?<span style={{color:'#9CA3AF'}}>+{n-3} more</span>:null } catch{return null} })()}
                </div>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px', flexShrink:0 }}>
              <button onClick={()=>fileRef.current?.click()} style={{ padding:'6px 12px', background:'white', border:'0.5px solid #BAE6FD', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'#0369A1', cursor:'pointer', fontFamily:font }}>📂 File</button>
              <button onClick={runImport} disabled={!importText||saving} style={{ padding:'6px 12px', background:importText?'#0369A1':'#E5E7EB', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', color:importText?'white':'#9CA3AF', cursor:importText?'pointer':'not-allowed', fontFamily:font }}>{saving?'…':'Import'}</button>
              <button onClick={()=>{setImporting(false);setImportText('');setImportPreview([])}} style={{ padding:'6px 12px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', color:'#9CA3AF', cursor:'pointer', fontFamily:font }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        {loading ? (
          <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>Loading…</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead style={{ position:'sticky', top:0, zIndex:20 }}>
              <tr>
                <th style={{ ...thStyle(), width:'44px', cursor:'default' }}>On</th>
                <th style={{ ...thStyle(), width:'30px', cursor:'default' }}>Cat</th>
                <th style={thStyle('name')} onClick={()=>setSortBy('name')}>Name {sortBy==='name'?'↓':''}</th>
                <th style={thStyle('commission')} onClick={()=>setSortBy('commission')}>Flags {sortBy==='commission'?'↓':''}</th>
                <th style={thStyle()}>Area</th>
                <th style={thStyle()}>{cols.col4}</th>
                <th style={thStyle('rating')} onClick={()=>setSortBy('rating')}>Rating {sortBy==='rating'?'↓':''}</th>
                <th style={thStyle()}>Contact / Book</th>
                <th style={thStyle()}>{cols.col5}</th>
                <th style={thStyle('priority')} onClick={()=>setSortBy('priority')}>Distance {sortBy==='priority'?'↓':''}</th>
                <th style={{ ...thStyle(), width:'100px', cursor:'default' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adding && <AddRowInline />}

              {filtered.length === 0 && !adding && (
                <tr><td colSpan={11} style={{ padding:'40px', textAlign:'center', color:'#9CA3AF' }}>
                  No items. Add a row or import from CSV.
                </td></tr>
              )}

              {filtered.map(item => {
                const cat      = CATEGORIES.find(c=>c.key===item.category) || CATEGORIES[CATEGORIES.length-1]
                const showTip  = visibleTooltip === item.pref_id
                const rowBg    = item.is_enabled ? 'white' : '#FAFAFA'

                return (
                  <tr key={item.pref_id}
                    style={{ background:rowBg, borderBottom:'0.5px solid #F3F4F6',
                      opacity: item.is_enabled ? 1 : 0.5 }}
                    onMouseEnter={()=>{ handleMouseEnter(item.pref_id) }}
                    onMouseLeave={()=>{ handleMouseLeave() }}>

                    {/* Toggle */}
                    <td style={{ padding:'6px 8px' }}>
                      <ToggleCell on={item.is_enabled} onChange={()=>patchPref(item.pref_id,{is_enabled:!item.is_enabled})} />
                    </td>

                    {/* Category emoji */}
                    <td style={{ padding:'6px 6px', fontSize:'16px', textAlign:'center' }} title={cat.label}>{cat.emoji}</td>

                    {/* Name + tooltip + tags popover */}
                    <td style={{ padding:'6px 10px', fontWeight:'600', color:'#111827', whiteSpace:'nowrap', position:'relative' }}>
                      {showTip && tagsPopover !== item.pref_id && <Tooltip item={item} />}
                      {tagsPopover === item.pref_id && (
                        <TagsPopover item={item} onSave={patchPref} onClose={()=>setTagsPopover(null)} />
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                        <EditableCell value={item.name} field="name" item={item} onSave={patchPref} />
                        <button onClick={e=>{e.stopPropagation();setTagsPopover(tagsPopover===item.pref_id?null:item.pref_id)}}
                          title={(item.tags||[]).length ? item.tags.map(t=>tagLabel(t,item.category)).join(', ') : 'Add attributes'}
                          style={{ padding:'1px 7px', borderRadius:'10px', fontSize:'9px', fontWeight:'700',
                            background:(item.tags||[]).length?GREEN:'white',
                            border:`0.5px solid ${(item.tags||[]).length?GREEN:'#E5E7EB'}`,
                            color:(item.tags||[]).length?'white':'#D1D5DB',
                            cursor:'pointer', fontFamily:font, whiteSpace:'nowrap' }}>
                          {(item.tags||[]).length ? `🏷 ${item.tags.length}` : '+ attr'}
                        </button>
                        {!item.is_enabled && <span style={{ fontSize:'9px', color:'#9CA3AF' }}>hidden</span>}
                      </div>
                    </td>

                    {/* Flags — right after name */}
                    <td style={{ padding:'6px 8px' }}>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'nowrap', alignItems:'center' }}>
                        <FlagBtn active={item.promoted_by_hotel} label="⭐"
                          color="#78350F" bgActive="rgba(201,168,76,0.15)"
                          onClick={()=>patchPref(item.pref_id,{promoted_by_hotel:!item.promoted_by_hotel})} />
                        <FlagBtn
                          active={item.commission_eligible}
                          label={item.commission_eligible ? `💰${item.commission_percentage||0}%` : '💰'}
                          color="#14532D" bgActive="#DCFCE7"
                          onClick={()=>patchPref(item.pref_id,{commission_eligible:!item.commission_eligible})} />
                        {item.commission_eligible && (
                          <EditableCell value={item.commission_percentage} field="commission_percentage"
                            item={item} onSave={patchPref} type="number" width="40px" />
                        )}
                      </div>
                    </td>

                    {/* Area */}
                    <td style={{ padding:'6px 8px', color:'#6B7280' }}>
                      <EditableCell value={item.area} field="area" item={item} onSave={patchPref} />
                    </td>

                    {/* Flexible col 4 */}
                    <td style={{ padding:'6px 8px', color:'#6B7280' }}>
                      <EditableCell value={item[cols.field4]} field={cols.field4} item={item} onSave={patchPref} />
                    </td>

                    {/* Rating */}
                    <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>
                      <EditableCell value={item.google_rating} field="google_rating" item={item} onSave={patchPref} type="number" width="60px" />
                    </td>

                    {/* Contact / Book */}
                    <td style={{ padding:'6px 8px', color:'#6B7280', whiteSpace:'nowrap', minWidth:'170px' }}>
                      <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                        <EditableCell value={item.booking_method} field="booking_method" item={item} onSave={patchPref}
                          options={BOOKING_METHODS.map(b=>({key:b.key,label:b.label}))} width="110px" />
                        {['phone','whatsapp'].includes(item.booking_method) && (
                          <EditableCell value={item.phone} field="phone" item={item} onSave={patchPref} width="110px" />
                        )}
                        {item.booking_method === 'link' && (
                          <EditableCell value={item.reservation_url||item.website} field="reservation_url" item={item} onSave={patchPref} width="140px" />
                        )}
                      </div>
                    </td>

                    {/* Signature item (flexible col5) */}
                    <td style={{ padding:'6px 8px', color:'#6B7280', maxWidth:'150px' }}>
                      <EditableCell value={item[cols.field5]} field={cols.field5} item={item} onSave={patchPref} />
                    </td>

                    {/* Distance */}
                    <td style={{ padding:'6px 8px', color:'#6B7280', whiteSpace:'nowrap' }}>
                      <EditableCell value={item.distance_min_walk} field="distance_min_walk" item={item} onSave={patchPref} type="number" width="52px" />
                    </td>

                    {/* Actions */}
                    <td style={{ padding:'6px 8px' }}>
                      <button onClick={()=>removeItem(item)}
                        style={{ padding:'4px 10px', background:'white', border:'0.5px solid #FCA5A5',
                          borderRadius:'6px', fontSize:'11px', fontWeight:'600', color:'#DC2626',
                          cursor:'pointer', fontFamily:font }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div style={{ padding:'5px 16px', background:'#F9FAFB', borderTop:'0.5px solid #E5E7EB',
        fontSize:'11px', color:'#9CA3AF', display:'flex', gap:'14px', flexShrink:0 }}>
        <span>{filtered.length}/{items.length} items</span>
        <span>{items.filter(i=>i.is_enabled).length} enabled (shown to bot)</span>
        <span>{items.filter(i=>i.commission_eligible).length} commission</span>
        <span>{items.filter(i=>i.promoted_by_hotel).length} favourites</span>
      </div>
    </div>
  )
}
