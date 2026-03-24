// components/BotQA.js
// Bot QA review panel — embedded in Analytics tab
// Manager browses all conversations, flags bad bot replies

'use client'
import { useState, useEffect } from 'react'

const FLAG_TYPES = [
  { key: 'wrong_answer',      label: 'Wrong answer',       color: '#D94040', bg: '#FDEAEA' },
  { key: 'poor_tone',         label: 'Poor tone',          color: '#D97706', bg: '#FEF3C7' },
  { key: 'missed_booking',    label: 'Missed booking',     color: '#9333EA', bg: '#FAF5FF' },
  { key: 'missed_escalation', label: 'Should have escalated', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'other',             label: 'Other issue',        color: '#64748B', bg: '#F1F5F9' },
]

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'flagged',   label: 'Flagged' },
  { key: 'booked',    label: 'Had booking' },
]

export default function BotQA({ hotelId }) {
  const [conversations, setConversations] = useState([])
  const [stats, setStats]                 = useState(null)
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('all')
  const [language, setLanguage]           = useState('all')
  const [search, setSearch]               = useState('')
  const [searchInput, setSearchInput]     = useState('')
  const [selectedConv, setSelectedConv]   = useState(null)
  const [flagging, setFlagging]           = useState(null) // { messageIndex, content }
  const [flagType, setFlagType]           = useState('wrong_answer')
  const [flagNote, setFlagNote]           = useState('')
  const [saving, setSaving]               = useState(false)
  const [month, setMonth]                 = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  })

  useEffect(() => {
    if (!hotelId) return
    loadData()
  }, [hotelId, filter, language, search, month])

  async function loadData() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        hotelId, filter, language, search, month
      })
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          hotelId,
          conversationId: conv.id,
          messageIndex:   msgIdx,
          messageContent: msgContent,
          flagType,
          note: flagNote,
        }),
      })
      setFlagging(null)
      setFlagNote('')
      loadData()
    } finally { setSaving(false) }
  }

  function getConvFlags(conv) {
    return conv.qa_flags || []
  }

  function isMsgFlagged(conv, idx) {
    return getConvFlags(conv).some(f => f.message_index === idx && !f.resolved)
  }

  const s = stats || {}

  return (
    <div style={{ fontFamily:'var(--font)' }}>

      {/* Stats row */}
      {stats && (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'8px',marginBottom:'14px' }}>
          {[
            { label:'Total conversations', value: s.totalConvs || 0 },
            { label:'Escalation rate',     value: `${s.escalationRate || 0}%`, warn: (s.escalationRate||0) > 15 },
            { label:'Avg messages/conv',   value: s.avgMessagesPerConv || 0 },
            { label:'Bot messages',        value: s.botMessages || 0 },
            { label:'Open flags',          value: s.unresolvedFlags || 0, warn: (s.unresolvedFlags||0) > 0 },
            { label:'Total flags',         value: s.totalFlags || 0 },
          ].map(k => (
            <div key={k.label} style={{ background:k.warn?'rgba(217,64,64,0.05)':'var(--color-background-secondary)',border:`0.5px solid ${k.warn?'rgba(217,64,64,0.2)':'var(--color-border-tertiary)'}`,borderRadius:'var(--border-radius-lg)',padding:'8px 10px' }}>
              <div style={{ fontSize:'9px',color:'var(--color-text-tertiary)',marginBottom:'3px' }}>{k.label}</div>
              <div style={{ fontSize:'18px',fontWeight:'500',color:k.warn?'#D94040':'var(--color-text-primary)',lineHeight:1 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Flag type breakdown */}
      {s.flagsByType && Object.keys(s.flagsByType).length > 0 && (
        <div style={{ display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px' }}>
          {Object.entries(s.flagsByType).map(([type, count]) => {
            const ft = FLAG_TYPES.find(f => f.key === type) || FLAG_TYPES[4]
            return (
              <div key={type} style={{ fontSize:'10px',fontWeight:'500',padding:'3px 9px',borderRadius:'20px',background:ft.bg,color:ft.color }}>
                {ft.label}: {count}
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex',gap:'8px',alignItems:'center',marginBottom:'12px',flexWrap:'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding:'4px 12px',borderRadius:'20px',fontSize:'11px',border:'0.5px solid',borderColor:filter===f.key?'var(--green-800)':'var(--color-border-secondary)',background:filter===f.key?'var(--green-800)':'white',color:filter===f.key?'white':'var(--color-text-secondary)',cursor:'pointer',fontFamily:'var(--font)' }}>
            {f.label}
          </button>
        ))}

        {/* Language */}
        <select value={language} onChange={e=>setLanguage(e.target.value)}
          style={{ padding:'4px 10px',borderRadius:'20px',fontSize:'11px',border:'0.5px solid var(--color-border-secondary)',background:'white',color:'var(--color-text-secondary)',cursor:'pointer',fontFamily:'var(--font)',outline:'none' }}>
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="ru">Russian</option>
          <option value="he">Hebrew</option>
        </select>

        {/* Month */}
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
          style={{ padding:'4px 10px',border:'0.5px solid var(--color-border-secondary)',borderRadius:'20px',fontSize:'11px',fontFamily:'var(--font)',outline:'none',color:'var(--color-text-secondary)' }}
        />

        {/* Search */}
        <div style={{ display:'flex',gap:'5px',marginLeft:'auto' }}>
          <input value={searchInput} onChange={e=>setSearchInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') setSearch(searchInput) }}
            placeholder="Search in messages..."
            style={{ padding:'4px 10px',border:'0.5px solid var(--color-border-secondary)',borderRadius:'20px',fontSize:'11px',fontFamily:'var(--font)',outline:'none',width:'180px',color:'var(--color-text-primary)' }}
          />
          {search && (
            <button onClick={()=>{ setSearch(''); setSearchInput('') }}
              style={{ padding:'4px 10px',borderRadius:'20px',fontSize:'11px',border:'0.5px solid var(--color-border-secondary)',background:'white',color:'var(--color-text-secondary)',cursor:'pointer',fontFamily:'var(--font)' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Conversations list */}
      {loading ? (
        <div style={{ textAlign:'center',padding:'30px',color:'var(--color-text-tertiary)',fontSize:'12px' }}>Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div style={{ textAlign:'center',padding:'30px',color:'var(--color-text-tertiary)',fontSize:'12px' }}>No conversations found</div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
          {conversations.map(conv => {
            const guest    = conv.guests || {}
            const msgs     = conv.messages || []
            const flags    = getConvFlags(conv)
            const isOpen   = selectedConv === conv.id
            const langColors = { en:{bg:'#F0FDF4',color:'#16A34A'}, ru:{bg:'#EFF6FF',color:'#2563EB'}, he:{bg:'#FEF3C7',color:'#D97706'} }
            const lc = langColors[guest.language] || langColors.en
            const botMsgs  = msgs.filter(m => m.role === 'assistant').length
            const minsAgo  = Math.floor((Date.now() - new Date(conv.last_message_at)) / 60000)
            const timeLabel = minsAgo < 60 ? `${minsAgo}m ago` : minsAgo < 1440 ? `${Math.floor(minsAgo/60)}h ago` : `${Math.floor(minsAgo/1440)}d ago`

            return (
              <div key={conv.id} style={{ background:'white',border:`0.5px solid ${flags.length>0?'rgba(217,64,64,0.3)':'var(--color-border-tertiary)'}`,borderRadius:'var(--border-radius-lg)',overflow:'hidden' }}>

                {/* Conversation header */}
                <div
                  onClick={() => setSelectedConv(isOpen ? null : conv.id)}
                  style={{ padding:'11px 14px',display:'flex',alignItems:'center',gap:'10px',cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--color-background-secondary)'}
                  onMouseLeave={e=>e.currentTarget.style.background='white'}
                >
                  {/* Anonymised avatar */}
                  <div style={{ width:'32px',height:'32px',borderRadius:'50%',background:'var(--color-background-tertiary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',color:'var(--color-text-tertiary)',fontWeight:'500',flexShrink:0 }}>
                    {guest.room || '?'}
                  </div>

                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:'7px' }}>
                      {/* Anonymised — show room only, not name */}
                      <div style={{ fontSize:'12px',fontWeight:'500',color:'var(--color-text-primary)' }}>
                        Room {guest.room || '?'}
                      </div>
                      <span style={{ fontSize:'9px',fontWeight:'700',padding:'1px 5px',borderRadius:'4px',background:lc.bg,color:lc.color }}>
                        {(guest.language||'EN').toUpperCase()}
                      </span>
                      {conv.status === 'escalated' && (
                        <span style={{ fontSize:'9px',fontWeight:'700',padding:'1px 5px',borderRadius:'4px',background:'#FDEAEA',color:'#D94040' }}>escalated</span>
                      )}
                      {flags.length > 0 && (
                        <span style={{ fontSize:'9px',fontWeight:'700',padding:'1px 5px',borderRadius:'4px',background:'#FDEAEA',color:'#D94040' }}>
                          {flags.filter(f=>!f.resolved).length} flag{flags.filter(f=>!f.resolved).length!==1?'s':''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:'10px',color:'var(--color-text-tertiary)',marginTop:'2px' }}>
                      {msgs.length} messages · {botMsgs} bot replies · {timeLabel}
                      {guest.check_in && ` · Stay: ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                    </div>
                  </div>

                  <div style={{ fontSize:'11px',color:'var(--color-text-tertiary)' }}>
                    {isOpen ? '▲' : '▼'}
                  </div>
                </div>

                {/* Expanded conversation thread */}
                {isOpen && (
                  <div style={{ borderTop:'0.5px solid var(--color-border-tertiary)',padding:'12px 14px',background:'var(--color-background-secondary)',display:'flex',flexDirection:'column',gap:'6px' }}>

                    {msgs.map((msg, idx) => {
                      const isBot    = msg.role === 'assistant'
                      const isFlagged = isMsgFlagged(conv, idx)
                      const msgFlag  = getConvFlags(conv).find(f => f.message_index === idx)

                      return (
                        <div key={idx} style={{ display:'flex',gap:'8px',alignItems:'flex-start',flexDirection:isBot?'row':'row-reverse' }}>

                          {/* Message bubble */}
                          <div style={{ maxWidth:'70%' }}>
                            <div style={{
                              padding:'8px 11px',
                              borderRadius: isBot ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                              background: isBot ? 'white' : '#1C3D2E',
                              color: isBot ? 'var(--color-text-primary)' : 'white',
                              fontSize:'11px', lineHeight:'1.5',
                              border: isBot ? `0.5px solid ${isFlagged?'rgba(217,64,64,0.4)':'var(--color-border-tertiary)'}` : 'none',
                              position:'relative',
                            }}>
                              {msg.content}
                              {isFlagged && (
                                <div style={{ marginTop:'5px',fontSize:'9px',color:'#D94040',fontWeight:'600' }}>
                                  🚩 {FLAG_TYPES.find(f=>f.key===msgFlag?.flag_type)?.label || 'Flagged'}
                                  {msgFlag?.note && ` — ${msgFlag.note}`}
                                </div>
                              )}
                            </div>

                            {/* Flag button — only on bot messages */}
                            {isBot && !isFlagged && (
                              <button
                                onClick={() => setFlagging({ convId: conv.id, msgIdx: idx, content: msg.content, conv })}
                                style={{ fontSize:'9px',color:'var(--color-text-tertiary)',background:'none',border:'none',cursor:'pointer',padding:'3px 6px',fontFamily:'var(--font)',marginTop:'2px' }}
                                onMouseEnter={e=>e.currentTarget.style.color='#D94040'}
                                onMouseLeave={e=>e.currentTarget.style.color='var(--color-text-tertiary)'}
                              >
                                🚩 Flag this reply
                              </button>
                            )}
                          </div>

                          <div style={{ fontSize:'9px',color:'var(--color-text-tertiary)',marginTop:'4px',flexShrink:0 }}>
                            {new Date(msg.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Flag modal */}
      {flagging && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,fontFamily:'var(--font)' }}>
          <div style={{ background:'white',borderRadius:'var(--border-radius-lg)',padding:'20px',width:'420px',maxWidth:'90vw' }}>
            <div style={{ fontSize:'14px',fontWeight:'500',color:'var(--color-text-primary)',marginBottom:'14px' }}>Flag bot reply</div>

            {/* Message preview */}
            <div style={{ padding:'10px',background:'var(--color-background-secondary)',borderRadius:'var(--border-radius-md)',fontSize:'11px',color:'var(--color-text-secondary)',marginBottom:'14px',lineHeight:'1.5',maxHeight:'80px',overflow:'auto' }}>
              {flagging.content}
            </div>

            {/* Flag type */}
            <div style={{ fontSize:'10px',color:'var(--color-text-tertiary)',marginBottom:'6px',fontWeight:'500' }}>Issue type</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'12px' }}>
              {FLAG_TYPES.map(ft => (
                <button key={ft.key} onClick={() => setFlagType(ft.key)}
                  style={{ padding:'4px 10px',borderRadius:'var(--border-radius-sm)',fontSize:'10px',border:'0.5px solid',borderColor:flagType===ft.key?ft.color:'var(--color-border-secondary)',background:flagType===ft.key?ft.bg:'white',color:flagType===ft.key?ft.color:'var(--color-text-secondary)',cursor:'pointer',fontFamily:'var(--font)' }}>
                  {ft.label}
                </button>
              ))}
            </div>

            {/* Note */}
            <div style={{ fontSize:'10px',color:'var(--color-text-tertiary)',marginBottom:'5px',fontWeight:'500' }}>Note (optional)</div>
            <textarea value={flagNote} onChange={e=>setFlagNote(e.target.value)}
              placeholder="What was wrong? What should the bot have said?"
              style={{ width:'100%',height:'60px',padding:'8px 10px',border:'0.5px solid var(--color-border-secondary)',borderRadius:'var(--border-radius-md)',fontSize:'11px',fontFamily:'var(--font)',resize:'none',outline:'none',marginBottom:'14px' }}
            />

            <div style={{ display:'flex',gap:'8px',justifyContent:'flex-end' }}>
              <button onClick={() => { setFlagging(null); setFlagNote('') }}
                style={{ padding:'7px 14px',background:'white',border:'0.5px solid var(--color-border-secondary)',borderRadius:'var(--border-radius-sm)',fontSize:'11px',cursor:'pointer',fontFamily:'var(--font)' }}>
                Cancel
              </button>
              <button onClick={() => handleFlag(flagging.conv, flagging.msgIdx, flagging.content)}
                disabled={saving}
                style={{ padding:'7px 14px',background:'#D94040',border:'none',borderRadius:'var(--border-radius-sm)',fontSize:'11px',fontWeight:'500',color:'white',cursor:'pointer',fontFamily:'var(--font)' }}>
                {saving ? 'Saving...' : '🚩 Flag reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
