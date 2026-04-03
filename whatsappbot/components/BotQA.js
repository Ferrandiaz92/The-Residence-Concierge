// components/BotQA.js
'use client'
import { useState, useEffect } from 'react'

const FLAG_TYPES = [
  { key:'wrong_answer',      label:'Wrong answer',          color:'#A32D2D', bg:'#FEE2E2' },
  { key:'poor_tone',         label:'Poor tone',             color:'#633806', bg:'#faeeda' },
  { key:'missed_booking',    label:'Missed booking',        color:'#3C3489', bg:'#EEEDFE' },
  { key:'missed_escalation', label:'Should have escalated', color:'#0c447c', bg:'#E6F1FB' },
  { key:'other',             label:'Other issue',           color:'#444441', bg:'#F1EFE8' },
]

const MONTH_OPTIONS = (() => {
  const opts = []
  const now  = new Date()
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({ val:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:`${MONTHS[d.getMonth()]} ${d.getFullYear()}` })
  }
  return opts
})()

const F = "DM Sans,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

export default function BotQA({ hotelId }) {
  const [conversations, setConversations] = useState([])
  const [stats,         setStats]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [filter,        setFilter]        = useState('all')
  const [language,      setLanguage]      = useState('all')
  const [guestType,     setGuestType]     = useState('all')
  const [search,        setSearch]        = useState('')
  const [searchInput,   setSearchInput]   = useState('')
  const [month,         setMonth]         = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`
  })
  const [openConvs,     setOpenConvs]     = useState({})
  const [expandedConv,  setExpandedConv]  = useState(null)
  const [flagging,      setFlagging]      = useState(null)
  const [flagType,      setFlagType]      = useState('wrong_answer')
  const [flagNote,      setFlagNote]      = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [saving,        setSaving]        = useState(false)
  const [translating,   setTranslating]   = useState({})
  const [translations,  setTranslations]  = useState({})
  const [flagPanelOpen, setFlagPanelOpen] = useState(true)
  const [statsOpen,     setStatsOpen]     = useState(false)
  const [highlightMsg,  setHighlightMsg]  = useState(null)

  useEffect(() => { if (hotelId) loadData() }, [hotelId, filter, language, search, month, guestType])

  async function loadData() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ hotelId, filter, language, search, month, guestType })
      const res  = await fetch(`/api/qa?${params}`)
      const data = await res.json()
      setConversations(data.conversations || [])
      setStats(data.stats || null)
    } finally { setLoading(false) }
  }

  function toggleConv(id) { setOpenConvs(o => ({ ...o, [id]: !o[id] })) }

  function openAtFlag(conv, msgIndex) {
    setOpenConvs(o => ({ ...o, [conv.id]: true }))
    setHighlightMsg({ convId: conv.id, msgIndex })
    setTimeout(() => {
      const el = document.getElementById(`msg-${conv.id}-${msgIndex}`)
      if (el) el.scrollIntoView({ behavior:'smooth', block:'center' })
    }, 200)
  }

  async function handleFlag(conv, msgIdx, msgContent) {
    setSaving(true)
    try {
      await fetch('/api/flag', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ hotelId, conversationId:conv.id, messageIndex:msgIdx, messageContent:msgContent, flagType, note:flagNote, correctAnswer }),
      })
      setFlagging(null); setFlagNote(''); setCorrectAnswer('')
      loadData()
    } finally { setSaving(false) }
  }

  async function resolveFlag(flagId) {
    await fetch('/api/flag', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ flagId, resolutionNote:'' }) })
    loadData()
  }

  async function translateConversation(conv) {
    if (translations[conv.id]) {
      setTranslations(t => { const n={...t}; delete n[conv.id]; return n })
      return
    }
    setTranslating(t => ({ ...t, [conv.id]: true }))
    try {
      const msgs = conv.messages || []
      const transcript = msgs.map((m,i) => `[${i}] ${m.role==='assistant'?'BOT':'GUEST'}: ${m.content}`).join('\n\n')
      const res = await fetch('/api/translate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ transcript, lang: conv.guests?.language || 'en' }) })
      if (!res.ok) throw new Error('Translation failed')
      const data = await res.json()
      const lines = (data.translated || '').split('\n\n').filter(Boolean)
      const translatedMsgs = msgs.map((orig, i) => {
        const line = lines.find(l => l.startsWith(`[${i}]`))
        if (!line) return orig
        const ci = line.indexOf(':')
        return { ...orig, content: ci > -1 ? line.slice(ci+1).trim() : orig.content }
      })
      setTranslations(t => ({ ...t, [conv.id]: translatedMsgs }))
    } catch(e) { console.error('Translation failed:', e) }
    finally { setTranslating(t => { const n={...t}; delete n[conv.id]; return n }) }
  }

  function isMsgFlagged(conv, idx) { return (conv.qa_flags||[]).some(f => f.message_index === idx && !f.resolved) }
  function getMsgFlag(conv, idx)    { return (conv.qa_flags||[]).find(f => f.message_index === idx) }

  const s = stats || {}
  const allFlags = conversations.flatMap(conv =>
    (conv.qa_flags||[]).filter(f => !f.resolved).map(f => ({ ...f, conv }))
  )

  function copyAllForClaude() {
    const text = allFlags.map((f, i) => {
      const msgs     = f.conv.messages || []
      const guest    = f.conv.guests || {}
      const botMsg   = msgs[f.message_index]
      const guestMsg = f.message_index > 0 ? msgs[f.message_index - 1] : null
      const ft       = FLAG_TYPES.find(t => t.key === f.flag_type)?.label || 'Issue'
      return [
        `--- Flag ${i+1}: ${ft} · ${guest.name||'Guest'}${guest.room?' · Room '+guest.room:''} ---`,
        guestMsg ? `GUEST SAID: "${(guestMsg.content||'').slice(0,200)}"` : '',
        `BOT SAID: "${(botMsg?.content||'').slice(0,400)}"`,
        f.note           ? `WHAT WAS WRONG: ${f.note}` : '',
        f.correct_answer ? `CORRECT ANSWER: ${f.correct_answer}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')
    const prompt = text + '\n\n---\nFor each flag above, rewrite the BOT SAID reply. Make it accurate, natural and concise. Use the CORRECT ANSWER as guidance where provided.'
    navigator.clipboard.writeText(prompt).then(() => alert('Copied! Paste into Claude to get improved answers.'))
  }

  const SEL  = { padding:'5px 8px', borderRadius:'6px', fontSize:'12px', border:'0.5px solid #d3d1c7', background:'white', color:'#3d3d3a', fontFamily:F, cursor:'pointer' }
  const FBTN = (active) => ({ padding:'5px 13px', borderRadius:'6px', fontSize:'12px', fontWeight:'500', border:`0.5px solid ${active?'#1a3d2e':'#d3d1c7'}`, background:active?'#1a3d2e':'white', color:active?'white':'#3d3d3a', cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' })

  // ── CONVERSATION CARD ────────────────────────────────────────
  function ConvCard({ conv }) {
    const guest      = conv.guests || {}
    const msgs       = conv.messages || []
    const flags      = conv.qa_flags || []
    const isOpen     = !!openConvs[conv.id]
    const openFlags  = flags.filter(f => !f.resolved).length
    const botMsgs    = msgs.filter(m => m.role==='assistant').length
    const minsAgo    = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
    const timeLabel  = minsAgo < 60 ? `${minsAgo}m ago` : minsAgo < 1440 ? `${Math.floor(minsAgo/60)}h ago` : `${Math.floor(minsAgo/1440)}d ago`
    const displayMsgs = translations[conv.id] || msgs
    const name = guest.room
      ? `Room ${guest.room}${guest.name ? ' · '+guest.name : ''}`
      : guest.name ? guest.name+(guest.surname?' '+guest.surname:'') : 'Guest'

    return (
      <div style={{ background:'white', border:`0.5px solid ${openFlags>0?'#d3b0b0':'#e0dfd8'}`, borderRadius:'10px', overflow:'hidden', fontFamily:F }}>
        {/* Header */}
        <div onClick={() => toggleConv(conv.id)}
          style={{ padding:'10px 13px', display:'flex', alignItems:'center', gap:'9px', cursor:'pointer', background:isOpen?'#f9f8f5':'white' }}
          onMouseEnter={e=>{ if(!isOpen) e.currentTarget.style.background='#f9f8f5' }}
          onMouseLeave={e=>{ if(!isOpen) e.currentTarget.style.background='white' }}>
          <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:'#f1efe8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:'#5f5e5a', flexShrink:0 }}>
            {(guest.room||guest.name?.[0]||'?').toString().slice(0,3).toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#1a1a18', marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
            <div style={{ display:'flex', gap:'4px', alignItems:'center', flexWrap:'wrap' }}>
              {guest.language && <span style={{ fontSize:'10px', fontWeight:'600', padding:'1px 5px', borderRadius:'4px', background:'#eaf3de', color:'#27500a' }}>{guest.language.toUpperCase()}</span>}
              {conv.status==='escalated' && <span style={{ fontSize:'10px', fontWeight:'600', padding:'1px 5px', borderRadius:'4px', background:'#faeeda', color:'#633806' }}>escalated</span>}
              {openFlags > 0 && <span style={{ fontSize:'10px', fontWeight:'600', color:'#A32D2D' }}>🚩 {openFlags} flag{openFlags!==1?'s':''}</span>}
            </div>
            <div style={{ fontSize:'11px', color:'#888780', marginTop:'1px' }}>{msgs.length} msgs · {botMsgs} bot · {timeLabel}</div>
          </div>
          <span style={{ fontSize:'11px', color:'#b0a99f', flexShrink:0 }}>{isOpen?'▲':'▼'}</span>
        </div>

        {/* Thread */}
        {isOpen && (
          <div style={{ borderTop:'0.5px solid #f1efe8', background:'#f9f8f5' }}>
            <div style={{ padding:'7px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid #f1efe8' }}>
              <span style={{ fontSize:'11px', color:'#888780' }}>{msgs.length} messages</span>
              <button onClick={() => translateConversation(conv)} disabled={!!translating[conv.id]}
                style={{ fontSize:'11px', fontWeight:'500', padding:'3px 8px', borderRadius:'5px', border:'0.5px solid #b5d4f4', background:translations[conv.id]?'#e6f1fb':'white', color:'#0c447c', cursor:'pointer', fontFamily:F }}>
                {translating[conv.id] ? '⏳' : translations[conv.id] ? '🌐 EN · hide' : '🌐 Translate'}
              </button>
            </div>
            <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:'6px', maxHeight:'500px', overflowY:'auto' }}>
              {displayMsgs.map((msg, idx) => {
                const isBot     = msg.role === 'assistant'
                const isFlagged = isMsgFlagged(conv, idx)
                const msgFlag   = getMsgFlag(conv, idx)
                const isHighlit = highlightMsg?.convId===conv.id && highlightMsg?.msgIndex===idx
                const ft        = FLAG_TYPES.find(f=>f.key===msgFlag?.flag_type)
                return (
                  <div key={idx} id={`msg-${conv.id}-${idx}`}
                    style={{ display:'flex', flexDirection:isBot?'row':'row-reverse', gap:'6px', alignItems:'flex-start',
                      ...(isHighlit?{background:'#FEF9C3',borderRadius:'8px',padding:'3px',margin:'-3px'}:{}) }}>
                    <div style={{ maxWidth:'85%' }}>
                      <div style={{ padding:'7px 10px', borderRadius:isBot?'3px 10px 10px 10px':'10px 3px 10px 10px',
                        background:isBot?'white':'#1a3d2e', color:isBot?'#1a1a18':'white',
                        fontSize:'12px', lineHeight:'1.6',
                        border:isBot?`0.5px solid ${isFlagged?'#d3b0b0':'#e0dfd8'}`:'none' }}>
                        {msg.content}
                        {isFlagged && (
                          <div style={{ marginTop:'5px', fontSize:'11px', display:'flex', flexDirection:'column', gap:'3px' }}>
                            <span style={{ color:'#A32D2D', fontWeight:'700' }}>🚩 {ft?.label||'Flagged'}{msgFlag?.note&&` — ${msgFlag.note}`}</span>
                            {msgFlag?.correct_answer && <span style={{ fontSize:'11px', color:'#27500a', background:'#eaf3de', borderRadius:'5px', padding:'3px 7px' }}>✓ {msgFlag.correct_answer}</span>}
                          </div>
                        )}
                      </div>
                      {isBot && !isFlagged && (
                        <button onClick={() => setFlagging({ convId:conv.id, msgIdx:idx, content:msg.content, conv })}
                          style={{ fontSize:'11px', color:'#b0a99f', background:'none', border:'none', cursor:'pointer', padding:'3px 5px', fontFamily:F, marginTop:'1px' }}
                          onMouseEnter={e=>e.currentTarget.style.color='#A32D2D'}
                          onMouseLeave={e=>e.currentTarget.style.color='#b0a99f'}>
                          🚩 Flag
                        </button>
                      )}
                      {isFlagged && (
                        <button onClick={() => resolveFlag(msgFlag.id)}
                          style={{ fontSize:'11px', color:'#27500a', background:'none', border:'none', cursor:'pointer', padding:'3px 5px', fontFamily:F, marginTop:'1px' }}>
                          ✓ Mark resolved
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize:'10px', color:'#b0a99f', marginTop:'5px', flexShrink:0 }}>
                      {msg.ts ? new Date(msg.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:F, background:'#f5f4f0', minHeight:'100%' }}>

      {/* Line 1 — stats summary */}
      <div style={{ background:'white', borderBottom:'0.5px solid #e0dfd8', padding:'8px 16px', display:'flex', alignItems:'center', gap:'10px' }}>
        {(s.unresolvedFlags||0) > 0
          ? <span style={{ fontSize:'13px', color:'#5f5e5a' }}><strong style={{ color:'#A32D2D' }}>🚩 {s.unresolvedFlags} open flag{s.unresolvedFlags!==1?'s':''}</strong> · {s.totalConvs||0} convs · {s.escalationRate||0}% escalation · {s.totalFlags||0} total flags</span>
          : <span style={{ fontSize:'13px', color:'#5f5e5a' }}>✅ No open flags · {s.totalConvs||0} convs · {s.escalationRate||0}% escalation</span>
        }
        <button onClick={() => setStatsOpen(o=>!o)}
          style={{ marginLeft:'auto', fontSize:'11px', color:'#b0a99f', background:'none', border:'none', cursor:'pointer', fontFamily:F }}>
          {statsOpen?'▲ hide':'▼ details'}
        </button>
      </div>

      {/* Stats expanded grid */}
      {statsOpen && (
        <div style={{ background:'white', borderBottom:'0.5px solid #e0dfd8', padding:'8px 16px', display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
          {[
            { label:'Conversations',   value: s.totalConvs||0 },
            { label:'Escalation rate', value:`${s.escalationRate||0}%`, warn:(s.escalationRate||0)>15 },
            { label:'Avg msgs/conv',   value: s.avgMessagesPerConv||0 },
            { label:'Open flags',      value: s.unresolvedFlags||0, warn:(s.unresolvedFlags||0)>0 },
            { label:'Total flags',     value: s.totalFlags||0 },
          ].map(k => (
            <div key={k.label} style={{ background:k.warn?'#FEF2F2':'#f9f8f5', border:`0.5px solid ${k.warn?'#d3b0b0':'#e0dfd8'}`, borderRadius:'8px', padding:'8px 12px' }}>
              <div style={{ fontSize:'11px', color:k.warn?'#A32D2D':'#5f5e5a', marginBottom:'3px', fontWeight:'600' }}>{k.label}</div>
              <div style={{ fontSize:'20px', fontWeight:'700', color:k.warn?'#A32D2D':'#1a1a18' }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Line 2 — ALL filters in one row, no wrap */}
      <div style={{ background:'white', borderBottom:'0.5px solid #e0dfd8', padding:'7px 16px', display:'flex', alignItems:'center', gap:'6px', overflowX:'auto', whiteSpace:'nowrap' }}>
        {[{key:'all',label:'All'},{key:'escalated',label:'Escalated'},{key:'flagged',label:'Flagged'},{key:'booked',label:'Had booking'}].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={FBTN(filter===f.key)}>{f.label}</button>
        ))}
        <span style={{ color:'#d3d1c7', padding:'0 2px', flexShrink:0 }}>|</span>
        <select value={guestType} onChange={e=>setGuestType(e.target.value)} style={SEL}>
          <option value="all">All guests</option>
          <option value="stay">Stay</option>
          <option value="day_visitor">Day visitor</option>
          <option value="prospect">Prospect</option>
        </select>
        <select value={language} onChange={e=>setLanguage(e.target.value)} style={SEL}>
          <option value="all">All languages</option>
          <option value="en">EN</option><option value="es">ES</option><option value="ru">RU</option>
          <option value="he">HE</option><option value="de">DE</option><option value="fr">FR</option>
          <option value="ar">AR</option><option value="zh">ZH</option><option value="el">EL</option>
          <option value="it">IT</option><option value="pt">PT</option><option value="nl">NL</option>
          <option value="pl">PL</option><option value="tr">TR</option><option value="ja">JA</option>
        </select>
        <select value={month} onChange={e=>setMonth(e.target.value)} style={SEL}>
          {MONTH_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
        <div style={{ display:'flex', gap:'5px', marginLeft:'auto', flexShrink:0 }}>
          <input value={searchInput} onChange={e=>setSearchInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') setSearch(searchInput) }}
            placeholder="Search messages…"
            style={{ padding:'5px 10px', border:'0.5px solid #d3d1c7', borderRadius:'6px', fontSize:'12px', fontFamily:F, outline:'none', width:'160px', color:'#1a1a18', background:'white' }}
          />
          {search && <button onClick={()=>{ setSearch(''); setSearchInput('') }} style={{ fontSize:'12px', color:'#888780', background:'none', border:'none', cursor:'pointer', fontFamily:F }}>✕</button>}
        </div>
      </div>

      <div style={{ padding:'10px 16px' }}>

        {/* Flagged panel — white background, only the text is red */}
        {allFlags.length > 0 && (
          <div style={{ border:'0.5px solid #e0dfd8', borderLeft:'3px solid #d3b0b0', borderRadius:'10px', overflow:'hidden', marginBottom:'12px' }}>
            <div style={{ background:'white', padding:'8px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span onClick={() => setFlagPanelOpen(o=>!o)}
                style={{ fontSize:'13px', fontWeight:'600', color:'#A32D2D', cursor:'pointer' }}>
                🚩 {allFlags.length} flagged message{allFlags.length!==1?'s':''} needing review
              </span>
              <button onClick={() => setFlagPanelOpen(o=>!o)}
                style={{ fontSize:'11px', color:'#A32D2D', background:'none', border:'none', cursor:'pointer', fontFamily:F }}>
                {flagPanelOpen?'▲ hide':'▼ show'}
              </button>
              <button onClick={copyAllForClaude}
                style={{ marginLeft:'auto', fontSize:'11px', fontWeight:'600', padding:'4px 10px', borderRadius:'6px', border:'0.5px solid #d3b0b0', background:'white', color:'#A32D2D', cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                📋 Copy all for Claude
              </button>
            </div>

            {flagPanelOpen && allFlags.map((f, fi) => {
              const msgs    = f.conv.messages || []
              const guest   = f.conv.guests || {}
              const flagMsg = msgs[f.message_index]
              const prevMsg = f.message_index > 0 ? msgs[f.message_index-1] : null
              const prev2   = f.message_index > 1 ? msgs[f.message_index-2] : null
              const ft      = FLAG_TYPES.find(t=>t.key===f.flag_type) || FLAG_TYPES[FLAG_TYPES.length-1]
              return (
                <div key={fi} style={{ borderTop:'0.5px solid #fde8e8', padding:'11px 14px', background:'white' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                    <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'4px', background:ft.bg, color:ft.color }}>{ft.label}</span>
                    <span style={{ fontSize:'12px', color:'#5f5e5a' }}>{guest.name||'Guest'}{guest.room?` · Room ${guest.room}`:''}</span>
                    <button onClick={() => openAtFlag(f.conv, f.message_index)}
                      style={{ marginLeft:'auto', fontSize:'11px', fontWeight:'500', padding:'3px 9px', borderRadius:'6px', border:'0.5px solid #b5d4f4', background:'#e6f1fb', color:'#0c447c', cursor:'pointer', fontFamily:F }}>
                      View in conversation ↗
                    </button>
                  </div>
                  {prev2  && <div style={{ fontSize:'11px', color:'#888780', padding:'4px 9px', borderRadius:'6px', background:'#f5f4f0', marginBottom:'3px', lineHeight:'1.5' }}><span style={{ fontWeight:'700', marginRight:'4px' }}>{prev2.role==='user'?'👤':'🤖'}</span>{(prev2.content||'').slice(0,120)}{(prev2.content||'').length>120?'…':''}</div>}
                  {prevMsg && <div style={{ fontSize:'11px', color:'#5f5e5a', padding:'4px 9px', borderRadius:'6px', background:'#f5f4f0', marginBottom:'3px', lineHeight:'1.5' }}><span style={{ fontWeight:'700', marginRight:'4px' }}>{prevMsg.role==='user'?'👤':'🤖'}</span>{(prevMsg.content||'').slice(0,150)}{(prevMsg.content||'').length>150?'…':''}</div>}
                  {flagMsg && <div style={{ fontSize:'12px', padding:'7px 10px', borderRadius:'7px', background:'white', border:'0.5px solid #e0dfd8', lineHeight:'1.6', color:'#1a1a18' }}><span style={{ fontWeight:'700', color:'#A32D2D', marginRight:'5px' }}>🚩 Flagged reply:</span>{(flagMsg.content||'').slice(0,300)}{(flagMsg.content||'').length>300?'…':''}</div>}
                  {(f.note||f.correct_answer) && (
                    <div style={{ marginTop:'6px', fontSize:'11px', color:'#5f5e5a' }}>
                      {f.note && <div>📝 {f.note}</div>}
                      {f.correct_answer && <div style={{ color:'#27500a', marginTop:'2px', background:'#eaf3de', padding:'3px 8px', borderRadius:'5px', display:'inline-block' }}>✓ {f.correct_answer}</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 2-column conversation grid */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#888780', fontSize:'13px' }}>Loading conversations…</div>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#888780', fontSize:'13px' }}>No conversations found</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            {conversations.map(conv => <ConvCard key={conv.id} conv={conv} />)}
          </div>
        )}
      </div>

      {/* Flag modal */}
      {flagging && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, fontFamily:F }}>
          <div style={{ background:'white', borderRadius:'14px', padding:'22px', width:'450px', maxWidth:'90vw' }}>
            <div style={{ fontSize:'15px', fontWeight:'700', color:'#1a1a18', marginBottom:'14px' }}>Flag bot reply</div>
            <div style={{ padding:'10px 12px', background:'#f5f4f0', borderRadius:'8px', fontSize:'12px', color:'#3d3d3a', marginBottom:'14px', lineHeight:'1.6', maxHeight:'80px', overflow:'auto', border:'0.5px solid #e0dfd8' }}>
              {flagging.content}
            </div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#3d3d3a', marginBottom:'7px' }}>Issue type</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'14px' }}>
              {FLAG_TYPES.map(ft => (
                <button key={ft.key} onClick={() => setFlagType(ft.key)}
                  style={{ padding:'5px 12px', borderRadius:'7px', fontSize:'12px', fontWeight:'600', border:`0.5px solid ${flagType===ft.key?ft.color:'#d3d1c7'}`, background:flagType===ft.key?ft.bg:'white', color:flagType===ft.key?ft.color:'#3d3d3a', cursor:'pointer', fontFamily:F }}>
                  {ft.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#3d3d3a', marginBottom:'5px' }}>Note (optional)</div>
            <textarea value={flagNote} onChange={e=>setFlagNote(e.target.value)}
              placeholder="What was wrong with this response?"
              style={{ width:'100%', height:'52px', padding:'9px 11px', border:'0.5px solid #d3d1c7', borderRadius:'8px', fontSize:'12px', fontFamily:F, resize:'none', outline:'none', marginBottom:'10px' }}
            />
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#27500a', marginBottom:'5px' }}>Correct answer (optional)</div>
            <textarea value={correctAnswer} onChange={e=>setCorrectAnswer(e.target.value)}
              placeholder="What should the bot have said instead?"
              style={{ width:'100%', height:'64px', padding:'9px 11px', border:'0.5px solid #9fd4b8', borderRadius:'8px', fontSize:'12px', fontFamily:F, resize:'none', outline:'none', marginBottom:'14px', background:'#f0fdf4' }}
            />
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => { setFlagging(null); setFlagNote(''); setCorrectAnswer('') }}
                style={{ padding:'8px 16px', background:'white', border:'0.5px solid #d3d1c7', borderRadius:'8px', fontSize:'12px', fontWeight:'600', cursor:'pointer', fontFamily:F, color:'#3d3d3a' }}>
                Cancel
              </button>
              <button onClick={() => handleFlag(flagging.conv, flagging.msgIdx, flagging.content)} disabled={saving}
                style={{ padding:'8px 16px', background:'#A32D2D', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:F }}>
                {saving ? 'Saving…' : '🚩 Flag reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
