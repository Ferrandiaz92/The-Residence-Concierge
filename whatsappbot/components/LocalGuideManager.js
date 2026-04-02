// components/LocalGuideManager.js
// Full local guide management: restaurants, beaches, museums, nightlife,
// cafes, archaeological sites, nature trails, wineries.
// One table, category tabs, inline edit, CSV/JSON import.
'use client'
import { useState, useEffect, useRef } from 'react'

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
  { key:'partner',  label:'Via partner (WhatsApp)' },
  { key:'phone',    label:'Phone call' },
  { key:'link',     label:'Reservation link' },
  { key:'walkin',   label:'Walk-in, no reservation' },
  { key:'none',     label:'Not bookable' },
]

const PRICE_RANGES = ['$','$$','$$$','$$$$']
const VIBES = ['romantic','family','business','lively','relaxed','adventurous','cultural']
const COMMON_TAGS = ['sea_view','outdoor','vegetarian','vegan','halal','kosher','late_night','live_music','pet_friendly','wheelchair','parking','instagram_worthy']

const GREEN = '#1C3D2E'
const GOLD  = '#C9A84C'
const font  = "'DM Sans',sans-serif"

function Tag({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500',
      border:`0.5px solid ${active?GREEN:'#D1D5DB'}`, background:active?GREEN:'white',
      color:active?'white':'#374151', cursor:'pointer', fontFamily:font, transition:'all .1s' }}>
      {label}
    </button>
  )
}

function StarRating({ rating }) {
  if (!rating) return <span style={{ fontSize:'11px', color:'#9CA3AF' }}>No rating</span>
  const stars = Math.round(rating)
  return (
    <span style={{ fontSize:'11px', color:GOLD, fontWeight:'600' }}>
      {'★'.repeat(stars)}{'☆'.repeat(5-stars)} {rating.toFixed(1)}
    </span>
  )
}

function CommissionBadge({ pct }) {
  if (!pct) return null
  return (
    <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'20px',
      background:'#DCFCE7', color:'#14532D' }}>💰 {pct}%</span>
  )
}

export default function LocalGuideManager({ hotelId }) {
  const [items, setItems]           = useState([])   // merged prefs + items
  const [available, setAvailable]   = useState([])   // global items not yet added
  const [loading, setLoading]       = useState(true)
  const [catFilter, setCatFilter]   = useState('all')
  const [areaFilter, setAreaFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [showEnabled, setShowEnabled] = useState('all') // 'all'|'enabled'|'disabled'
  const [editing, setEditing]       = useState(null)  // item being edited
  const [adding, setAdding]         = useState(false) // show add form
  const [importing, setImporting]   = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState([])
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [sortBy, setSortBy]         = useState('priority') // 'priority'|'rating'|'name'|'commission'
  const fileRef = useRef()

  const [newItem, setNewItem] = useState(defaultNewItem())

  function defaultNewItem() {
    return {
      category:'restaurant', name:'', area:'', description:'', vibe:'',
      tags:[], cuisine_type:'', price_range:'$$', google_rating:'',
      phone:'', website:'', reservation_url:'', booking_method:'phone',
      popular_item:'', popular_item_description:'', popular_item_price:'',
      google_place_id:'', notes:'',
      // preference fields
      custom_priority:50, custom_notes:'', promoted_by_hotel:false,
      commission_eligible:false, commission_percentage:0,
      distance_km:'', distance_min_walk:'',
    }
  }

  useEffect(() => { if (hotelId) load() }, [hotelId])

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/local-guide?hotelId=${hotelId}`)
      const data = await res.json()
      // Merge preference + item data
      const merged = (data.preferences || []).map(p => ({
        pref_id:           p.id,
        is_enabled:        p.is_enabled,
        custom_priority:   p.custom_priority,
        custom_notes:      p.custom_notes,
        promoted_by_hotel: p.promoted_by_hotel,
        commission_eligible:   p.commission_eligible,
        commission_percentage: p.commission_percentage,
        partner_id:        p.partner_id,
        distance_km:       p.distance_km,
        distance_min_walk: p.distance_min_walk,
        ...p.local_guide_items,
      }))
      setItems(merged)
      setAvailable(data.available || [])
    } finally { setLoading(false) }
  }

  // ── Filter + sort ────────────────────────────────────────────
  const areas = [...new Set(items.map(i => i.area).filter(Boolean))].sort()

  const filtered = items
    .filter(i => catFilter === 'all' || i.category === catFilter)
    .filter(i => !areaFilter || i.area === areaFilter)
    .filter(i => showEnabled === 'all' || (showEnabled === 'enabled' ? i.is_enabled : !i.is_enabled))
    .filter(i => !search || [i.name, i.area, i.description, i.cuisine_type].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'priority') return (b.custom_priority||0) - (a.custom_priority||0)
      if (sortBy === 'rating')   return (b.google_rating||0)   - (a.google_rating||0)
      if (sortBy === 'name')     return a.name.localeCompare(b.name)
      if (sortBy === 'commission') return (b.commission_percentage||0) - (a.commission_percentage||0)
      return 0
    })

  // Stats
  const enabledCount     = items.filter(i => i.is_enabled).length
  const commissionTotal  = items.filter(i => i.commission_eligible).reduce((s,i) => s + (i.commission_percentage||0), 0)
  const withRating       = items.filter(i => i.google_rating).length
  const avgRating        = withRating > 0 ? (items.reduce((s,i) => s + (i.google_rating||0), 0) / withRating).toFixed(1) : '-'

  // ── Toggle enable ────────────────────────────────────────────
  async function toggleEnabled(item) {
    await fetch('/api/local-guide', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ preference_id: item.pref_id, is_enabled: !item.is_enabled }) })
    setItems(prev => prev.map(i => i.pref_id === item.pref_id ? {...i, is_enabled: !i.is_enabled} : i))
  }

  async function togglePromoted(item) {
    await fetch('/api/local-guide', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ preference_id: item.pref_id, promoted_by_hotel: !item.promoted_by_hotel }) })
    setItems(prev => prev.map(i => i.pref_id === item.pref_id ? {...i, promoted_by_hotel: !i.promoted_by_hotel} : i))
  }

  // ── Save edits ───────────────────────────────────────────────
  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      await fetch('/api/local-guide', { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          preference_id:        editing.pref_id,
          custom_priority:      editing.custom_priority,
          custom_notes:         editing.custom_notes,
          promoted_by_hotel:    editing.promoted_by_hotel,
          commission_eligible:  editing.commission_eligible,
          commission_percentage: editing.commission_percentage,
          distance_km:          editing.distance_km || null,
          distance_min_walk:    editing.distance_min_walk || null,
        })
      })
      setItems(prev => prev.map(i => i.pref_id === editing.pref_id ? {...i, ...editing} : i))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      setEditing(null)
    } finally { setSaving(false) }
  }

  // ── Add new item ─────────────────────────────────────────────
  async function saveNew() {
    if (!newItem.name.trim()) return
    setSaving(true)
    try {
      const res  = await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ hotelId, ...newItem,
          google_rating: newItem.google_rating ? parseFloat(newItem.google_rating) : null,
          popular_item_price: newItem.popular_item_price ? parseFloat(newItem.popular_item_price) : null,
        })
      })
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      await load()
      setAdding(false)
      setNewItem(defaultNewItem())
    } finally { setSaving(false) }
  }

  // ── Enable existing global item ──────────────────────────────
  async function enableGlobal(item) {
    await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hotelId, item_id: item.id, is_enabled: true, custom_priority: 50 })
    })
    await load()
  }

  // ── Remove from hotel ────────────────────────────────────────
  async function removeItem(item) {
    if (!confirm(`Remove "${item.name}" from this hotel's guide?`)) return
    await fetch(`/api/local-guide?id=${item.pref_id}`, { method:'DELETE' })
    setItems(prev => prev.filter(i => i.pref_id !== item.pref_id))
  }

  // ── CSV/JSON Import ──────────────────────────────────────────
  function handleFileImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImportText(ev.target.result)
      parseImport(ev.target.result, file.name)
    }
    reader.readAsText(file)
  }

  function parseImport(text, filename) {
    setImportError('')
    setImportPreview([])
    try {
      let rows = []
      if (filename?.endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
        const parsed = JSON.parse(text)
        rows = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        // CSV parse
        const lines = text.split('\n').filter(Boolean)
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''))
        rows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''))
          return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']))
        })
      }
      setImportPreview(rows.slice(0, 5))
      setImportText(JSON.stringify(rows))
    } catch (e) {
      setImportError('Could not parse file: ' + e.message)
    }
  }

  async function runImport() {
    if (!importText) return
    setSaving(true)
    try {
      const rows = JSON.parse(importText)
      let success = 0
      for (const row of rows) {
        const res = await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hotelId,
            category:        row.category || 'restaurant',
            name:            row.name || '',
            area:            row.area || '',
            description:     row.description || '',
            cuisine_type:    row.cuisine_type || row.cuisine || '',
            price_range:     row.price_range || '$$',
            google_rating:   row.google_rating ? parseFloat(row.google_rating) : null,
            phone:           row.phone || '',
            booking_method:  row.booking_method || 'phone',
            popular_item:    row.popular_item || '',
            popular_item_price: row.popular_item_price ? parseFloat(row.popular_item_price) : null,
            vibe:            row.vibe || '',
            tags:            row.tags ? (Array.isArray(row.tags) ? row.tags : row.tags.split(',').map(t=>t.trim())) : [],
            google_place_id: row.google_place_id || '',
            website:         row.website || '',
            reservation_url: row.reservation_url || '',
            notes:           row.notes || '',
          })
        })
        if (res.ok) success++
      }
      alert(`Imported ${success}/${rows.length} items successfully`)
      setImporting(false); setImportText(''); setImportPreview([])
      await load()
    } catch (e) {
      setImportError('Import failed: ' + e.message)
    } finally { setSaving(false) }
  }

  // ── Inline edit form ─────────────────────────────────────────
  function EditPanel({ item, onClose }) {
    const [local, setLocal] = useState({...item})
    const inp = (label, field, type='text', placeholder='') => (
      <div>
        <label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'3px' }}>{label}</label>
        <input type={type} value={local[field]||''} placeholder={placeholder}
          onChange={e => setLocal(p=>({...p,[field]: type==='number'?e.target.value:e.target.value}))}
          style={{ width:'100%', padding:'7px 10px', border:'0.5px solid #D1D5DB', borderRadius:'7px',
            fontSize:'12px', fontFamily:font, outline:'none', boxSizing:'border-box' }} />
      </div>
    )
    return (
      <div style={{ padding:'14px 16px', background:'#F9FAFB', borderTop:'0.5px solid #E5E7EB' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'10px' }}>
          {inp('Priority (0–100)', 'custom_priority', 'number', '50')}
          {inp('Distance km', 'distance_km', 'number', '0.5')}
          {inp('Walk (minutes)', 'distance_min_walk', 'number', '10')}
        </div>
        <div style={{ marginBottom:'10px' }}>
          <label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'3px' }}>Custom notes (override bot description)</label>
          <textarea value={local.custom_notes||''} onChange={e=>setLocal(p=>({...p,custom_notes:e.target.value}))}
            placeholder="Hotel-specific note, e.g. 'Ask for the terrace table with marina view'"
            style={{ width:'100%', height:'56px', padding:'7px 10px', border:'0.5px solid #D1D5DB', borderRadius:'7px',
              fontSize:'12px', fontFamily:font, resize:'none', outline:'none', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'16px', marginBottom:'10px', flexWrap:'wrap' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:'500', color:'#374151', cursor:'pointer' }}>
            <input type="checkbox" checked={local.promoted_by_hotel||false} onChange={e=>setLocal(p=>({...p,promoted_by_hotel:e.target.checked}))} />
            ⭐ Hotel favourite
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:'500', color:'#374151', cursor:'pointer' }}>
            <input type="checkbox" checked={local.commission_eligible||false} onChange={e=>setLocal(p=>({...p,commission_eligible:e.target.checked}))} />
            💰 Commission eligible
          </label>
          {local.commission_eligible && (
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              <input type="number" min="0" max="100" value={local.commission_percentage||0}
                onChange={e=>setLocal(p=>({...p,commission_percentage:parseFloat(e.target.value)||0}))}
                style={{ width:'60px', padding:'5px 8px', border:'0.5px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:font, outline:'none' }} />
              <span style={{ fontSize:'11px', color:'#6B7280' }}>%</span>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>Cancel</button>
          <button onClick={() => { setEditing(local); saveEdit() }} style={{ padding:'7px 16px', background:GREEN, border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:font }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  // ── Add form ─────────────────────────────────────────────────
  function AddForm() {
    const [local, setLocal] = useState({...newItem})
    const inp = (label, field, type='text', placeholder='', full=false) => (
      <div style={full ? { gridColumn:'1/-1' } : {}}>
        <label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'3px' }}>{label}</label>
        <input type={type} value={local[field]||''} placeholder={placeholder}
          onChange={e => setLocal(p=>({...p,[field]:e.target.value}))}
          style={{ width:'100%', padding:'7px 10px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none', boxSizing:'border-box' }} />
      </div>
    )
    const sel = (label, field, options) => (
      <div>
        <label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'3px' }}>{label}</label>
        <select value={local[field]||''} onChange={e=>setLocal(p=>({...p,[field]:e.target.value}))}
          style={{ width:'100%', padding:'7px 10px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
          {options.map(o => <option key={o.key||o} value={o.key||o}>{o.label||o}</option>)}
        </select>
      </div>
    )
    return (
      <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'18px', marginBottom:'14px' }}>
        <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'14px' }}>Add new item</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'10px' }}>
          {sel('Category', 'category', CATEGORIES.filter(c=>c.key!=='all').map(c=>({key:c.key,label:`${c.emoji} ${c.label}`})))}
          {inp('Name *', 'name', 'text', 'e.g. Caprice Marina')}
          {inp('Area', 'area', 'text', 'e.g. Limassol Marina')}
          {inp('Cuisine / Type', 'cuisine_type', 'text', 'e.g. Mediterranean')}
          {sel('Price range', 'price_range', PRICE_RANGES.map(p=>({key:p,label:p})))}
          {sel('Vibe', 'vibe', [{key:'',label:'—'},...VIBES.map(v=>({key:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))])}
          {inp('Description', 'description', 'text', 'Short description for bot', true)}
          {inp('Signature dish / item', 'popular_item', 'text', 'e.g. Grilled sea bass')}
          {inp('Price (€)', 'popular_item_price', 'number', '35')}
          {inp('Phone', 'phone', 'tel', '+357 25 123456')}
          {sel('Booking method', 'booking_method', BOOKING_METHODS.map(b=>({key:b.key,label:b.label})))}
          {inp('Google Place ID', 'google_place_id', 'text', 'ChIJ...')}
          {inp('Google Rating', 'google_rating', 'number', '4.5')}
          {inp('Priority (0-100)', 'custom_priority', 'number', '50')}
          {inp('Distance km', 'distance_km', 'number', '0.5')}
        </div>
        <div style={{ marginBottom:'10px' }}>
          <label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'5px' }}>Tags</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
            {COMMON_TAGS.map(t => (
              <Tag key={t} label={t} active={(local.tags||[]).includes(t)}
                onClick={() => setLocal(p => ({...p, tags: (p.tags||[]).includes(t) ? p.tags.filter(x=>x!==t) : [...(p.tags||[]),t]}))} />
            ))}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'16px', marginBottom:'14px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', cursor:'pointer' }}>
            <input type="checkbox" checked={local.commission_eligible||false}
              onChange={e=>setLocal(p=>({...p,commission_eligible:e.target.checked}))} />
            💰 Commission eligible
          </label>
          {local.commission_eligible && (
            <>
              <input type="number" min="0" max="100" value={local.commission_percentage||0}
                onChange={e=>setLocal(p=>({...p,commission_percentage:parseFloat(e.target.value)||0}))}
                style={{ width:'60px', padding:'5px 8px', border:'0.5px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:font, outline:'none' }} />
              <span style={{ fontSize:'11px', color:'#6B7280' }}>%</span>
            </>
          )}
          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', cursor:'pointer' }}>
            <input type="checkbox" checked={local.promoted_by_hotel||false}
              onChange={e=>setLocal(p=>({...p,promoted_by_hotel:e.target.checked}))} />
            ⭐ Hotel favourite
          </label>
        </div>
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={()=>setAdding(false)} style={{ padding:'8px 16px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>Cancel</button>
          <button onClick={()=>{setNewItem(local);saveNew()}} disabled={!local.name.trim()||saving}
            style={{ padding:'8px 16px', background:local.name.trim()?GREEN:'#E5E7EB', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', color:local.name.trim()?'white':'#9CA3AF', cursor:local.name.trim()?'pointer':'not-allowed', fontFamily:font }}>
            {saving ? 'Adding…' : '+ Add to guide'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px', fontFamily:font }}>Loading local guide…</div>

  const catCounts = {}
  for (const i of items) { catCounts[i.category] = (catCounts[i.category]||0)+1 }

  return (
    <div style={{ fontFamily:font, maxWidth:'900px' }}>

      {/* Header stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'18px' }}>
        {[
          { label:'Total items',   value: items.length },
          { label:'Enabled',       value: enabledCount, accent:true },
          { label:'Avg rating',    value: avgRating, gold:true },
          { label:'Commission items', value: items.filter(i=>i.commission_eligible).length },
        ].map(s => (
          <div key={s.label} style={{ background:s.accent?'#F0FDF4':s.gold?'rgba(201,168,76,0.06)':'#F9FAFB', borderRadius:'10px', padding:'12px 14px', border:s.accent?'0.5px solid #86EFAC':s.gold?'0.5px solid rgba(201,168,76,0.2)':'none' }}>
            <div style={{ fontSize:'11px', color:s.accent?'#14532D':s.gold?'#78350F':'#6B7280', fontWeight:'600', marginBottom:'3px' }}>{s.label}</div>
            <div style={{ fontSize:'22px', fontWeight:'700', color:s.accent?'#14532D':s.gold?GOLD:'#111827' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Category tabs */}
      <div style={{ display:'flex', gap:'0', background:'white', border:'0.5px solid #E5E7EB', borderRadius:'10px', overflow:'hidden', marginBottom:'14px', flexWrap:'wrap' }}>
        {CATEGORIES.map(cat => {
          const count = cat.key === 'all' ? items.length : (catCounts[cat.key]||0)
          const active = catFilter === cat.key
          return (
            <button key={cat.key} onClick={()=>setCatFilter(cat.key)}
              style={{ padding:'9px 12px', fontSize:'12px', fontWeight:active?'700':'500',
                border:'none', borderBottom:active?`2px solid ${GREEN}`:'2px solid transparent',
                background:'none', color:active?GREEN:'#6B7280', cursor:'pointer', fontFamily:font,
                display:'flex', alignItems:'center', gap:'4px', whiteSpace:'nowrap' }}>
              {cat.emoji} {cat.label}
              {count > 0 && <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 5px', borderRadius:'10px',
                background:active?GREEN:'#F3F4F6', color:active?'white':'#6B7280' }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'12px', flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, area, cuisine…"
          style={{ flex:1, minWidth:'160px', padding:'8px 12px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', fontFamily:font, outline:'none' }} />

        <select value={areaFilter} onChange={e=>setAreaFilter(e.target.value)}
          style={{ padding:'8px 10px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
          <option value="">All areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={showEnabled} onChange={e=>setShowEnabled(e.target.value)}
          style={{ padding:'8px 10px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
          <option value="all">All items</option>
          <option value="enabled">Enabled only</option>
          <option value="disabled">Disabled only</option>
        </select>

        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          style={{ padding:'8px 10px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:font, outline:'none', background:'white' }}>
          <option value="priority">Sort: Priority</option>
          <option value="rating">Sort: Rating</option>
          <option value="name">Sort: Name</option>
          <option value="commission">Sort: Commission</option>
        </select>

        <button onClick={()=>setImporting(o=>!o)}
          style={{ padding:'8px 14px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font, whiteSpace:'nowrap' }}>
          📥 Import CSV/JSON
        </button>
        <button onClick={()=>setAdding(o=>!o)}
          style={{ padding:'8px 16px', background:GREEN, border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:font, whiteSpace:'nowrap' }}>
          + Add item
        </button>
      </div>

      {/* Import panel */}
      {importing && (
        <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'18px', marginBottom:'14px' }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'8px' }}>Import CSV or JSON</div>
          <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'12px' }}>
            CSV columns: <code style={{ background:'#F3F4F6', padding:'2px 6px', borderRadius:'4px' }}>name, category, area, cuisine_type, price_range, google_rating, phone, booking_method, popular_item, popular_item_price, vibe, tags, google_place_id, website, description</code>
          </div>
          <div style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
            <input type="file" ref={fileRef} accept=".csv,.json" onChange={handleFileImport} style={{ display:'none' }} />
            <button onClick={()=>fileRef.current?.click()}
              style={{ padding:'8px 16px', background:'#F9FAFB', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>
              📂 Choose file
            </button>
            <span style={{ fontSize:'12px', color:'#9CA3AF', alignSelf:'center' }}>or paste JSON below</span>
          </div>
          <textarea value={importText} onChange={e=>{setImportText(e.target.value);parseImport(e.target.value,'import.json')}}
            placeholder='[{"name":"Caprice","category":"restaurant","area":"Marina","google_rating":4.7}]'
            style={{ width:'100%', height:'80px', padding:'10px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:'monospace', resize:'vertical', outline:'none', boxSizing:'border-box' }} />
          {importError && <div style={{ color:'#DC2626', fontSize:'12px', marginTop:'6px' }}>{importError}</div>}
          {importPreview.length > 0 && (
            <div style={{ marginTop:'10px' }}>
              <div style={{ fontSize:'11px', fontWeight:'700', color:'#6B7280', marginBottom:'6px' }}>Preview ({importPreview.length} of {JSON.parse(importText||'[]').length} rows)</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {importPreview.map((row, i) => (
                  <div key={i} style={{ fontSize:'11px', color:'#374151', padding:'4px 8px', background:'#F9FAFB', borderRadius:'6px' }}>
                    {row.name} · {row.category} · {row.area} · {row.google_rating}★
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'12px' }}>
            <button onClick={()=>{setImporting(false);setImportText('');setImportPreview([])}}
              style={{ padding:'7px 14px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>Cancel</button>
            <button onClick={runImport} disabled={!importText||saving}
              style={{ padding:'7px 14px', background:importText?GREEN:'#E5E7EB', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', color:importText?'white':'#9CA3AF', cursor:importText?'pointer':'not-allowed', fontFamily:font }}>
              {saving ? 'Importing…' : `Import ${importPreview.length > 0 ? JSON.parse(importText||'[]').length + ' items' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Add form */}
      {adding && <AddForm />}

      {/* Global items not yet added */}
      {available.length > 0 && catFilter !== 'all' && (
        <div style={{ marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:'700', color:'#6B7280', marginBottom:'8px' }}>
            Available global items not yet in your guide ({available.filter(i=>catFilter==='all'||i.category===catFilter).length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            {available.filter(i=>catFilter==='all'||i.category===catFilter).slice(0,5).map(item => (
              <div key={item.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#F9FAFB', borderRadius:'8px', border:'0.5px solid #E5E7EB' }}>
                <span style={{ fontSize:'13px' }}>{CATEGORIES.find(c=>c.key===item.category)?.emoji||'📍'}</span>
                <div style={{ flex:1, fontSize:'13px', color:'#374151' }}>
                  {item.name} {item.area ? `· ${item.area}` : ''} {item.google_rating ? `· ${item.google_rating}★` : ''}
                </div>
                <button onClick={()=>enableGlobal(item)}
                  style={{ padding:'5px 12px', background:'white', border:'0.5px solid #86EFAC', borderRadius:'7px', fontSize:'11px', fontWeight:'600', color:'#14532D', cursor:'pointer', fontFamily:font }}>
                  + Enable
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main table */}
      <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'8px' }}>
        Showing {filtered.length} of {items.length} items
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'13px', background:'white', borderRadius:'12px', border:'0.5px solid #E5E7EB' }}>
          No items found. Add your first item or adjust filters.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {filtered.map(item => {
            const cat     = CATEGORIES.find(c=>c.key===item.category) || CATEGORIES[CATEGORIES.length-1]
            const isEdit  = editing?.pref_id === item.pref_id
            return (
              <div key={item.pref_id} style={{ background:'white', border:`0.5px solid ${item.is_enabled?'#E5E7EB':'#F3F4F6'}`, borderRadius:'12px', overflow:'hidden', opacity:item.is_enabled?1:0.65 }}>

                {/* Main row */}
                <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px' }}>

                  {/* Enable toggle */}
                  <button onClick={()=>toggleEnabled(item)} title={item.is_enabled?'Disable':'Enable'}
                    style={{ width:'36px', height:'20px', borderRadius:'10px', border:'none', cursor:'pointer', flexShrink:0, position:'relative', background:item.is_enabled?'#16A34A':'#D1D5DB', transition:'background .2s' }}>
                    <div style={{ position:'absolute', top:'2px', left:item.is_enabled?'18px':'2px', width:'16px', height:'16px', borderRadius:'50%', background:'white', transition:'left .2s' }}/>
                  </button>

                  {/* Category emoji */}
                  <span style={{ fontSize:'18px', flexShrink:0 }}>{cat.emoji}</span>

                  {/* Name + area */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'2px' }}>
                      <span style={{ fontSize:'13px', fontWeight:'700', color:'#111827' }}>{item.name}</span>
                      {item.promoted_by_hotel && <span style={{ fontSize:'10px', fontWeight:'700', padding:'1px 6px', borderRadius:'20px', background:GOLD+'22', color:'#78350F' }}>⭐ Favourite</span>}
                      {item.commission_eligible && <CommissionBadge pct={item.commission_percentage} />}
                      <span style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'20px', background:'#F3F4F6', color:'#6B7280' }}>{item.price_range||''}</span>
                    </div>
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                      {item.area && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>📍 {item.area}</span>}
                      {item.cuisine_type && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{item.cuisine_type}</span>}
                      {item.distance_min_walk && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>🚶 {item.distance_min_walk}min</span>}
                      {item.distance_km && !item.distance_min_walk && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>📏 {item.distance_km}km</span>}
                      <StarRating rating={item.google_rating} />
                    </div>
                  </div>

                  {/* Popular item */}
                  {item.popular_item && (
                    <div style={{ display:'none', maxWidth:'160px', fontSize:'11px', color:'#6B7280', '@media(min-width:900px)':{display:'block'} }}>
                      🍴 {item.popular_item} {item.popular_item_price?`€${item.popular_item_price}`:''}
                    </div>
                  )}

                  {/* Priority badge */}
                  <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#F9FAFB', border:'0.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:'#6B7280', flexShrink:0 }}>
                    {item.custom_priority||0}
                  </div>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                    <button onClick={()=>togglePromoted(item)} title="Toggle hotel favourite"
                      style={{ padding:'5px 8px', background:item.promoted_by_hotel?GOLD+'22':'white', border:`0.5px solid ${item.promoted_by_hotel?GOLD:'#D1D5DB'}`, borderRadius:'7px', fontSize:'12px', cursor:'pointer' }}>⭐</button>
                    <button onClick={()=>setEditing(isEdit?null:item)}
                      style={{ padding:'5px 10px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'11px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>
                      {isEdit ? 'Close' : 'Edit'}
                    </button>
                    <button onClick={()=>removeItem(item)}
                      style={{ padding:'5px 10px', background:'white', border:'0.5px solid #FCA5A5', borderRadius:'7px', fontSize:'11px', fontWeight:'600', color:'#DC2626', cursor:'pointer', fontFamily:font }}>
                      Remove
                    </button>
                  </div>
                </div>

                {/* Description row */}
                {(item.description || item.custom_notes || item.booking_method) && (
                  <div style={{ padding:'0 14px 10px 72px', fontSize:'11px', color:'#6B7280', display:'flex', gap:'12px', flexWrap:'wrap' }}>
                    {item.custom_notes && <span style={{ color:'#374151' }}>📝 {item.custom_notes}</span>}
                    {item.description && !item.custom_notes && <span>{item.description}</span>}
                    {item.booking_method && item.booking_method !== 'none' && (
                      <span style={{ color:'#2563EB' }}>
                        {item.booking_method==='partner'?'📲 Via partner':item.booking_method==='phone'?`📞 ${item.phone||'Call'}`:item.booking_method==='walkin'?'🚶 Walk-in':'🔗 Book online'}
                      </span>
                    )}
                    {(item.tags||[]).slice(0,4).map(t=>(
                      <span key={t} style={{ padding:'1px 7px', borderRadius:'20px', background:'#F3F4F6', color:'#6B7280', fontSize:'10px' }}>{t}</span>
                    ))}
                  </div>
                )}

                {/* Edit panel */}
                {isEdit && <EditPanel item={editing||item} onClose={()=>setEditing(null)} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
