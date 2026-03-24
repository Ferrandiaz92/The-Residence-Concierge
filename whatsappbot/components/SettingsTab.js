// components/SettingsTab.js
'use client'
import { useState, useEffect } from 'react'

const CATEGORIES = [
  { key: 'all',        label: 'All' },
  { key: 'schedule',   label: 'Schedule' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'policies',   label: 'Policies' },
  { key: 'pricing',    label: 'Pricing' },
  { key: 'local_tips', label: 'Local tips' },
  { key: 'custom',     label: 'Custom FAQ' },
]

const PARTNER_TYPES = ['taxi', 'restaurant', 'activity', 'other']

const btn = (label, onClick, style = {}) => (
  <button onClick={onClick} style={{
    padding: '6px 14px', borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--border-md)', background: 'white',
    fontSize: '11px', fontWeight: '500', color: 'var(--gray-600)',
    cursor: 'pointer', fontFamily: 'var(--font)',
    ...style,
  }}>{label}</button>
)

export default function SettingsTab({ hotelId }) {
  const [section, setSection]           = useState('partners')
  const [partners, setPartners]         = useState([])
  const [kbEntries, setKbEntries]       = useState([])
  const [kbCategory, setKbCategory]     = useState('all')
  const [editingPartner, setEditingPartner] = useState(null)
  const [editingKb, setEditingKb]       = useState(null)
  const [newPartner, setNewPartner]     = useState(null)
  const [newKb, setNewKb]               = useState(null)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(null)

  useEffect(() => {
    if (!hotelId) return
    loadPartners()
    loadKb()
  }, [hotelId])

  async function loadPartners() {
    const res  = await fetch(`/api/partners?hotelId=${hotelId}`)
    const data = await res.json()
    setPartners(data.partners || [])
  }

  async function loadKb(category) {
    const cat = category || kbCategory
    const url = `/api/knowledge?hotelId=${hotelId}${cat !== 'all' ? `&category=${cat}` : ''}`
    const res  = await fetch(url)
    const data = await res.json()
    setKbEntries(data.entries || [])
  }

  async function savePartner(partner) {
    setSaving(true)
    try {
      const method = partner.id ? 'PATCH' : 'POST'
      const body   = partner.id ? partner : { ...partner, hotelId }
      await fetch('/api/partners', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setEditingPartner(null); setNewPartner(null)
      flashSaved('partner'); loadPartners()
    } finally { setSaving(false) }
  }

  async function deletePartner(id) {
    if (!confirm('Deactivate this partner?')) return
    await fetch(`/api/partners?id=${id}`, { method: 'DELETE' })
    loadPartners()
  }

  async function saveKb(entry) {
    setSaving(true)
    try {
      const method = entry.id ? 'PATCH' : 'POST'
      const body   = entry.id ? entry : { ...entry, hotelId }
      await fetch('/api/knowledge', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setEditingKb(null); setNewKb(null)
      flashSaved('kb'); loadKb()
    } finally { setSaving(false) }
  }

  async function toggleKb(entry) {
    await fetch('/api/knowledge', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, active: !entry.active }),
    })
    loadKb()
  }

  async function deleteKb(id) {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' })
    loadKb()
  }

  function flashSaved(key) {
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  const sh = (title, sub) => (
    <div style={{ padding: '7px 0', fontSize: '10px', fontWeight: '500', color: 'var(--gray-500)', display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '0.5px solid var(--border)', paddingBottom: '8px' }}>
      <span>{title}</span>
      {sub && <span style={{ fontSize: '9px', color: 'var(--gray-300)', fontWeight: '400' }}>{sub}</span>}
    </div>
  )

  const input = (value, onChange, placeholder, type = 'text') => (
    <input
      type={type} value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '7px 10px',
        border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
        fontSize: '11px', fontFamily: 'var(--font)', outline: 'none',
        color: 'var(--gray-800)', background: 'white',
      }}
    />
  )

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '0', background: 'white', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
        {[{ key: 'partners', label: 'Partners' }, { key: 'knowledge', label: 'Knowledge base' }].map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{
              padding: '10px 20px', fontSize: '12px', fontWeight: '500',
              color: section === s.key ? 'var(--green-800)' : 'var(--gray-400)',
              background: 'none', border: 'none',
              borderBottom: section === s.key ? '2px solid var(--green-800)' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="scrollable" style={{ padding: '20px', background: 'var(--gray-50)' }}>

        {/* ── PARTNERS ── */}
        {section === 'partners' && (
          <div style={{ maxWidth: '700px' }}>
            {sh('Partner management', `${partners.filter(p=>p.active).length} active partners`)}

            {/* Partner list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {partners.filter(p => p.active).map(p => {
                const isEditing = editingPartner?.id === p.id
                const typeColors = { taxi: '#16A34A', restaurant: '#2563EB', activity: '#D97706', other: '#6E6C66' }
                const typeBgs   = { taxi: '#F0FDF4', restaurant: '#EFF6FF', activity: '#FEF3C7', other: '#F8F8F6' }
                return (
                  <div key={p.id} style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    {/* Partner row */}
                    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: typeBgs[p.type] || typeBgs.other, color: typeColors[p.type] || typeColors.other, flexShrink: 0 }}>
                        {p.type}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>{p.phone} · {p.commission_rate}% commission</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {btn('Edit', () => setEditingPartner(isEditing ? null : { ...p }))}
                        {btn('Remove', () => deletePartner(p.id), { color: '#D94040', borderColor: '#FCA5A5' })}
                      </div>
                    </div>

                    {/* Edit form */}
                    {isEditing && (
                      <div style={{ padding: '14px', borderTop: '0.5px solid var(--border)', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Name</div>
                            {input(editingPartner.name, v => setEditingPartner(p => ({...p, name: v})), 'Partner name')}
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Type</div>
                            <select value={editingPartner.type} onChange={e => setEditingPartner(p => ({...p, type: e.target.value}))}
                              style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--font)', outline: 'none' }}>
                              {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>WhatsApp phone</div>
                            {input(editingPartner.phone, v => setEditingPartner(p => ({...p, phone: v})), '+357...')}
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Commission %</div>
                            {input(editingPartner.commission_rate, v => setEditingPartner(p => ({...p, commission_rate: v})), '10', 'number')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {btn('Cancel', () => setEditingPartner(null))}
                          {btn(saving ? 'Saving...' : saved === 'partner' ? '✓ Saved' : 'Save changes', () => savePartner(editingPartner), {
                            background: saved === 'partner' ? '#16A34A' : 'var(--green-800)',
                            color: 'white', borderColor: 'transparent',
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Add new partner */}
            {newPartner ? (
              <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-900)', marginBottom: '12px' }}>New partner</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Name</div>
                    {input(newPartner.name, v => setNewPartner(p => ({...p, name: v})), 'e.g. Christos Taxi')}
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Type</div>
                    <select value={newPartner.type} onChange={e => setNewPartner(p => ({...p, type: e.target.value}))}
                      style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--font)', outline: 'none' }}>
                      {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>WhatsApp phone</div>
                    {input(newPartner.phone, v => setNewPartner(p => ({...p, phone: v})), '+35799...')}
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Commission %</div>
                    {input(newPartner.commission_rate, v => setNewPartner(p => ({...p, commission_rate: v})), '10', 'number')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {btn('Cancel', () => setNewPartner(null))}
                  {btn(saving ? 'Saving...' : 'Add partner', () => savePartner(newPartner), { background: 'var(--green-800)', color: 'white', borderColor: 'transparent' })}
                </div>
              </div>
            ) : (
              <button onClick={() => setNewPartner({ name: '', type: 'taxi', phone: '', commission_rate: 10 })}
                style={{
                  width: '100%', padding: '10px', background: 'none',
                  border: '0.5px dashed var(--border-md)', borderRadius: 'var(--radius-lg)',
                  fontSize: '12px', color: 'var(--gray-400)', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}>
                + Add new partner
              </button>
            )}
          </div>
        )}

        {/* ── KNOWLEDGE BASE ── */}
        {section === 'knowledge' && (
          <div style={{ maxWidth: '700px' }}>
            {sh('Hotel knowledge base', 'Bot uses these answers for guest questions')}

            {/* Category filter */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {CATEGORIES.map(c => (
                <button key={c.key}
                  onClick={() => { setKbCategory(c.key); loadKb(c.key) }}
                  style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '11px',
                    border: '0.5px solid',
                    borderColor: kbCategory === c.key ? 'var(--green-800)' : 'var(--border-md)',
                    background: kbCategory === c.key ? 'var(--green-800)' : 'white',
                    color: kbCategory === c.key ? 'white' : 'var(--gray-500)',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Knowledge entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {kbEntries.map(entry => {
                const isEditing = editingKb?.id === entry.id
                return (
                  <div key={entry.id} style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', opacity: entry.active ? 1 : 0.5 }}>
                    <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px', background: 'var(--gray-100)', color: 'var(--gray-500)' }}>
                            {entry.category.replace('_', ' ')}
                          </div>
                          {!entry.active && <div style={{ fontSize: '9px', color: 'var(--gray-300)' }}>disabled</div>}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-900)', marginBottom: '2px' }}>{entry.question}</div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-500)', lineHeight: '1.5' }}>{entry.answer}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                        {btn(entry.active ? 'Disable' : 'Enable', () => toggleKb(entry), { fontSize: '10px', padding: '4px 10px' })}
                        {btn('Edit', () => setEditingKb(isEditing ? null : { ...entry }), { fontSize: '10px', padding: '4px 10px' })}
                        {btn('Delete', () => deleteKb(entry.id), { fontSize: '10px', padding: '4px 10px', color: '#D94040', borderColor: '#FCA5A5' })}
                      </div>
                    </div>

                    {/* Edit form */}
                    {isEditing && (
                      <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--border)', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Topic / Question</div>
                          {input(editingKb.question, v => setEditingKb(e => ({...e, question: v})), 'e.g. WiFi password')}
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Answer the bot gives</div>
                          <textarea
                            value={editingKb.answer || ''}
                            onChange={e => setEditingKb(kb => ({...kb, answer: e.target.value}))}
                            placeholder="Full answer the bot should give guests..."
                            style={{
                              width: '100%', height: '72px', padding: '8px 10px',
                              border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
                              fontSize: '11px', fontFamily: 'var(--font)', resize: 'none', outline: 'none',
                            }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Category</div>
                          <select value={editingKb.category} onChange={e => setEditingKb(kb => ({...kb, category: e.target.value}))}
                            style={{ padding: '7px 10px', border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--font)', outline: 'none' }}>
                            {CATEGORIES.filter(c => c.key !== 'all').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {btn('Cancel', () => setEditingKb(null))}
                          {btn(saving ? 'Saving...' : saved === 'kb' ? '✓ Saved' : 'Save changes', () => saveKb(editingKb), {
                            background: saved === 'kb' ? '#16A34A' : 'var(--green-800)',
                            color: 'white', borderColor: 'transparent',
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Add new KB entry */}
            {newKb ? (
              <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-900)', marginBottom: '10px' }}>New knowledge entry</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Category</div>
                    <select value={newKb.category} onChange={e => setNewKb(k => ({...k, category: e.target.value}))}
                      style={{ padding: '7px 10px', border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--font)', outline: 'none' }}>
                      {CATEGORIES.filter(c => c.key !== 'all').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Topic / Question</div>
                    {input(newKb.question, v => setNewKb(k => ({...k, question: v})), 'e.g. Gym equipment, Breakfast menu, Late checkout fee...')}
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '4px' }}>Answer the bot gives guests</div>
                    <textarea
                      value={newKb.answer || ''}
                      onChange={e => setNewKb(k => ({...k, answer: e.target.value}))}
                      placeholder="Full answer..."
                      style={{
                        width: '100%', height: '72px', padding: '8px 10px',
                        border: '0.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
                        fontSize: '11px', fontFamily: 'var(--font)', resize: 'none', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {btn('Cancel', () => setNewKb(null))}
                    {btn(saving ? 'Saving...' : 'Add entry', () => saveKb(newKb), { background: 'var(--green-800)', color: 'white', borderColor: 'transparent' })}
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setNewKb({ category: 'schedule', question: '', answer: '' })}
                style={{
                  width: '100%', padding: '10px', background: 'none',
                  border: '0.5px dashed var(--border-md)', borderRadius: 'var(--radius-lg)',
                  fontSize: '12px', color: 'var(--gray-400)', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}>
                + Add new entry
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
