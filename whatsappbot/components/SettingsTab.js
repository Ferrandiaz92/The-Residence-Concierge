// components/SettingsTab.js (updated)
// Changes:
// - Contact name field for partners
// - Custom partner types management
// - Custom departments management
// - Shifts management section
'use client'
import { useState, useEffect } from 'react'
import ShiftsManager from './ShiftsManager'

export default function SettingsTab({ hotelId }) {
  const [section, setSection]           = useState('partners')
  const [partners, setPartners]         = useState([])
  const [kbEntries, setKbEntries]       = useState([])
  const [partnerTypes, setPartnerTypes] = useState([])
  const [departments, setDepartments]   = useState([])
  const [kbCategory, setKbCategory]     = useState('all')
  const [editingPartner, setEditingPartner] = useState(null)
  const [editingKb, setEditingKb]           = useState(null)
  const [newPartner, setNewPartner]         = useState(null)
  const [newKb, setNewKb]                   = useState(null)
  const [newType, setNewType]               = useState(null)
  const [newDept, setNewDept]               = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(null)

  const KB_CATEGORIES = [
    { key:'all',        label:'All' },
    { key:'schedule',   label:'Schedule' },
    { key:'facilities', label:'Facilities' },
    { key:'policies',   label:'Policies' },
    { key:'pricing',    label:'Pricing' },
    { key:'local_tips', label:'Local tips' },
    { key:'custom',     label:'Custom FAQ' },
  ]

  useEffect(() => {
    if (!hotelId) return
    loadAll()
  }, [hotelId])

  async function loadAll() {
    loadPartners()
    loadKb()
    loadConfig()
  }

  async function loadConfig() {
    const res  = await fetch(`/api/config?hotelId=${hotelId}`)
    const data = await res.json()
    setPartnerTypes(data.partnerTypes || [])
    setDepartments(data.departments || [])
  }

  async function loadPartners() {
    const res  = await fetch(`/api/partners?hotelId=${hotelId}`)
    const data = await res.json()
    setPartners(data.partners || [])
  }

  async function loadKb(cat) {
    const c   = cat || kbCategory
    const url = `/api/knowledge?hotelId=${hotelId}${c !== 'all' ? `&category=${c}` : ''}`
    const res  = await fetch(url)
    const data = await res.json()
    setKbEntries(data.entries || [])
  }

  async function savePartner(partner) {
    setSaving(true)
    try {
      const method = partner.id ? 'PATCH' : 'POST'
      const body   = partner.id ? partner : { ...partner, hotelId }
      await fetch('/api/partners', { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      setEditingPartner(null); setNewPartner(null)
      flashSaved('partner'); loadPartners()
    } finally { setSaving(false) }
  }

  async function deletePartner(id) {
    if (!confirm('Deactivate this partner?')) return
    await fetch(`/api/partners?id=${id}`, { method:'DELETE' })
    loadPartners()
  }

  async function saveKb(entry) {
    setSaving(true)
    try {
      const method = entry.id ? 'PATCH' : 'POST'
      const body   = entry.id ? entry : { ...entry, hotelId }
      await fetch('/api/knowledge', { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      setEditingKb(null); setNewKb(null)
      flashSaved('kb'); loadKb()
    } finally { setSaving(false) }
  }

  async function toggleKb(entry) {
    await fetch('/api/knowledge', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:entry.id, active:!entry.active }) })
    loadKb()
  }

  async function deleteKb(id) {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/knowledge?id=${id}`, { method:'DELETE' })
    loadKb()
  }

  async function saveConfigItem(type, item) {
    setSaving(true)
    try {
      await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ hotelId, type, item }) })
      setNewType(null); setNewDept(null)
      flashSaved(type); loadConfig()
    } finally { setSaving(false) }
  }

  async function deleteConfigItem(type, id) {
    if (!confirm('Remove this item?')) return
    await fetch(`/api/config?type=${type}&id=${id}`, { method:'DELETE' })
    loadConfig()
  }

  function flashSaved(key) { setSaved(key); setTimeout(() => setSaved(null), 2000) }

  // Shared styles
  const inputStyle = { width:'100%', padding:'8px 11px', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', fontFamily:'var(--font)', outline:'none', color:'#111827' }
  const labelStyle = { fontSize:'11px', color:'#6B7280', marginBottom:'4px', fontWeight:'500', display:'block' }

  const inp = (value, onChange, placeholder, type='text') => (
    <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={inputStyle}/>
  )

  const saveBtn = (label, onClick, style={}) => (
    <button onClick={onClick} disabled={saving}
      style={{ padding:'7px 16px', background:'var(--green-800)', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'white', cursor:'pointer', fontFamily:'var(--font)', ...style }}>
      {saving ? 'Saving...' : label}
    </button>
  )

  const cancelBtn = (onClick) => (
    <button onClick={onClick}
      style={{ padding:'7px 14px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', color:'#6B7280', cursor:'pointer', fontFamily:'var(--font)' }}>
      Cancel
    </button>
  )

  const secBtn = (label, isActive, onClick) => (
    <button onClick={onClick}
      style={{ padding:'9px 20px', fontSize:'13px', fontWeight:'600', color:isActive?'var(--green-800)':'#9CA3AF', background:'none', border:'none', borderBottom:isActive?'2px solid var(--green-800)':'2px solid transparent', cursor:'pointer', fontFamily:'var(--font)' }}>
      {label}
    </button>
  )

  return (
    <div style={{ height:'100%', overflow:'hidden', display:'flex', flexDirection:'column', fontFamily:'var(--font)' }}>

      {/* Section tabs */}
      <div style={{ display:'flex', background:'white', borderBottom:'0.5px solid var(--border)', flexShrink:0 }}>
        {secBtn('Partners', section==='partners', ()=>setSection('partners'))}
        {secBtn('Knowledge base', section==='knowledge', ()=>setSection('knowledge'))}
        {secBtn('Partner types', section==='types', ()=>setSection('types'))}
        {secBtn('Departments', section==='departments', ()=>setSection('departments'))}
        {secBtn('Shifts', section==='shifts', ()=>setSection('shifts'))}
      </div>

      <div className="scrollable" style={{ padding:'20px', background:'#F9FAFB' }}>

        {/* ── PARTNERS ── */}
        {section === 'partners' && (
          <div style={{ maxWidth:'720px' }}>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>Partner management</div>
            <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'16px' }}>{partners.filter(p=>p.active).length} active partners · changes go live immediately</div>

            <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'16px' }}>
              {partners.filter(p=>p.active).map(p => {
                const isEditing = editingPartner?.id === p.id
                return (
                  <div key={p.id} style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', overflow:'hidden' }}>
                    <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px' }}>
                          <div style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>{p.name}</div>
                          <div style={{ fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'5px', background:'#F0FDF4', color:'#14532D' }}>{p.type}</div>
                        </div>
                        {p.contact_name && (
                          <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'2px' }}>Contact: <strong>{p.contact_name}</strong></div>
                        )}
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{p.phone} · {p.commission_rate}% commission</div>
                      </div>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => setEditingPartner(isEditing ? null : {...p})}
                          style={{ padding:'6px 14px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'8px', fontSize:'12px', color:'#374151', cursor:'pointer', fontFamily:'var(--font)' }}>
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                        <button onClick={() => deletePartner(p.id)}
                          style={{ padding:'6px 14px', background:'white', border:'0.5px solid #FCA5A5', borderRadius:'8px', fontSize:'12px', color:'#DC2626', cursor:'pointer', fontFamily:'var(--font)' }}>
                          Remove
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div style={{ padding:'16px', borderTop:'0.5px solid #F3F4F6', background:'#F9FAFB' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                          <div><label style={labelStyle}>Company / Business name</label>{inp(editingPartner.name, v=>setEditingPartner(p=>({...p,name:v})), 'e.g. Blue Ocean Boat Tours')}</div>
                          <div>
                            <label style={labelStyle}>Contact person name</label>
                            {inp(editingPartner.contact_name, v=>setEditingPartner(p=>({...p,contact_name:v})), 'e.g. Tony')}
                          </div>
                          <div>
                            <label style={labelStyle}>Type</label>
                            <select value={editingPartner.type} onChange={e=>setEditingPartner(p=>({...p,type:e.target.value}))} style={inputStyle}>
                              {partnerTypes.map(t=><option key={t.id} value={t.name.toLowerCase()}>{t.name}</option>)}
                            </select>
                          </div>
                          <div><label style={labelStyle}>WhatsApp phone</label>{inp(editingPartner.phone, v=>setEditingPartner(p=>({...p,phone:v})), '+357...')}</div>
                          <div><label style={labelStyle}>Commission %</label>{inp(editingPartner.commission_rate, v=>setEditingPartner(p=>({...p,commission_rate:v})), '10', 'number')}</div>
                        </div>
                        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                          {cancelBtn(()=>setEditingPartner(null))}
                          {saveBtn(saved==='partner'?'✓ Saved':'Save changes', ()=>savePartner(editingPartner))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {newPartner ? (
              <div style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'12px' }}>Add new partner</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
                  <div><label style={labelStyle}>Company / Business name</label>{inp(newPartner.name, v=>setNewPartner(p=>({...p,name:v})), 'e.g. Blue Ocean Boat Tours')}</div>
                  <div><label style={labelStyle}>Contact person name</label>{inp(newPartner.contact_name, v=>setNewPartner(p=>({...p,contact_name:v})), 'e.g. Tony')}</div>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select value={newPartner.type} onChange={e=>setNewPartner(p=>({...p,type:e.target.value}))} style={inputStyle}>
                      {partnerTypes.map(t=><option key={t.id} value={t.name.toLowerCase()}>{t.name}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>WhatsApp phone</label>{inp(newPartner.phone, v=>setNewPartner(p=>({...p,phone:v})), '+35799...')}</div>
                  <div><label style={labelStyle}>Commission %</label>{inp(newPartner.commission_rate, v=>setNewPartner(p=>({...p,commission_rate:v})), '10', 'number')}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                  {cancelBtn(()=>setNewPartner(null))}
                  {saveBtn('Add partner', ()=>savePartner(newPartner))}
                </div>
              </div>
            ) : (
              <button onClick={()=>setNewPartner({name:'',contact_name:'',type:partnerTypes[0]?.name.toLowerCase()||'taxi',phone:'',commission_rate:10})}
                style={{ width:'100%', padding:'12px', background:'none', border:'0.5px dashed #D1D5DB', borderRadius:'12px', fontSize:'13px', color:'#9CA3AF', cursor:'pointer', fontFamily:'var(--font)' }}>
                + Add new partner
              </button>
            )}
          </div>
        )}

        {/* ── KNOWLEDGE BASE ── */}
        {section === 'knowledge' && (
          <div style={{ maxWidth:'720px' }}>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>Hotel knowledge base</div>
            <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'16px' }}>Bot uses these answers for guest questions. Updates go live immediately.</div>

            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px' }}>
              {KB_CATEGORIES.map(c=>(
                <button key={c.key} onClick={()=>{ setKbCategory(c.key); loadKb(c.key) }}
                  style={{ padding:'5px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:'500', border:'0.5px solid', borderColor:kbCategory===c.key?'var(--green-800)':'#D1D5DB', background:kbCategory===c.key?'var(--green-800)':'white', color:kbCategory===c.key?'white':'#374151', cursor:'pointer', fontFamily:'var(--font)' }}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'14px' }}>
              {kbEntries.map(entry => {
                const isEditing = editingKb?.id === entry.id
                return (
                  <div key={entry.id} style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', overflow:'hidden', opacity:entry.active?1:0.5 }}>
                    <div style={{ padding:'13px 16px', display:'flex', alignItems:'flex-start', gap:'12px' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'4px' }}>
                          <div style={{ fontSize:'10px', fontWeight:'600', padding:'2px 7px', borderRadius:'4px', background:'#F3F4F6', color:'#6B7280' }}>{entry.category.replace('_',' ')}</div>
                          {!entry.active && <div style={{ fontSize:'10px', color:'#D1D5DB' }}>disabled</div>}
                        </div>
                        <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'3px' }}>{entry.question}</div>
                        <div style={{ fontSize:'12px', color:'#6B7280', lineHeight:'1.5' }}>{entry.answer}</div>
                      </div>
                      <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                        <button onClick={()=>toggleKb(entry)} style={{ padding:'5px 10px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'11px', color:'#6B7280', cursor:'pointer', fontFamily:'var(--font)' }}>
                          {entry.active?'Disable':'Enable'}
                        </button>
                        <button onClick={()=>setEditingKb(isEditing?null:{...entry})} style={{ padding:'5px 10px', background:'white', border:'0.5px solid #D1D5DB', borderRadius:'7px', fontSize:'11px', color:'#6B7280', cursor:'pointer', fontFamily:'var(--font)' }}>
                          Edit
                        </button>
                        <button onClick={()=>deleteKb(entry.id)} style={{ padding:'5px 10px', background:'white', border:'0.5px solid #FCA5A5', borderRadius:'7px', fontSize:'11px', color:'#DC2626', cursor:'pointer', fontFamily:'var(--font)' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                    {isEditing && (
                      <div style={{ padding:'14px 16px', borderTop:'0.5px solid #F3F4F6', background:'#F9FAFB', display:'flex', flexDirection:'column', gap:'10px' }}>
                        <div><label style={labelStyle}>Topic / Question</label>{inp(editingKb.question, v=>setEditingKb(e=>({...e,question:v})), 'e.g. WiFi password')}</div>
                        <div>
                          <label style={labelStyle}>Answer the bot gives guests</label>
                          <textarea value={editingKb.answer||''} onChange={e=>setEditingKb(kb=>({...kb,answer:e.target.value}))}
                            style={{ ...inputStyle, height:'72px', resize:'none' }} placeholder="Full answer..."/>
                        </div>
                        <div>
                          <label style={labelStyle}>Category</label>
                          <select value={editingKb.category} onChange={e=>setEditingKb(kb=>({...kb,category:e.target.value}))} style={inputStyle}>
                            {KB_CATEGORIES.filter(c=>c.key!=='all').map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                          {cancelBtn(()=>setEditingKb(null))}
                          {saveBtn(saved==='kb'?'✓ Saved':'Save changes', ()=>saveKb(editingKb))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {newKb ? (
              <div style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827', marginBottom:'12px' }}>New knowledge entry</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select value={newKb.category} onChange={e=>setNewKb(k=>({...k,category:e.target.value}))} style={inputStyle}>
                      {KB_CATEGORIES.filter(c=>c.key!=='all').map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>Topic / Question</label>{inp(newKb.question, v=>setNewKb(k=>({...k,question:v})), 'e.g. Gym equipment, Breakfast menu...')}</div>
                  <div>
                    <label style={labelStyle}>Answer the bot gives guests</label>
                    <textarea value={newKb.answer||''} onChange={e=>setNewKb(k=>({...k,answer:e.target.value}))}
                      style={{ ...inputStyle, height:'72px', resize:'none' }} placeholder="Full answer..."/>
                  </div>
                  <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                    {cancelBtn(()=>setNewKb(null))}
                    {saveBtn('Add entry', ()=>saveKb(newKb))}
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={()=>setNewKb({category:'schedule',question:'',answer:''})}
                style={{ width:'100%', padding:'12px', background:'none', border:'0.5px dashed #D1D5DB', borderRadius:'12px', fontSize:'13px', color:'#9CA3AF', cursor:'pointer', fontFamily:'var(--font)' }}>
                + Add new entry
              </button>
            )}
          </div>
        )}

        {/* ── PARTNER TYPES ── */}
        {section === 'types' && (
          <div style={{ maxWidth:'520px' }}>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>Partner types</div>
            <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'16px' }}>Customise the types available when adding partners</div>

            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'14px' }}>
              {partnerTypes.map(pt => (
                <div key={pt.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'white', border:'0.5px solid #E5E7EB', borderRadius:'10px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'700', color:'#14532D' }}>
                    {pt.icon}
                  </div>
                  <div style={{ flex:1, fontSize:'13px', fontWeight:'600', color:'#111827' }}>{pt.name}</div>
                  <button onClick={()=>deleteConfigItem('partner_type', pt.id)}
                    style={{ padding:'5px 12px', background:'white', border:'0.5px solid #FCA5A5', borderRadius:'7px', fontSize:'11px', color:'#DC2626', cursor:'pointer', fontFamily:'var(--font)' }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {newType ? (
              <div style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', gap:'10px', marginBottom:'10px' }}>
                  <div><label style={labelStyle}>Type name</label>{inp(newType.name, v=>setNewType(t=>({...t,name:v})), 'e.g. Golf, Yacht, Spa...')}</div>
                  <div><label style={labelStyle}>Badge icon</label>{inp(newType.icon, v=>setNewType(t=>({...t,icon:v.slice(0,2).toUpperCase()})), 'G')}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                  {cancelBtn(()=>setNewType(null))}
                  {saveBtn('Add type', ()=>saveConfigItem('partner_type',{name:newType.name,icon:newType.icon||newType.name[0].toUpperCase()}))}
                </div>
              </div>
            ) : (
              <button onClick={()=>setNewType({name:'',icon:''})}
                style={{ width:'100%', padding:'12px', background:'none', border:'0.5px dashed #D1D5DB', borderRadius:'12px', fontSize:'13px', color:'#9CA3AF', cursor:'pointer', fontFamily:'var(--font)' }}>
                + Add new partner type
              </button>
            )}
          </div>
        )}

        {/* ── DEPARTMENTS ── */}
        {section === 'departments' && (
          <div style={{ maxWidth:'520px' }}>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>Departments</div>
            <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'16px' }}>Customise departments for internal requests and ticketing</div>

            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'14px' }}>
              {departments.map(dept => (
                <div key={dept.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'white', border:'0.5px solid #E5E7EB', borderRadius:'10px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:'#1E3A5F' }}>
                    {dept.icon}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{dept.name}</div>
                    <div style={{ fontSize:'11px', color:'#9CA3AF' }}>key: {dept.key}</div>
                  </div>
                  <button onClick={()=>deleteConfigItem('department', dept.id)}
                    style={{ padding:'5px 12px', background:'white', border:'0.5px solid #FCA5A5', borderRadius:'7px', fontSize:'11px', color:'#DC2626', cursor:'pointer', fontFamily:'var(--font)' }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {newDept ? (
              <div style={{ background:'white', border:'0.5px solid #E5E7EB', borderRadius:'12px', padding:'16px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 80px', gap:'10px', marginBottom:'10px' }}>
                  <div><label style={labelStyle}>Department name</label>{inp(newDept.name, v=>setNewDept(d=>({...d,name:v,key:v.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z_]/g,'')})), 'e.g. Security')}</div>
                  <div><label style={labelStyle}>Key (auto)</label>{inp(newDept.key, v=>setNewDept(d=>({...d,key:v})), 'security')}</div>
                  <div><label style={labelStyle}>Badge</label>{inp(newDept.icon, v=>setNewDept(d=>({...d,icon:v.slice(0,2).toUpperCase()})), 'SC')}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                  {cancelBtn(()=>setNewDept(null))}
                  {saveBtn('Add department', ()=>saveConfigItem('department',{name:newDept.name,key:newDept.key,icon:newDept.icon||newDept.name.slice(0,2).toUpperCase()}))}
                </div>
              </div>
            ) : (
              <button onClick={()=>setNewDept({name:'',key:'',icon:''})}
                style={{ width:'100%', padding:'12px', background:'none', border:'0.5px dashed #D1D5DB', borderRadius:'12px', fontSize:'13px', color:'#9CA3AF', cursor:'pointer', fontFamily:'var(--font)' }}>
                + Add new department
              </button>
            )}
          </div>
        )}

        {/* ── SHIFTS ── */}
        {section === 'shifts' && (
          <div style={{ maxWidth:'900px' }}>
            <ShiftsManager hotelId={hotelId} />
          </div>
        )}

      </div>
    </div>
  )
}
