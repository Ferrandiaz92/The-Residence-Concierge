// components/ProductsManager.js
// Partner products & services the bot can offer to guests
// Works for any type: events, tours, transport, dining, spa, etc.

'use client'
import { useState, useEffect } from 'react'

const CATEGORIES = [
  { key:'event',     label:'Event',      icon:'🎤' },
  { key:'activity',  label:'Activity',   icon:'🚤' },
  { key:'dining',    label:'Dining',     icon:'🍽️' },
  { key:'transport', label:'Transport',  icon:'🚗' },
  { key:'wellness',  label:'Wellness',   icon:'💆' },
  { key:'other',     label:'Other',      icon:'✨' },
]

const S = {
  label: {
    fontSize:'11px', fontWeight:'600', color:'#6B7280',
    marginBottom:'5px', display:'block', textTransform:'uppercase', letterSpacing:'0.04em',
  },
  input: {
    width:'100%', padding:'10px 12px', border:'1px solid #E5E7EB',
    borderRadius:'9px', fontSize:'14px', fontFamily:"'DM Sans',sans-serif",
    outline:'none', color:'#111827', background:'white', boxSizing:'border-box',
  },
  textarea: {
    width:'100%', padding:'10px 12px', border:'1px solid #E5E7EB',
    borderRadius:'9px', fontSize:'14px', fontFamily:"'DM Sans',sans-serif",
    outline:'none', color:'#111827', resize:'vertical', lineHeight:'1.6',
    minHeight:'160px', boxSizing:'border-box',
  },
  select: {
    width:'100%', padding:'10px 12px', border:'1px solid #E5E7EB',
    borderRadius:'9px', fontSize:'14px', fontFamily:"'DM Sans',sans-serif",
    outline:'none', color:'#111827', background:'white', boxSizing:'border-box',
  },
  section: {
    display:'flex', flexDirection:'column', gap:'5px',
  },
  divider: {
    borderTop:'1px solid #F3F4F6', margin:'4px 0',
  },
  sectionTitle: {
    fontSize:'12px', fontWeight:'700', color:'#374151',
    marginBottom:'2px', marginTop:'4px',
  },
}

// ── PRICING TIERS ─────────────────────────────────────────
// Each tier is just: name + price. Simple.
function TierEditor({ tiers, onChange }) {
  function update(i, field, value) {
    onChange(tiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }
  function add()       { onChange([...tiers, { name:'', price:'' }]) }
  function remove(i)   { onChange(tiers.filter((_, idx) => idx !== i)) }

  return (
    <div style={S.section}>
      <label style={S.label}>Pricing options</label>
      <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'8px' }}>
        Add one price or multiple options (e.g. Adult / Child, VIP / General, Half day / Full day)
      </div>

      {tiers.map((tier, i) => (
        <div key={i} style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'6px' }}>
          {/* Name */}
          <input
            value={tier.name||''}
            onChange={e => update(i, 'name', e.target.value)}
            placeholder={tiers.length === 1 ? 'Per person / group…' : `Option ${i+1}`}
            style={{ ...S.input, flex:2, padding:'10px 10px', fontSize:'13px' }}
          />
          {/* Price */}
          <div style={{ position:'relative', flex:1 }}>
            <span style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', fontSize:'14px', color:'#6B7280', pointerEvents:'none' }}>€</span>
            <input
              type="number"
              value={tier.price||''}
              onChange={e => update(i, 'price', e.target.value)}
              placeholder="0"
              min="0"
              step="0.50"
              style={{ ...S.input, paddingLeft:'26px', fontSize:'13px' }}
            />
          </div>
          {/* Remove */}
          {tiers.length > 1 && (
            <button onClick={() => remove(i)}
              style={{ width:'34px', height:'40px', borderRadius:'9px', background:'none', border:'1px solid #FCA5A5', color:'#DC2626', cursor:'pointer', fontSize:'18px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ×
            </button>
          )}
        </div>
      ))}

      {tiers.length < 4 && (
        <button onClick={add}
          style={{ fontSize:'13px', fontWeight:'600', color:'#1C3D2E', background:'none', border:'1px dashed #D1D5DB', borderRadius:'9px', cursor:'pointer', padding:'8px', fontFamily:"'DM Sans',sans-serif", width:'100%', marginTop:'2px' }}>
          + Add another price option
        </button>
      )}
    </div>
  )
}

// ── PRODUCT FORM ──────────────────────────────────────────
function ProductForm({ product, partners, hotelId, onSave, onCancel }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState({
    partnerId:      product?.partner_id      || (partners[0]?.id || ''),
    name:           product?.name            || '',
    description:    product?.description     || '',
    category:       product?.category        || 'activity',
    tiers:          product?.tiers?.length   ? product.tiers : [{ name:'', price:'' }],
    commissionRate: product?.commission_rate || 15,
    availableFrom:  product?.available_from  || '',
    availableTo:    product?.available_to    || '',
    availableTimes: product?.available_times || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function save() {
    if (!form.name.trim())   { setError('Name is required'); return }
    if (!form.partnerId)     { setError('Select a partner'); return }
    const validTiers = form.tiers.filter(t => t.name?.trim() && parseFloat(t.price) > 0)
    if (validTiers.length === 0) { setError('Add at least one pricing option with a name and price'); return }

    setSaving(true); setError('')
    try {
      const method = isEdit ? 'PATCH' : 'POST'
      const body   = isEdit
        ? { id: product.id, ...form, tiers: validTiers }
        : { hotelId, ...form, tiers: validTiers, maxPerGuest: undefined }
      const res    = await fetch('/api/products', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const data   = await res.json()
      if (data.error) { setError(data.error); return }
      onSave()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ background:'white', borderRadius:'12px', border:'1px solid #E5E7EB', padding:'20px', display:'flex', flexDirection:'column', gap:'18px' }}>

      {/* Header */}
      <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827' }}>
        {isEdit ? 'Edit product / service' : 'Add product or service'}
      </div>

      {/* ── BASIC INFO ── */}
      <div style={S.section}>
        <label style={S.label}>Partner</label>
        <select value={form.partnerId} onChange={e => set('partnerId', e.target.value)} style={S.select}>
          <option value="">Select partner…</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={S.section}>
        <label style={S.label}>Name *</label>
        <input
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Sunset Boat Tour, Airport Transfer, Couple Massage…"
          style={S.input}
        />
      </div>

      <div style={S.section}>
        <label style={S.label}>Description <span style={{ color:'#9CA3AF', fontWeight:'400', textTransform:'none' }}>— what the bot tells the guest</span></label>
        <textarea
          value={form.description||''}
          onChange={e => set('description', e.target.value)}
          placeholder="Describe what's included, how long it lasts, meeting point, what to bring… The bot will use this to answer guest questions."
          style={{ ...S.textarea, fontSize:'13px' }}
        />
      </div>

      {/* ── TYPE ── */}
      <div style={S.section}>
        <label style={S.label}>Type</label>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => set('category', c.key)}
              style={{ padding:'7px 13px', borderRadius:'20px', fontSize:'13px', fontWeight:'500', border:'1px solid', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all .1s',
                borderColor: form.category===c.key ? '#1C3D2E' : '#E5E7EB',
                background:  form.category===c.key ? '#1C3D2E' : 'white',
                color:       form.category===c.key ? 'white'   : '#374151',
              }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.divider}/>

      {/* ── PRICING ── */}
      <TierEditor tiers={form.tiers} onChange={v => set('tiers', v)} />

      <div style={S.section}>
        <label style={S.label}>Our commission (%)</label>
        <input
          type="number" value={form.commissionRate}
          onChange={e => set('commissionRate', parseFloat(e.target.value)||0)}
          min="0" max="100" step="0.5"
          style={{ ...S.input, maxWidth:'160px' }}
        />
      </div>

      <div style={S.divider}/>

      {/* ── AVAILABILITY ── */}
      <div style={{ ...S.section }}>
        <span style={S.sectionTitle}>Availability</span>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div style={S.section}>
            <label style={S.label}>From date</label>
            <input type="date" value={form.availableFrom||''} onChange={e => set('availableFrom', e.target.value)} style={S.input} />
          </div>
          <div style={S.section}>
            <label style={S.label}>Until date</label>
            <input type="date" value={form.availableTo||''} onChange={e => set('availableTo', e.target.value)} style={S.input} />
          </div>
        </div>

        <div style={{ ...S.section, marginTop:'8px' }}>
          <label style={S.label}>Time / schedule</label>
          <input
            value={form.availableTimes||''}
            onChange={e => set('availableTimes', e.target.value)}
            placeholder="e.g. Daily 09:00, On request…"
            style={{ ...S.input, fontSize:'13px' }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize:'13px', color:'#DC2626', padding:'10px 12px', background:'#FEF2F2', borderRadius:'8px' }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'4px' }}>
        <button onClick={onCancel}
          style={{ padding:'10px 18px', background:'white', border:'1px solid #E5E7EB', borderRadius:'9px', fontSize:'13px', fontWeight:'500', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          style={{ padding:'10px 22px', background:'#1C3D2E', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity: saving?0.7:1 }}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add'}
        </button>
      </div>
    </div>
  )
}

// ── PRODUCT CARD ──────────────────────────────────────────
function ProductCard({ p, onEdit, onToggle }) {
  const today  = new Date().toISOString().split('T')[0]
  const tiers  = p.tiers || []
  const cat    = CATEGORIES.find(c => c.key === p.category)

  function status() {
    if (!p.active)                                  return { label:'Inactive',  color:'#9CA3AF', bg:'#F3F4F6' }
    if (p.available_to   && p.available_to < today) return { label:'Expired',   color:'#DC2626', bg:'#FEF2F2' }
    if (p.available_from && p.available_from > today) return { label:'Upcoming', color:'#2563EB', bg:'#EFF6FF' }
    return                                                 { label:'Live',      color:'#16A34A', bg:'#DCFCE7' }
  }
  const st = status()

  const priceLabel = tiers.length === 0 ? '—'
    : tiers.length === 1 ? `€${tiers[0].price}`
    : `€${Math.min(...tiers.map(t=>parseFloat(t.price)||0))} – €${Math.max(...tiers.map(t=>parseFloat(t.price)||0))}`

  return (
    <div style={{ background:'white', borderRadius:'12px', border:'1px solid #E5E7EB', padding:'16px', opacity: p.active?1:0.6 }}>
      <div style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>

        {/* Icon */}
        <div style={{ fontSize:'22px', flexShrink:0, marginTop:'1px' }}>{cat?.icon||'✨'}</div>

        {/* Content */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', flexWrap:'wrap', marginBottom:'3px' }}>
            <span style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>{p.name}</span>
            <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'10px', background:st.bg, color:st.color }}>
              {st.label}
            </span>
          </div>

          {p.description && (
            <div style={{ fontSize:'12px', color:'#6B7280', lineHeight:'1.5', marginBottom:'10px' }}>
              {p.description}
            </div>
          )}

          {/* Meta row */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', fontSize:'12px', color:'#374151', marginBottom:'10px' }}>
            <span>💰 {priceLabel}</span>
            <span>📊 {p.commission_rate}%</span>
            {p.available_times && <span>🕐 {p.available_times}</span>}
            {(p.available_from || p.available_to) && (
              <span>📅 {p.available_from||'–'} → {p.available_to||'open'}</span>
            )}
            {p.partners?.name && <span style={{ color:'#9CA3AF' }}>{p.partners.name}</span>}
          </div>

          {/* Tier pills */}
          {tiers.length > 0 && (
            <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
              {tiers.map((t, i) => (
                <span key={i} style={{ fontSize:'11px', padding:'3px 9px', borderRadius:'6px', background:'rgba(28,61,46,0.07)', color:'#1C3D2E', fontWeight:'600' }}>
                  {t.name}: €{t.price}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:'5px', flexShrink:0 }}>
          <button onClick={() => onEdit(p)}
            style={{ padding:'6px 12px', background:'white', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Edit
          </button>
          <button onClick={() => onToggle(p)}
            style={{ padding:'6px 12px', background:'white', border:`1px solid ${p.active?'#FCA5A5':'#D1D5DB'}`, borderRadius:'8px', fontSize:'12px', fontWeight:'600', color: p.active?'#DC2626':'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {p.active ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────
export default function ProductsManager({ hotelId }) {
  const [products, setProducts] = useState([])
  const [partners, setPartners] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(null)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => { if (hotelId) load() }, [hotelId])

  async function load() {
    setLoading(true)
    try {
      const [pr, pa] = await Promise.all([
        fetch(`/api/products?hotelId=${hotelId}&active=false`).then(r => r.json()),
        fetch(`/api/partners?hotelId=${hotelId}`).then(r => r.json()),
      ])
      setProducts(pr.products || [])
      setPartners(pa.partners?.filter(p => p.active) || [])
    } finally { setLoading(false) }
  }

  async function toggleActive(product) {
    await fetch('/api/products', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id:product.id, active:!product.active })
    })
    load()
  }

  function onSave() {
    setEditing(null); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    load()
  }

  if (loading) return (
    <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px', fontFamily:"'DM Sans',sans-serif" }}>
      Loading…
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Header */}
      {!editing && (
        <>
          <div>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'3px' }}>
              Products & services
            </div>
            <div style={{ fontSize:'12px', color:'#6B7280', lineHeight:'1.5' }}>
              Everything the bot can offer guests — tours, transfers, dining, spa, events and more.
              The bot will present these and send payment links automatically.
            </div>
          </div>

          {saved && (
            <div style={{ padding:'10px 14px', background:'#DCFCE7', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'#14532D' }}>
              ✓ Saved
            </div>
          )}
        </>
      )}

      {/* List */}
      {!editing && products.map(p => (
        <ProductCard key={p.id} p={p} onEdit={setEditing} onToggle={toggleActive} />
      ))}

      {/* Form */}
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          partners={partners}
          hotelId={hotelId}
          onSave={onSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Add button / empty state */}
      {!editing && (
        partners.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', background:'white', borderRadius:'12px', border:'1px dashed #D1D5DB' }}>
            <div style={{ fontSize:'13px', color:'#9CA3AF' }}>
              Add partners first, then come back to add their products and services.
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing('new')}
            style={{ width:'100%', padding:'13px', background: products.length===0?'#1C3D2E':'white', border: products.length===0?'none':'1px dashed #D1D5DB', borderRadius:'12px', fontSize:'13px', fontWeight:'600', color: products.length===0?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Add product or service
          </button>
        )
      )}
    </div>
  )
}
