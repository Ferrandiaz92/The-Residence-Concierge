// components/BotQA.js (typography fix — bigger fonts everywhere)
'use client'
import { useState, useEffect } from 'react'

const FLAG_TYPES = [
  { key:'wrong_answer',      label:'Wrong answer',          color:'#DC2626', bg:'#FEE2E2' },
  { key:'poor_tone',         label:'Poor tone',             color:'#D97706', bg:'#FEF3C7' },
  { key:'missed_booking',    label:'Missed booking',        color:'#7C3AED', bg:'#FAF5FF' },
  { key:'missed_escalation', label:'Should have escalated', color:'#2563EB', bg:'#DBEAFE' },
  { key:'other',             label:'Other issue',           color:'#374151', bg:'#F3F4F6' },
]

const FILTERS = [
  { key:'all',       label:'All' },
  { key:'escalated', label:'Escalated' },
  { key:'flagged',   label:'Flagged' },
  { key:'booked',    label:'Had booking' },
]


// English month options for period selector
const MONTH_OPTIONS = (() => {
  const opts = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    opts.push({ val, label })
  }
  return opts
})()

export default function BotQA({ hotelId }) {
  const [conversations, setConversations] = useState([])
  const [stats, setStats]                 = useState(null)
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('all')
  const [language, setLanguage]           = useState('all')
  const [guestType, setGuestType]         = useState('all')
  const [search, setSearch]               = useState('')
  const [searchInput, setSearchInput]     = useState('')
  const [selectedConv, setSelectedConv]   = useState(null)
  const [flagging, setFlagging]           = useState(null)
  const [flagType, setFlagType]           = useState('wrong_answer')
  const [flagNote, setFlagNote]           = useState('')
  const [saving, setSaving]               = useState(false)
  const [correctAnswer, setCorrectAnswer]  = useState('')
  const [translating, setTranslating]      = useState({})
  const [translations, setTranslations]    = useState({})
  const [expandedConv, setExpandedConv]    = useState(null)
  const [highlightMsg, setHighlightMsg]    = useState(null)
  const [flagPanelOpen, setFlagPanelOpen]  = useState(true)
  const [month, setMonth]                 = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  })

  useEffect(() => {
    if (!hotelId) return
    loadData()
  }, [hotelId, filter, language, search, month, guestType])

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

  async function handleFlag(conv, msgIdx, msgContent) {
    setSaving(true)
    try {
      await fetch('/api/flag', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ hotelId, conversationId:conv.id, messageIndex:msgIdx, messageContent:msgContent, flagType, note:flagNote, correctAnswer }),
      })
      setFlagging(null); setFlagNote(''); setCorrectAnswer('')
      loadData()
    } finally { setSaving(false) }
  }

  function openAtFlag(conv, msgIndex) {
    setSelectedConv(conv.id)
    setHighlightMsg({ convId: conv.id, msgIndex })
    setTimeout(() => {
      const el = document.getElementById(`msg-${conv.id}-${msgIndex}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
  }

  async function translateConversation(conv) {
    if (translations[conv.id]) {
      // Toggle off if already translated
      setTranslations(t => { const n = {...t}; delete n[conv.id]; return n })
      return
    }
    setTranslating(t => ({ ...t, [conv.id]: true }))
    try {
      const msgs = conv.messages || []
      const lang = conv.guests?.language || 'en'
      const sampleText = msgs.filter(m => m.role === 'user').slice(-3).map(m => m.content || '').join(' ')
      const sampleHasNonEnglish = /[àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿЀ-ӿ֐-׿؀-ۿ一-鿿Ͱ-Ͽ]/i.test(sampleText) ||
        /(hola|gracias|buenos|bonjour|merci|bitte|danke|ciao|grazie|olá|obrigado)/i.test(sampleText)
      // If stored as English but button was shown (content detection triggered),
      // still attempt translation — Claude will return as-is if already English
      if (lang === 'en' && !sampleHasNonEnglish) {
        setTranslations(t => ({ ...t, [conv.id]: msgs }))
        return
      }
      // Build a compact transcript for Claude to translate
      const transcript = msgs.map((m, i) =>
        `[${i}] ${m.role === 'assistant' ? 'BOT' : 'GUEST'}: ${m.content}`
      ).join('\n\n')

      // Route through server API — browser can't call Anthropic directly (CORS + key exposure)
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, lang })
      })
      if (!res.ok) throw new Error(`Translation API error: ${res.status}`)
      const data = await res.json()
      const translated = data.translated || ''

      // Parse translated lines back into message objects
      const lines = translated.split('\n\n').filter(Boolean)
      const translatedMsgs = msgs.map((orig, i) => {
        const line = lines.find(l => l.startsWith(`[${i}]`))
        if (!line) return orig
        const colonIdx = line.indexOf(':')
        const translatedContent = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : orig.content
        return { ...orig, content: translatedContent }
      })
      setTranslations(t => ({ ...t, [conv.id]: translatedMsgs }))
    } catch(e) {
      console.error('Translation failed:', e)
    } finally {
      setTranslating(t => { const n = {...t}; delete n[conv.id]; return n })
    }
  }

  function isMsgFlagged(conv, idx) {
    return (conv.qa_flags||[]).some(f => f.message_index === idx && !f.resolved)
  }

  function getMsgFlag(conv, idx) {
    return (conv.qa_flags||[]).find(f => f.message_index === idx)
  }

  const s = stats || {}

  const filterBtn = (key, label, active, onClick) => (
    <button onClick={onClick}
      style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:active?'700':'500', border:`1px solid ${active?'#1C3D2E':'#D1D5DB'}`, background:active?'#1C3D2E':'white', color:active?'white':'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
      {label}
    </button>
  )

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>

      {/* Stats row — hidden when a conv is expanded full-screen */}
      {stats && !expandedConv && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'10px', marginBottom:'18px' }}>
          {[
            { label:'Total conversations', value: s.totalConvs || 0 },
            { label:'Escalation rate',     value:`${s.escalationRate || 0}%`, warn:(s.escalationRate||0) > 15 },
            { label:'Avg messages/conv',   value: s.avgMessagesPerConv || 0 },
            { label:'Bot messages',        value: s.botMessages || 0 },
            { label:'Open flags',          value: s.unresolvedFlags || 0, warn:(s.unresolvedFlags||0) > 0 },
            { label:'Total flags',         value: s.totalFlags || 0 },
          ].map(k => (
            <div key={k.label} style={{ background:k.warn?'#FEE2E2':'white', border:`1px solid ${k.warn?'#FCA5A5':'#E5E7EB'}`, borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ fontSize:'12px', color:k.warn?'#991B1B':'#6B7280', marginBottom:'6px', fontWeight:'600' }}>{k.label}</div>
              <div style={{ fontSize:'24px', fontWeight:'700', color:k.warn?'#DC2626':'#111827', lineHeight:1 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Flag breakdown */}
      {!expandedConv && s.flagsByType && Object.keys(s.flagsByType).length > 0 && (
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'16px' }}>
          {Object.entries(s.flagsByType).map(([type, count]) => {
            const ft = FLAG_TYPES.find(f => f.key === type) || FLAG_TYPES[4]
            return (
              <div key={type} style={{ fontSize:'13px', fontWeight:'600', padding:'5px 12px', borderRadius:'20px', background:ft.bg, color:ft.color }}>
                {ft.label}: {count}
              </div>
            )
          })}
        </div>
      )}

      {/* Filters row */}
      <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'16px', flexWrap:'wrap' }}>
        {/* Filter buttons */}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {FILTERS.map(f => filterBtn(f.key, f.label, filter===f.key, ()=>setFilter(f.key)))}
        </div>

        {/* Language selector */}
        <select value={guestType} onChange={e=>setGuestType(e.target.value)}
          style={{ padding:'8px 12px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', color:'#374151', background:'white', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
          <option value="all">All guest types</option>
          <option value="stay">🛏️ Stay guests</option>
          <option value="day_visitor">☀️ Day visitors</option>
          <option value="event">🎭 Event guests</option>
          <option value="prospect">🔍 Prospects</option>
          <option value="member">⭐ Members</option>
        </select>

        <select value={language} onChange={e=>setLanguage(e.target.value)}
          style={{ padding:'8px 12px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', color:'#374151', background:'white', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="ru">Russian</option>
          <option value="he">Hebrew</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="zh">Chinese</option>
          <option value="pl">Polish</option>
          <option value="sv">Swedish</option>
          <option value="fi">Finnish</option>
          <option value="uk">Ukrainian</option>
          <option value="ar">Arabic</option>
          <option value="nl">Dutch</option>
          <option value="el">Greek</option>
          <option value="es">Spanish</option>
          <option value="ca">Catalan</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="other">Others</option>
        </select>

        {/* Month */}
        <select value={month} onChange={e=>setMonth(e.target.value)}
          style={{ padding:'8px 12px', border:'1px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', color:'#374151', background:'white', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
          {MONTH_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>

        {/* Search */}
        <div style={{ display:'flex', gap:'6px', marginLeft:'auto' }}>
          <input value={searchInput} onChange={e=>setSearchInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') setSearch(searchInput) }}
            placeholder="Search in messages..."
            style={{ padding:'8px 14px', border:'1px solid #D1D5DB', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", outline:'none', width:'200px', color:'#111827' }}
          />
          {search && (
            <button onClick={()=>{ setSearch(''); setSearchInput('') }}
              style={{ padding:'8px 14px', borderRadius:'8px', fontSize:'13px', border:'1px solid #D1D5DB', background:'white', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Conversations */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'14px' }}>Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'14px' }}>No conversations found</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {/* ── FLAGGED MESSAGES PANEL ── */}
          {(() => {
            const allFlags = conversations.flatMap(conv =>
              (conv.qa_flags || []).filter(f => !f.resolved).map(f => ({ ...f, conv }))
            )
            if (allFlags.length === 0) return null
            return (
              <div style={{ border:'1.5px solid #FCA5A5', borderRadius:'12px', overflow:'hidden', marginBottom:'8px' }}>
                <div onClick={() => setFlagPanelOpen(o => !o)}
                  style={{ background:'#FEF2F2', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}>
                  <span style={{ fontSize:'13px', fontWeight:'700', color:'#991B1B' }}>
                    🚩 {allFlags.length} flagged message{allFlags.length !== 1 ? 's' : ''} needing review
                  </span>
                  <span style={{ fontSize:'11px', color:'#DC2626' }}>{flagPanelOpen ? '▲ Hide' : '▼ Show'}</span>
                </div>
                {flagPanelOpen && allFlags.map((f, fi) => {
                  const conv   = f.conv
                  const msgs   = conv.messages || []
                  const msgIdx = f.message_index
                  const flagMsg = msgs[msgIdx]
                  const prevMsg = msgIdx > 0 ? msgs[msgIdx - 1] : null
                  const prev2   = msgIdx > 1 ? msgs[msgIdx - 2] : null
                  const ft     = FLAG_TYPES.find(t => t.key === f.flag_type) || FLAG_TYPES[FLAG_TYPES.length-1]
                  const guest  = conv.guests || {}
                  return (
                    <div key={fi} style={{ borderTop: fi > 0 ? '1px solid #FEE2E2' : 'none', padding:'14px 16px', background:'white' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <span style={{ fontSize:'11px', fontWeight:'700', padding:'2px 8px', borderRadius:'5px', background:ft.bg, color:ft.color }}>{ft.label}</span>
                          <span style={{ fontSize:'12px', color:'#6B7280' }}>{guest.name || 'Guest'}{guest.room ? ` · Room ${guest.room}` : ''}</span>
                        </div>
                        <button onClick={() => openAtFlag(conv, msgIdx)}
                          style={{ fontSize:'11px', fontWeight:'600', padding:'3px 10px', borderRadius:'6px', border:'0.5px solid #93C5FD', background:'#DBEAFE', color:'#1E3A5F', cursor:'pointer' }}>
                          View in conversation ↗
                        </button>
                      </div>
                      {prev2 && <div style={{ fontSize:'12px', color:'#9CA3AF', padding:'6px 10px', borderRadius:'8px', background:'#F9FAFB', marginBottom:'4px', lineHeight:'1.5' }}>
                        <span style={{ fontWeight:'600', marginRight:'4px' }}>{prev2.role === 'user' ? '👤' : '🤖'}</span>
                        {(prev2.content||'').slice(0,120)}{(prev2.content||'').length>120?'…':''}
                      </div>}
                      {prevMsg && <div style={{ fontSize:'12px', color:'#6B7280', padding:'6px 10px', borderRadius:'8px', background:'#F9FAFB', marginBottom:'4px', lineHeight:'1.5' }}>
                        <span style={{ fontWeight:'600', marginRight:'4px' }}>{prevMsg.role === 'user' ? '👤' : '🤖'}</span>
                        {(prevMsg.content||'').slice(0,150)}{(prevMsg.content||'').length>150?'…':''}
                      </div>}
                      {flagMsg && <div style={{ fontSize:'12px', padding:'8px 10px', borderRadius:'8px', background:'#FEF2F2', border:'1px solid #FCA5A5', lineHeight:'1.6', marginTop:'2px' }}>
                        <span style={{ fontWeight:'700', color:'#DC2626', marginRight:'6px' }}>🚩 Flagged reply:</span>
                        <span style={{ color:'#111827' }}>{(flagMsg.content||'').slice(0,300)}{(flagMsg.content||'').length>300?'…':''}</span>
                      </div>}
                      {(f.note||f.correct_answer) && <div style={{ marginTop:'8px', fontSize:'11px', color:'#6B7280' }}>
                        {f.note && <div>📝 {f.note}</div>}
                        {f.correct_answer && <div style={{ color:'#14532D', marginTop:'2px' }}>✓ Correct: {f.correct_answer}</div>}
                      </div>}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* ── CONVERSATION LIST ── */}
          {conversations.map(conv => {
            const guest    = conv.guests || {}
            const msgs     = conv.messages || []
            const flags    = conv.qa_flags || []
            const isOpen   = selectedConv === conv.id
            const langColors = { en:{bg:'#DCFCE7',color:'#14532D'}, ru:{bg:'#DBEAFE',color:'#1E3A5F'}, he:{bg:'#FEF3C7',color:'#78350F'} }
            const lc       = langColors[guest.language] || langColors.en
            const botMsgs  = msgs.filter(m => m.role === 'assistant').length
            const minsAgo  = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
            const timeLabel = minsAgo < 60 ? `${minsAgo}m ago` : minsAgo < 1440 ? `${Math.floor(minsAgo/60)}h ago` : `${Math.floor(minsAgo/1440)}d ago`
            const openFlags = flags.filter(f=>!f.resolved).length

            return (
              <div key={conv.id} style={{ background:'white', border:`1px solid ${openFlags>0?'#FCA5A5':'#E5E7EB'}`, borderRadius:'12px', overflow:'hidden' }}>

                {/* Header row */}
                <div onClick={() => setSelectedConv(isOpen ? null : conv.id)}
                  style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                  onMouseLeave={e=>e.currentTarget.style.background='white'}
                >
                  <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#6B7280', fontWeight:'700', flexShrink:0 }}>
                    {guest.room || (guest.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                      <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>
                        {guest.room
                          ? `Room ${guest.room}`
                          : guest.name
                            ? guest.name + (guest.surname ? ' ' + guest.surname : '')
                            : guest.guest_type === 'prospect' ? 'Prospect'
                            : guest.guest_type === 'day_visitor' ? 'Day Visitor'
                            : guest.guest_type === 'event' ? 'Event Guest'
                            : 'Visitor'
                        }
                      </div>
                      <span style={{ fontSize:'11px', fontWeight:'700', padding:'2px 8px', borderRadius:'5px', background:lc.bg, color:lc.color }}>
                        {(guest.language||'EN').toUpperCase()}
                      </span>
                      {conv.status === 'escalated' && (
                        <span style={{ fontSize:'11px', fontWeight:'700', padding:'2px 8px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626' }}>escalated</span>
                      )}
                      {openFlags > 0 && (
                        <span style={{ fontSize:'11px', fontWeight:'700', padding:'2px 8px', borderRadius:'5px', background:'#FEE2E2', color:'#DC2626' }}>
                          🚩 {openFlags} flag{openFlags!==1?'s':''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:'13px', color:'#6B7280', fontWeight:'500' }}>
                      {msgs.length} messages · {botMsgs} bot replies · {timeLabel}
                      {guest.check_in && ` · Stay: ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                    </div>
                  </div>
                  <div style={{ fontSize:'14px', color:'#9CA3AF', fontWeight:'500' }}>{isOpen ? '▲' : '▼'}</div>
                </div>

                {/* Thread */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid #F3F4F6', background:'#F9FAFB' }}>

                    {/* Thread toolbar */}
                    <div style={{ padding:'8px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid #E5E7EB' }}>
                      <span style={{ fontSize:'12px', color:'#9CA3AF' }}>{msgs.length} messages</span>
                      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                        <button onClick={() => setExpandedConv(expandedConv === conv.id ? null : conv.id)}
                          style={{ fontSize:'12px', fontWeight:'600', padding:'4px 10px', borderRadius:'7px', border:'0.5px solid #D1D5DB', background:'white', color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          {expandedConv === conv.id ? '⊡ Collapse' : '⊞ Expand'}
                        </button>
                        {(() => {
                          const storedLang = conv.guests?.language
                          // Detect language from actual message content — more reliable than stored field
                          // which may be stale (e.g. guest started in EN then switched to ES)
                          const guestMsgs = msgs.filter(m => m.role === 'user').slice(-3)
                          const sampleText = guestMsgs.map(m => m.content || '').join(' ')
                          // Check for non-English markers: accented chars, non-Latin scripts, or common words
                          const hasNonEnglish = /[àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿЀ-ӿ֐-׿؀-ۿ一-鿿Ͱ-Ͽ]/i.test(sampleText)
                          const hasSpanish = /(hola|gracias|buenos|días|noches|por favor|cómo|cuándo|habitación|sí|también|quiero|necesito|puedo)/i.test(sampleText)
                          const hasOtherLatin = /(bonjour|merci|bitte|danke|grazie|obrigado|hej|tack|proszę|dziękuję)/i.test(sampleText)
                          const showTranslate = true // always show — guest may write in any language
                          return (
                            <button
                              onClick={() => translateConversation(conv)}
                              disabled={!!translating[conv.id]}
                              style={{ fontSize:'12px', fontWeight:'600', padding:'4px 12px', borderRadius:'7px', border:'0.5px solid #93C5FD', background: translations[conv.id] ? '#DBEAFE' : 'white', color:'#1E3A5F', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
                              {translating[conv.id] ? '⏳ Translating...' : translations[conv.id] ? '🌐 EN · Hide' : '🌐 Translate to English'}
                            </button>
                          )
                        })()}
                      </div>
                    </div>

                    {/* Scrollable message list */}
                    <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'8px', maxHeight: expandedConv === conv.id ? 'calc(100vh - 180px)' : '420px', overflowY:'auto' }}>
                    {(translations[conv.id] || msgs).map((msg, idx) => {
                      const isBot    = msg.role === 'assistant'
                      const isFlagged = isMsgFlagged(conv, idx)
                      const msgFlag  = getMsgFlag(conv, idx)

                      const isHighlighted = highlightMsg?.convId === conv.id && highlightMsg?.msgIndex === idx
                      return (
                        <div key={idx} id={`msg-${conv.id}-${idx}`}
                          style={{ display:'flex', gap:'10px', alignItems:'flex-start', flexDirection:isBot?'row':'row-reverse',
                            ...(isHighlighted ? { background:'#FEF9C3', borderRadius:'10px', padding:'4px', margin:'-4px' } : {}) }}>
                          <div style={{ maxWidth:'70%' }}>
                            <div style={{ padding:'10px 14px', borderRadius:isBot?'4px 14px 14px 14px':'14px 4px 14px 14px', background:isBot?'white':'#1C3D2E', color:isBot?'#111827':'white', fontSize:'13px', lineHeight:'1.6', border:isBot?`1px solid ${isFlagged?'#FCA5A5':'#E5E7EB'}`:'none' }}>
                              {msg.content}
                              {isFlagged && (
                                <div style={{ marginTop:'6px', fontSize:'12px', color:'#DC2626', fontWeight:'600', display:'flex', flexDirection:'column', gap:'3px' }}>
                                  <span>🚩 {FLAG_TYPES.find(f=>f.key===msgFlag?.flag_type)?.label || 'Flagged'}{msgFlag?.note && ` — ${msgFlag.note}`}</span>
                                  {msgFlag?.correct_answer && (
                                    <span style={{ fontSize:'12px', color:'#16A34A', fontWeight:'600', background:'#DCFCE7', borderRadius:'6px', padding:'4px 8px', marginTop:'3px' }}>
                                      ✓ Correct answer: {msgFlag.correct_answer}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {isBot && !isFlagged && (
                              <button onClick={() => setFlagging({ convId:conv.id, msgIdx:idx, content:msg.content, conv })}
                                style={{ fontSize:'12px', color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:'4px 6px', fontFamily:"'DM Sans',sans-serif", marginTop:'3px', fontWeight:'500' }}
                                onMouseEnter={e=>e.currentTarget.style.color='#DC2626'}
                                onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}
                              >
                                🚩 Flag this reply
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px', flexShrink:0, fontWeight:'500' }}>
                            {new Date(msg.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Flag modal */}
      {flagging && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{ background:'white', borderRadius:'16px', padding:'24px', width:'460px', maxWidth:'90vw' }}>
            <div style={{ fontSize:'16px', fontWeight:'700', color:'#111827', marginBottom:'16px' }}>Flag bot reply</div>
            <div style={{ padding:'12px 14px', background:'#F9FAFB', borderRadius:'10px', fontSize:'13px', color:'#374151', marginBottom:'16px', lineHeight:'1.6', maxHeight:'90px', overflow:'auto', border:'1px solid #E5E7EB' }}>
              {flagging.content}
            </div>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'8px' }}>Issue type</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'16px' }}>
              {FLAG_TYPES.map(ft => (
                <button key={ft.key} onClick={() => setFlagType(ft.key)}
                  style={{ padding:'6px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:'600', border:`1px solid ${flagType===ft.key?ft.color:'#D1D5DB'}`, background:flagType===ft.key?ft.bg:'white', color:flagType===ft.key?ft.color:'#374151', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {ft.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'6px' }}>Note (optional)</div>
            <textarea value={flagNote} onChange={e=>setFlagNote(e.target.value)}
              placeholder="What was wrong with this response?"
              style={{ width:'100%', height:'56px', padding:'10px 12px', border:'1px solid #D1D5DB', borderRadius:'10px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", resize:'none', outline:'none', marginBottom:'12px' }}
            />
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#16A34A', marginBottom:'6px' }}>Correct answer (optional but valuable)</div>
            <textarea value={correctAnswer} onChange={e=>setCorrectAnswer(e.target.value)}
              placeholder="What should the bot have said instead? This trains future responses."
              style={{ width:'100%', height:'72px', padding:'10px 12px', border:'1px solid #86EFAC', borderRadius:'10px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", resize:'none', outline:'none', marginBottom:'16px', background:'#F0FDF4' }}
            />
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={() => { setFlagging(null); setFlagNote(''); setCorrectAnswer('') }}
                style={{ padding:'9px 18px', background:'white', border:'1px solid #D1D5DB', borderRadius:'10px', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", color:'#374151' }}>
                Cancel
              </button>
              <button onClick={() => handleFlag(flagging.conv, flagging.msgIdx, flagging.content)} disabled={saving}
                style={{ padding:'9px 18px', background:'#DC2626', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'700', color:'white', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {saving ? 'Saving...' : '🚩 Flag reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
