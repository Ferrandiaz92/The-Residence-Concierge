// components/LocalGuideManager.js — desktop only, full-width table view
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
  { key:'partner', label:'Via partner' },
  { key:'phone',   label:'Phone' },
  { key:'link',    label:'Booking link' },
  { key:'walkin',  label:'Walk-in' },
  { key:'none',    label:'Not bookable' },
]

const PRICE_RANGES  = ['$','$$','$$$','$$$$']
const VIBES         = ['romantic','family','business','lively','relaxed','adventurous','cultural']
const COMMON_TAGS   = ['sea_view','outdoor','vegetarian','vegan','halal','kosher','late_night','live_music','pet_friendly','wheelchair','parking','instagram_worthy']
const GREEN = '#1C3D2E'
const font  = "'DM Sans',sans-serif"

function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} style={{ width:'36px', height:'20px', borderRadius:'10px', border:'none',
      cursor:'pointer', flexShrink:0, position:'relative',
      background: on ? '#16A34A' : '#D1D5DB', transition:'background .2s' }}>
      <div style={{ position:'absolute', top:'2px', left: on ? '18px' : '2px', width:'16px', height:'16px',
        borderRadius:'50%', background:'white', transition:'left .2s' }}/>
    </button>
  )
}

function Stars({ rating }) {
  if (!rating) return <span style={{ color:'#D1D5DB', fontSize:'11px' }}>—</span>
  return <span style={{ color:'#F59E0B', fontSize:'12px', fontWeight:'600' }}>{rating.toFixed(1)} ★</span>
}

export default function LocalGuideManager({ hotelId }) {
  const [items, setItems]           = useState([])
  const [available, setAvailable]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [catFilter, setCatFilter]   = useState('all')
  const [areaFilter, setAreaFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [showEnabled, setShowEnabled] = useState('all')
  const [sortBy, setSortBy]         = useState('priority')
  const [editRow, setEditRow]       = useState(null)   // pref_id being edited inline
  const [editData, setEditData]     = useState({})
  const [adding, setAdding]         = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState([])
  const [importError, setImportError]     = useState('')
  const [saving, setSaving]         = useState(false)
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

  const areas = [...new Set(items.map(i => i.area).filter(Boolean))].sort()

  const filtered = items
    .filter(i => catFilter === 'all' || i.category === catFilter)
    .filter(i => !areaFilter || i.area === areaFilter)
    .filter(i => showEnabled === 'all' || (showEnabled === 'enabled' ? i.is_enabled : !i.is_enabled))
    .filter(i => !search || [i.name,i.area,i.description,i.cuisine_type].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      if (sortBy==='priority') return (b.custom_priority||0)-(a.custom_priority||0)
      if (sortBy==='rating')   return (b.google_rating||0)-(a.google_rating||0)
      if (sortBy==='name')     return a.name.localeCompare(b.name)
      if (sortBy==='commission') return (b.commission_percentage||0)-(a.commission_percentage||0)
      return 0
    })

  const catCounts = {}
  for (const i of items) catCounts[i.category] = (catCounts[i.category]||0)+1

  async function patch(prefId, updates) {
    await fetch('/api/local-guide', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ preference_id: prefId, ...updates }) })
    setItems(prev => prev.map(i => i.pref_id === prefId ? {...i,...updates} : i))
  }

  async function saveEdit() {
    setSaving(true)
    try {
      await patch(editData.pref_id, {
        custom_priority: editData.custom_priority,
        custom_notes: editData.custom_notes,
        promoted_by_hotel: editData.promoted_by_hotel,
        commission_eligible: editData.commission_eligible,
        commission_percentage: editData.commission_percentage,
        distance_km: editData.distance_km || null,
        distance_min_walk: editData.distance_min_walk || null,
      })
      setEditRow(null)
    } finally { setSaving(false) }
  }

  async function saveNew() {
    if (!newRow.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ hotelId, ...newRow,
          google_rating: newRow.google_rating ? parseFloat(newRow.google_rating) : null,
          popular_item_price: newRow.popular_item_price ? parseFloat(newRow.popular_item_price) : null,
          distance_km: newRow.distance_km ? parseFloat(newRow.distance_km) : null,
          distance_min_walk: newRow.distance_min_walk ? parseInt(newRow.distance_min_walk) : null,
        })
      })
      if (res.ok) { await load(); setAdding(false); setNewRow(blank()) }
    } finally { setSaving(false) }
  }

  async function removeItem(item) {
    if (!confirm(`Remove "${item.name}" from this hotel's guide?`)) return
    await fetch(`/api/local-guide?id=${item.pref_id}`, { method:'DELETE' })
    setItems(prev => prev.filter(i => i.pref_id !== item.pref_id))
  }

  async function enableGlobal(item) {
    await fetch('/api/local-guide', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hotelId, item_id: item.id, is_enabled:true, custom_priority:50 }) })
    await load()
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
          return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']))
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

  // ── Inline edit expanded row ───────────────────────────────────
  function EditExpanded({ item }) {
    const [d, setD] = useState({...item})
    const inp = (label, field, type='text', placeholder='') => (
      <div>
        <div style={{ fontSize:'10px', fontWeight:'600', color:'#9CA3AF', marginBottom:'2px' }}>{label}</div>
        <input type={type} value={d[field]||''} placeholder={placeholder}
          onChange={e=>setD(p=>({...p,[field]:e.target.value}))}
          style={{ width:'100%', padding:'5px 8px', border:'0.5px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:font, outline:'none', boxSizing:'border-box' }} />
      </div>
    )
    return (
      <tr style={{ background:'#F0FDF4' }}>
        <td colSpan={12} style={{ padding:'14px 16px', borderBottom:'0.5px solid #E5E7EB' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'10px', marginBottom:'10px' }}>
            {inp('Priority (0–100)', 'custom_priority', 'number', '50')}
            {inp('Distance km', 'distance_km', 'number', '0.5')}
            {inp('Walk (min)', 'distance_min_walk', 'number', '10')}
            {inp('Commission %', 'commission_percentage', 'number', '10')}
            <div>
              <div style={{ fontSize:'10px', fontWeight:'600', color:'#9CA3AF', marginBottom:'6px' }}>Flags</div>
              <div style={{ display:'flex', gap:'10px' }}>
                <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', cursor:'pointer' }}>
                  <input type="checkbox" checked={d.promoted_by_hotel||false} onChange={e=>setD(p=>({...p,promoted_by_hotel:e.target.checked}))} />
                  ⭐ Favourite
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', cursor:'pointer' }}>
                  <input type="checkbox" checked={d.commission_eligible||false} onChange={e=>setD(p=>({...p,commission_eligible:e.target.checked}))} />
                  💰 Commission
                </label>
              </div>
            </div>
          </div>
          <div style={{ marginBottom:'10px' }}>
            <div style={{ fontSize:'10px', fontWeight:'600', color:'#9CA3AF', marginBottom:'2px' }}>Custom note (shown to bot instead of description)</div>
            <input value={d.custom_notes||''} onChange={e=>setD(p=>({...p,custom_notes:e.target.value}))}
              placeholder="e.g. Ask for the terrace table — much better than inside"
              style={{ width:'100%', padding:'6px 10px', border:'0.5px solid #D1D5DB', borderRadius:'6px', fontSize:'12px', fontFamily:font, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
            <button onClick={()=>setEditRow(null)} style={{ padding:'6px 14px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font }}>Cancel</button>
            <button onClick={()=>{setEditData(d);saveEdit()}} style={{ padding:'6px 14px', background:GREEN, border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:font }}>
              {saving?'Saving…':'Save'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  // ── Add row (inline at top of table) ──────────────────────────
  function AddRow() {
    const [d, setD] = useState({...newRow})
    const tc = (field, placeholder, width='100%', type='text') => (
      <input type={type} value={d[field]||''} placeholder={placeholder}
        onChange={e=>setD(p=>({...p,[field]:e.target.value}))}
        style={{ width, padding:'5px 7px', border:'0.5px solid #93C5FD', borderRadius:'5px', fontSize:'11px', fontFamily:font, outline:'none', boxSizing:'border-box', background:'#EFF6FF' }} />
    )
    const sel = (field, opts) => (
      <select value={d[field]||''} onChange={e=>setD(p=>({...p,[field]:e.target.value}))}
        style={{ width:'100%', padding:'5px 6px', border:'0.5px solid #93C5FD', borderRadius:'5px', fontSize:'11px', fontFamily:font, outline:'none', background:'#EFF6FF' }}>
        {opts.map(o=><option key={o.key||o} value={o.key||o}>{o.label||o}</option>)}
      </select>
    )
    return (
      <tr style={{ background:'#EFF6FF' }}>
        <td style={{ padding:'6px 8px' }}><div style={{ width:'36px' }}/></td>
        <td style={{ padding:'4px 6px' }}>{sel('category', CATEGORIES.filter(c=>c.key!=='all').map(c=>({key:c.key,label:`${c.emoji} ${c.label}`})))}</td>
        <td style={{ padding:'4px 6px' }}>{tc('name','Name *')}</td>
        <td style={{ padding:'4px 6px' }}>{tc('area','Area')}</td>
        <td style={{ padding:'4px 6px' }}>{tc('cuisine_type','Cuisine/type')}</td>
        <td style={{ padding:'4px 6px' }}>{sel('price_range', PRICE_RANGES.map(p=>({key:p,label:p})))}</td>
        <td style={{ padding:'4px 6px' }}>{tc('google_rating','4.5','80px','number')}</td>
        <td style={{ padding:'4px 6px' }}>{tc('phone','+357...')}</td>
        <td style={{ padding:'4px 6px' }}>{tc('popular_item','Signature item')}</td>
        <td style={{ padding:'4px 6px' }}>{tc('distance_min_walk','min','60px','number')}</td>
        <td style={{ padding:'4px 6px' }}>{sel('booking_method', BOOKING_METHODS.map(b=>({key:b.key,label:b.label})))}</td>
        <td style={{ padding:'4px 8px' }}>
          <div style={{ display:'flex', gap:'5px' }}>
            <button onClick={()=>{setNewRow(d);saveNew()}} disabled={!d.name.trim()||saving}
              style={{ padding:'5px 10px', background:d.name.trim()?GREEN:'#E5E7EB', border:'none', borderRadius:'6px', fontSize:'11px', fontWeight:'700', color:d.name.trim()?'white':'#9CA3AF', cursor:d.name.trim()?'pointer':'not-allowed', fontFamily:font, whiteSpace:'nowrap' }}>
              {saving?'…':'+ Add'}
            </button>
            <button onClick={()=>setAdding(false)} style={{ padding:'5px 8px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'6px', fontSize:'11px', color:'#9CA3AF', cursor:'pointer', fontFamily:font }}>✕</button>
          </div>
        </td>
      </tr>
    )
  }

  const th = (label, field) => (
    <th onClick={()=>setSortBy(field)} style={{ padding:'8px 10px', fontSize:'11px', fontWeight:'700',
      color: sortBy===field ? GREEN : '#6B7280', textAlign:'left', whiteSpace:'nowrap',
      cursor:'pointer', userSelect:'none', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB' }}>
      {label}{sortBy===field?' ↓':''}
    </th>
  )

  return (
    <div style={{ fontFamily:font, height:'100%', display:'flex', flexDirection:'column' }}>

      {/* Intro banner */}
      <div style={{ padding:'12px 16px', background:'#FFFBEB', borderBottom:'0.5px solid #FDE68A', fontSize:'12px', color:'#78350F', flexShrink:0 }}>
        📋 This is your hotel's <strong>Local Guide</strong> — every place you recommend to guests.
        The bot uses this to answer "where should I eat?" or "what's there to do?".
        You can <strong>import rows from a CSV or JSON file</strong> with columns:
        <code style={{ marginLeft:'6px', background:'#FEF3C7', padding:'1px 6px', borderRadius:'4px', fontFamily:'monospace', fontSize:'11px' }}>name, category, area, cuisine_type, price_range, google_rating, phone, booking_method, popular_item, vibe, description, google_place_id</code>
      </div>

      {/* Category + filter bar */}
      <div style={{ padding:'10px 16px', background:'white', borderBottom:'0.5px solid #E5E7EB', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', flexShrink:0 }}>

        {/* Category pills */}
        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', flex:1 }}>
          {CATEGORIES.map(cat => {
            const count = cat.key==='all' ? items.length : (catCounts[cat.key]||0)
            const active = catFilter === cat.key
            return (
              <button key={cat.key} onClick={()=>setCatFilter(cat.key)}
                style={{ padding:'5px 11px', borderRadius:'20px', fontSize:'12px', fontWeight:'600',
                  border:`0.5px solid ${active?GREEN:'#E5E7EB'}`,
                  background:active?GREEN:'white', color:active?'white':'#374151',
                  cursor:'pointer', fontFamily:font, display:'flex', alignItems:'center', gap:'4px', whiteSpace:'nowrap' }}>
                {cat.emoji} {cat.label}
                {count>0&&<span style={{ fontSize:'10px', opacity:0.8 }}>({count})</span>}
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:'6px', alignItems:'center', flexShrink:0 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            style={{ width:'140px', padding:'6px 10px', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontFamily:font, outline:'none' }} />
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
          <button onClick={()=>setImporting(o=>!o)}
            style={{ padding:'6px 12px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:font, whiteSpace:'nowrap' }}>
            📥 Import
          </button>
          <button onClick={()=>setAdding(o=>!o)}
            style={{ padding:'6px 14px', background:GREEN, border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:font, whiteSpace:'nowrap' }}>
            + Add row
          </button>
        </div>
      </div>

      {/* Import panel */}
      {importing && (
        <div style={{ padding:'14px 16px', background:'#F0F9FF', borderBottom:'0.5px solid #BAE6FD', flexShrink:0 }}>
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <input type="file" ref={fileRef} accept=".csv,.json" onChange={e=>{
                const f=e.target.files?.[0]; if(!f) return
                const r=new FileReader(); r.onload=ev=>parseImport(ev.target.result,f.name); r.readAsText(f)
              }} style={{ display:'none' }} />
              <textarea value={importText} onChange={e=>{setImportText(e.target.value);parseImport(e.target.value)}}
                placeholder='Paste CSV or JSON here, or use "Choose file" →'
                style={{ width:'100%', height:'60px', padding:'8px', border:'0.5px solid #BAE6FD', borderRadius:'7px', fontSize:'11px', fontFamily:'monospace', resize:'none', outline:'none', boxSizing:'border-box' }} />
              {importError && <div style={{ color:'#DC2626', fontSize:'11px', marginTop:'4px' }}>{importError}</div>}
              {importPreview.length > 0 && (
                <div style={{ fontSize:'11px', color:'#374151', marginTop:'6px' }}>
                  Preview: {importPreview.map((r,i)=><span key={i} style={{ marginRight:'12px' }}>{r.name} ({r.category})</span>)}
                  {JSON.parse(importText||'[]').length > 3 && <span style={{ color:'#9CA3AF' }}>+{JSON.parse(importText).length-3} more</span>}
                </div>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', flexShrink:0 }}>
              <button onClick={()=>fileRef.current?.click()} style={{ padding:'7px 12px', background:'white', border:'0.5px solid #BAE6FD', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'#0369A1', cursor:'pointer', fontFamily:font }}>📂 File</button>
              <button onClick={runImport} disabled={!importText||saving} style={{ padding:'7px 12px', background:importText?'#0369A1':'#E5E7EB', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', color:importText?'white':'#9CA3AF', cursor:importText?'pointer':'not-allowed', fontFamily:font }}>
                {saving?'…':'Import'}
              </button>
              <button onClick={()=>{setImporting(false);setImportText('');setImportPreview([])}} style={{ padding:'7px 12px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'12px', color:'#9CA3AF', cursor:'pointer', fontFamily:font }}>Cancel</button>
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
            <thead style={{ position:'sticky', top:0, zIndex:10 }}>
              <tr>
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280', width:'52px' }}>On</th>
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280' }}>Cat.</th>
                {th('Name','name')}
                {th('Area','name')}
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280' }}>Cuisine / Type</th>
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280' }}>Price</th>
                {th('Rating','rating')}
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280' }}>Phone</th>
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280' }}>Signature dish</th>
                {th('Walk','priority')}
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280' }}>Booking</th>
                <th style={{ padding:'8px 10px', textAlign:'left', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', fontSize:'11px', fontWeight:'700', color:'#6B7280', width:'120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adding && <AddRow />}
              {filtered.length === 0 && !adding && (
                <tr><td colSpan={12} style={{ padding:'40px', textAlign:'center', color:'#9CA3AF' }}>No items. Add your first or use Import.</td></tr>
              )}
              {filtered.map(item => {
                const cat    = CATEGORIES.find(c=>c.key===item.category)||CATEGORIES[CATEGORIES.length-1]
                const isEdit = editRow === item.pref_id
                return (
                  <>
                    <tr key={item.pref_id} style={{ background:isEdit?'#F0FDF4':item.is_enabled?'white':'#FAFAFA', borderBottom:'0.5px solid #F3F4F6',
                      opacity:item.is_enabled?1:0.55 }}
                      onMouseEnter={e=>{ if(!isEdit) e.currentTarget.style.background='#F9FAFB' }}
                      onMouseLeave={e=>{ if(!isEdit) e.currentTarget.style.background=item.is_enabled?'white':'#FAFAFA' }}>
                      <td style={{ padding:'7px 10px' }}>
                        <Toggle on={item.is_enabled} onChange={()=>patch(item.pref_id,{is_enabled:!item.is_enabled})} />
                      </td>
                      <td style={{ padding:'7px 8px', fontSize:'16px' }} title={cat.label}>{cat.emoji}</td>
                      <td style={{ padding:'7px 10px', fontWeight:'600', color:'#111827', whiteSpace:'nowrap' }}>
                        {item.promoted_by_hotel && <span title="Hotel favourite" style={{ marginRight:'4px' }}>⭐</span>}
                        {item.name}
                        {item.commission_eligible && <span style={{ marginLeft:'5px', fontSize:'10px', fontWeight:'700', padding:'1px 5px', borderRadius:'10px', background:'#DCFCE7', color:'#14532D' }}>{item.commission_percentage}%</span>}
                      </td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', whiteSpace:'nowrap' }}>{item.area||'—'}</td>
                      <td style={{ padding:'7px 10px', color:'#6B7280' }}>{item.cuisine_type||'—'}</td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', whiteSpace:'nowrap' }}>{item.price_range||'—'}</td>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}><Stars rating={item.google_rating}/></td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', whiteSpace:'nowrap' }}>{item.phone||'—'}</td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.popular_item||'—'}</td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', whiteSpace:'nowrap' }}>{item.distance_min_walk?`${item.distance_min_walk}min`:item.distance_km?`${item.distance_km}km`:'—'}</td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', whiteSpace:'nowrap' }}>
                        {item.booking_method==='partner'?'📲':item.booking_method==='phone'?'📞':item.booking_method==='walkin'?'🚶':item.booking_method==='link'?'🔗':'—'}
                        {' '}{BOOKING_METHODS.find(b=>b.key===item.booking_method)?.label||'—'}
                      </td>
                      <td style={{ padding:'7px 8px' }}>
                        <div style={{ display:'flex', gap:'4px' }}>
                          <button onClick={()=>{ setEditRow(isEdit?null:item.pref_id); setEditData({...item}) }}
                            style={{ padding:'4px 10px', background:isEdit?GREEN:'white', border:`0.5px solid ${isEdit?GREEN:'#D1D5DB'}`, borderRadius:'6px', fontSize:'11px', fontWeight:'600', color:isEdit?'white':'#374151', cursor:'pointer', fontFamily:font }}>
                            {isEdit?'Close':'Edit'}
                          </button>
                          <button onClick={()=>removeItem(item)}
                            style={{ padding:'4px 8px', background:'white', border:'0.5px solid #FCA5A5', borderRadius:'6px', fontSize:'11px', fontWeight:'600', color:'#DC2626', cursor:'pointer', fontFamily:font }}>✕</button>
                        </div>
                      </td>
                    </tr>
                    {isEdit && <EditExpanded key={item.pref_id+'_edit'} item={editData} />}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div style={{ padding:'6px 16px', background:'#F9FAFB', borderTop:'0.5px solid #E5E7EB', fontSize:'11px', color:'#9CA3AF', display:'flex', gap:'16px', flexShrink:0 }}>
        <span>{filtered.length} of {items.length} items shown</span>
        <span>{items.filter(i=>i.is_enabled).length} enabled</span>
        <span>{items.filter(i=>i.commission_eligible).length} commission-eligible</span>
        <span>Sorted by {sortBy}</span>
      </div>
    </div>
  )
}
