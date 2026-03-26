// components/ProductsManager.js
// Manage partner products (experiences, events, etc.) that the bot can sell
// Embedded in SettingsTab under "Experiences" section

'use client'
import { useState, useEffect } from 'react'

const CATEGORIES = [
  { key:'event',     label:'Event / Concert',   icon:'🎤' },
  { key:'activity',  label:'Activity / Tour',    icon:'🚤' },
  { key:'dining',    label:'Dining experience',  icon:'🍽️' },
  { key:'transport', label:'Transport',           icon:'🚗' },
  { key:'wellness',  label:'Wellness / Spa',      icon:'💆' },
  { key:'other',     label:'Other',               icon:'✨' },
]

const EMPTY_TIER = { name:'', price:'', capacity:1 }

function inp(value, onChange, placeholder, type='text') {
  return (
    <input type={type} value={value||''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
  )
}

// ── TIER EDITOR ────────────────────────────────────────────
function TierEditor({ tiers, onChange }) {
  function updateTier(i, field, value) {
    const next = tiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t)
    onChange(next)
  }
  function addTier()    { onChange([...tiers, { ...EMPTY_TIER }]) }
  function removeTier(i){ onChange(tiers.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>
        Pricing tiers <span style={{ color:'#9CA3AF', fontWeight:'400' }}>(up to 3 — e.g. VIP / Premium / General)</span>
      </div>
      {tiers.map((tier, i) => (
        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 32px', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
          <input value={tier.name||''} onChange={e => updateTier(i,'name',e.target.value)} placeholder="Tier name (e.g. VIP Table)"
            style={{ padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', fontSize:'13px', color:'#6B7280' }}>€</span>
            <input type="number" value={tier.price||''} onChange={e => updateTier(i,'price',parseFloat(e.target.value)||0)} placeholder="0"
              style={{ width:'100%', padding:'8px 11px 8px 24px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
          </div>
          <input type="number" value={tier.capacity||1} onChange={e => updateTier(i,'capacity',parseInt(e.target.value)||1)} placeholder="Capacity"
            min="1" title="Max people per ticket (1 for per-person pricing)"
            style={{ padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
          {tiers.length > 1 && (
            <button onClick={() => removeTier(i)}
              style={{ width:'32px', height:'32px', borderRadius:'8px', background:'none', border:'1px solid #FCA5A5', color:'#DC2626', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
              ×
            </button>
          )}
        </div>
      ))}
      <div style={{ fontSize:'11px', color:'#9CA3AF', marginBottom:'6px' }}>Name · Price per ticket · Capacity (pax per ticket)</div>
      {tiers.length < 3 && (
        <button onClick={addTier}
          style={{ fontSize:'12px', fontWeight:'600', color:'#2563EB', background:'none', border:'none', cursor:'pointer', padding:'2px 0', fontFamily:"'DM Sans',sans-serif" }}>
          + Add tier
        </button>
      )}
    </div>
  )
}

// ── PRODUCT FORM ────────────────────────────────────────────
function ProductForm({ product, partners, hotelId, onSave, onCancel }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState({
    partnerId:      product?.partner_id     || (partners[0]?.id || ''),
    name:           product?.name           || '',
    description:    product?.description    || '',
    category:       product?.category       || 'event',
    tiers:          product?.tiers?.length  ? product.tiers : [{ ...EMPTY_TIER }],
    commissionRate: product?.commission_rate|| 15,
    availableFrom:  product?.available_from || '',
    availableTo:    product?.available_to   || '',
    availableTimes: product?.available_times|| '',
    maxPerGuest:    product?.max_per_guest  || 10,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function save() {
    if (!form.name.trim()) { setError('Product name is required'); return }
    if (!form.partnerId)   { setError('Select a partner'); return }
    const validTiers = form.tiers.filter(t => t.name && t.price > 0)
    if (validTiers.length === 0) { setError('Add at least one pricing tier'); return }

    setSaving(true); setError('')
    try {
      const method   = isEdit ? 'PATCH' : 'POST'
      const body     = isEdit
        ? { id: product.id, ...form, tiers: validTiers }
        : { hotelId, ...form, tiers: validTiers }
      const res      = await fetch('/api/products', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const data     = await res.json()
      if (data.error) { setError(data.error); return }
      onSave()
    } finally { setSaving(false) }
  }

  const labelStyle = { fontSize:'11px', fontWeight:'600', color:'#6B7280', marginBottom:'4px', display:'block' }

  return (
    <div style={{ background:'white', borderRadius:'12px', border:'1px solid #E5E7EB', padding:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>
        {isEdit ? 'Edit experience' : 'Add new experience'}
      </div>

      {/* Partner */}
      <div>
        <label style={labelStyle}>Partner</label>
        <select value={form.partnerId} onChange={e => set('partnerId', e.target.value)}
          style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827', background:'white' }}>
          <option value="">Select partner…</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
        </select>
      </div>

      {/* Name */}
      <div>
        <label style={labelStyle}>Experience name *</label>
        {inp(form.name, v => set('name', v), 'e.g. Shakira Concert · Private Boat Tour')}
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description <span style={{ color:'#9CA3AF', fontWeight:'400' }}>(shown to guest in chat)</span></label>
        <textarea value={form.description||''} onChange={e => set('description', e.target.value)}
          placeholder="e.g. An unforgettable night at the Palau Sant Jordi arena, 10 minutes from the hotel."
          rows={2}
          style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827', resize:'none', lineHeight:'1.5' }} />
      </div>

      {/* Category */}
      <div>
        <label style={labelStyle}>Category</label>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => set('category', c.key)}
              style={{ padding:'6px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'500', border:'1px solid', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", borderColor: form.category===c.key?'#1C3D2E':'#E5E7EB', background: form.category===c.key?'#1C3D2E':'white', color: form.category===c.key?'white':'#374151' }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing tiers */}
      <TierEditor tiers={form.tiers} onChange={v => set('tiers', v)} />

      {/* Commission */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' }}>
        <div>
          <label style={labelStyle}>Commission rate (%)</label>
          <input type="number" value={form.commissionRate} onChange={e => set('commissionRate', parseFloat(e.target.value)||0)}
            min="0" max="100" step="0.5"
            style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
        </div>
        <div>
          <label style={labelStyle}>Available from</label>
          <input type="date" value={form.availableFrom||''} onChange={e => set('availableFrom', e.target.value)}
            style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
        </div>
        <div>
          <label style={labelStyle}>Available until</label>
          <input type="date" value={form.availableTo||''} onChange={e => set('availableTo', e.target.value)}
            style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
        <div>
          <label style={labelStyle}>Time / schedule</label>
          {inp(form.availableTimes, v => set('availableTimes', v), 'e.g. 20:00 or 09:00–18:00 or flexible')}
        </div>
        <div>
          <label style={labelStyle}>Max tickets per guest</label>
          <input type="number" value={form.maxPerGuest} onChange={e => set('maxPerGuest', parseInt(e.target.value)||10)}
            min="1" max="100"
            style={{ width:'100%', padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111827' }} />
        </div>
      </div>

      {error && <div style={{ fontSize:'12px', color:'#DC2626', padding:'8px 12px', background:'#FEF2F2', borderRadius:'8px' }}>{error}</div>}

      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
        <button onClick={onCancel}
          style={{ padding:'9px 18px', background:'white', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', fontWeight:'500', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          style={{ padding:'9px 20px', background:'#1C3D2E', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add experience'}
        </button>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function ProductsManager({ hotelId }) {
  const [products, setProducts] = useState([])
  const [partners, setPartners] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(null)  // null | 'new' | product object
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
    await fetch('/api/products', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:product.id, active:!product.active }) })
    load()
  }

  function onSave() {
    setEditing(null); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  const today = new Date().toISOString().split('T')[0]

  function productStatus(p) {
    if (!p.active) return { label:'Inactive', color:'#9CA3AF', bg:'#F3F4F6' }
    if (p.available_to && p.available_to < today) return { label:'Expired', color:'#DC2626', bg:'#FEF2F2' }
    if (p.available_from && p.available_from > today) return { label:'Upcoming', color:'#2563EB', bg:'#EFF6FF' }
    return { label:'Live', color:'#16A34A', bg:'#DCFCE7' }
  }

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>Loading…</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>Experiences & upsells</div>
      <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'16px' }}>
        Add experiences, events, and services the bot can sell to guests via WhatsApp. Payment links are generated automatically. You earn a commission on every sale.
      </div>

      {saved && (
        <div style={{ padding:'10px 14px', background:'#DCFCE7', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'#14532D', marginBottom:'12px' }}>
          ✓ Saved successfully
        </div>
      )}

      {/* Product list */}
      {products.length > 0 && !editing && (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'16px' }}>
          {products.map(p => {
            const status = productStatus(p)
            const cat    = CATEGORIES.find(c => c.key === p.category)
            const tiers  = p.tiers || []
            const priceRange = tiers.length > 0
              ? tiers.length === 1
                ? `€${tiers[0].price}`
                : `€${Math.min(...tiers.map(t=>t.price))} – €${Math.max(...tiers.map(t=>t.price))}`
              : '—'

            return (
              <div key={p.id} style={{ background:'white', borderRadius:'12px', border:`1px solid ${p.active?'#E5E7EB':'#F3F4F6'}`, padding:'16px', opacity: p.active?1:0.65 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
                  <div style={{ fontSize:'24px', flexShrink:0, marginTop:'2px' }}>{cat?.icon || '✨'}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                      <span style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>{p.name}</span>
                      <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'10px', background:status.bg, color:status.color }}>
                        {status.label}
                      </span>
                    </div>
                    {p.description && (
                      <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'8px', lineHeight:'1.5' }}>{p.description}</div>
                    )}
                    <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', fontSize:'12px', color:'#374151', marginBottom:'8px' }}>
                      <span>💰 {priceRange}</span>
                      <span>📊 {p.commission_rate}% commission</span>
                      {p.available_times && <span>🕐 {p.available_times}</span>}
                      {p.available_from && <span>📅 {p.available_from}{p.available_to ? ` → ${p.available_to}` : '+'}</span>}
                      <span style={{ color:'#9CA3AF' }}>Partner: {p.partners?.name}</span>
                    </div>
                    {/* Tiers preview */}
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                      {tiers.map((t, i) => (
                        <span key={i} style={{ fontSize:'11px', padding:'3px 9px', borderRadius:'6px', background:'rgba(28,61,46,0.06)', color:'#1C3D2E', fontWeight:'500' }}>
                          {t.name}: €{t.price}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                    <button onClick={() => setEditing(p)}
                      style={{ padding:'6px 12px', background:'white', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Edit
                    </button>
                    <button onClick={() => toggleActive(p)}
                      style={{ padding:'6px 12px', background:'white', border:`1px solid ${p.active?'#FCA5A5':'#D1D5DB'}`, borderRadius:'8px', fontSize:'12px', fontWeight:'600', color: p.active?'#DC2626':'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {p.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit / create form */}
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          partners={partners}
          hotelId={hotelId}
          onSave={onSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Empty state / add button */}
      {!editing && (
        partners.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', background:'white', borderRadius:'12px', border:'1px dashed #D1D5DB' }}>
            <div style={{ fontSize:'13px', color:'#9CA3AF', marginBottom:'8px' }}>Add partners first in the Partners section, then come back to add their products.</div>
          </div>
        ) : (
          <button onClick={() => setEditing('new')}
            style={{ width:'100%', padding:'12px', background: products.length===0?'#1C3D2E':'white', border: products.length===0?'none':'1px dashed #D1D5DB', borderRadius:'12px', fontSize:'13px', fontWeight:'600', color: products.length===0?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Add experience or upsell
          </button>
        )
      )}
    </div>
  )
}
