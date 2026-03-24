// components/ScheduledTab.js
// Shows scheduled message status for all guests
// Manager can see what's been sent, pending, skipped

'use client'
import { useState, useEffect } from 'react'

const MESSAGE_TYPES = [
  { key:'pre_checkin_7d',  label:'7 days before',    icon:'📅', color:'#7C3AED', bg:'#FAF5FF' },
  { key:'pre_checkin_24h', label:'24h before',        icon:'⏰', color:'#2563EB', bg:'#DBEAFE' },
  { key:'day1_upsell',     label:'Day 1 morning',     icon:'☀️', color:'#D97706', bg:'#FEF3C7' },
  { key:'midstay_upsell',  label:'Mid-stay',          icon:'🌴', color:'#0F766E', bg:'#CCFBF1' },
  { key:'pre_checkout',    label:'Day before out',    icon:'🧳', color:'#1C3D2E', bg:'#DCFCE7' },
  { key:'post_checkout',   label:'Feedback request',  icon:'⭐', color:'#C9A84C', bg:'#FEF9C3' },
]

const STATUS_STYLE = {
  sent:    { label:'Sent',    color:'#16A34A', bg:'#DCFCE7' },
  pending: { label:'Pending', color:'#D97706', bg:'#FEF3C7' },
  skipped: { label:'Skipped', color:'#9CA3AF', bg:'#F3F4F6' },
  failed:  { label:'Failed',  color:'#DC2626', bg:'#FEE2E2' },
}

export default function ScheduledTab({ hotelId }) {
  const [data, setData]       = useState([])
  const [feedback, setFeedback] = useState([])
  const [fbStats, setFbStats]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [section, setSection]   = useState('messages')

  useEffect(() => {
    if (!hotelId) return
    loadData()
  }, [hotelId])

  async function loadData() {
    setLoading(true)
    try {
      const [scheduledRes, feedbackRes] = await Promise.all([
        fetch(`/api/scheduled?hotelId=${hotelId}`),
        fetch(`/api/feedback?hotelId=${hotelId}`),
      ])
      const [scheduledData, feedbackData] = await Promise.all([
        scheduledRes.json(), feedbackRes.json()
      ])
      setData(scheduledData.guests || [])
      setFeedback(feedbackData.feedback || [])
      setFbStats(feedbackData.stats || null)
    } finally { setLoading(false) }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#6B7280', fontFamily:"'DM Sans',sans-serif", fontSize:'14px' }}>
      Loading...
    </div>
  )

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Section tabs */}
      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
        {[
          { key:'messages', label:'Scheduled messages' },
          { key:'feedback', label:'Guest feedback' },
        ].map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{ padding:'11px 22px', fontSize:'14px', fontWeight:section===s.key?'700':'500', color:section===s.key?'#1C3D2E':'#9CA3AF', background:'none', border:'none', borderBottom:section===s.key?'3px solid #1C3D2E':'3px solid transparent', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Scheduled messages */}
      {section === 'messages' && (
        <div className="scrollable" style={{ padding:'18px', background:'#F9FAFB' }}>

          {/* Legend */}
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'16px' }}>
            {MESSAGE_TYPES.map(mt => (
              <div key={mt.key} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 12px', borderRadius:'20px', background:mt.bg, fontSize:'12px', fontWeight:'500', color:mt.color }}>
                {mt.icon} {mt.label}
              </div>
            ))}
          </div>

          {/* Guest rows */}
          {data.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'14px' }}>No guests found</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {data.map(row => (
                <div key={row.guest.id} style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'10px' }}>
                    <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                      {(row.guest.name?.[0]||'?')}{(row.guest.surname?.[0]||'')}
                    </div>
                    <div>
                      <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>{row.guest.name} {row.guest.surname}</div>
                      <div style={{ fontSize:'12px', color:'#6B7280' }}>
                        Room {row.guest.room} ·
                        {row.guest.check_in && ` In: ${new Date(row.guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                        {row.guest.check_out && ` · Out: ${new Date(row.guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                        {row.stayNights && ` · ${row.stayNights} nights`}
                      </div>
                    </div>
                    <div style={{ marginLeft:'auto', fontSize:'12px', color:'#9CA3AF' }}>
                      {(row.guest.language||'EN').toUpperCase()}
                    </div>
                  </div>

                  {/* Message status grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'6px' }}>
                    {MESSAGE_TYPES.map(mt => {
                      const msg = row.messages?.find(m => m.message_type === mt.key)
                      const status = msg?.status || 'pending'
                      const ss = STATUS_STYLE[status] || STATUS_STYLE.pending
                      const isSkipped = status === 'skipped'
                      const isMidstay = mt.key === 'midstay_upsell'
                      const showNA = isMidstay && row.stayNights < 6

                      return (
                        <div key={mt.key} style={{
                          padding:'7px 8px', borderRadius:'8px', textAlign:'center',
                          background: showNA ? '#F9FAFB' : ss.bg,
                          border: `1px solid ${showNA ? '#F3F4F6' : 'transparent'}`,
                          opacity: showNA || isSkipped ? 0.5 : 1,
                        }}>
                          <div style={{ fontSize:'16px', marginBottom:'2px' }}>{mt.icon}</div>
                          <div style={{ fontSize:'10px', fontWeight:'600', color:showNA?'#9CA3AF':ss.color }}>
                            {showNA ? 'N/A' : ss.label}
                          </div>
                          {msg?.sent_at && !showNA && (
                            <div style={{ fontSize:'9px', color:'#9CA3AF', marginTop:'1px' }}>
                              {new Date(msg.sent_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {section === 'feedback' && (
        <div className="scrollable" style={{ padding:'18px', background:'#F9FAFB' }}>

          {/* Stats */}
          {fbStats && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'16px' }}>
              <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'14px 16px', textAlign:'center' }}>
                <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'5px', fontWeight:'500' }}>Average rating</div>
                <div style={{ fontSize:'32px', fontWeight:'700', color:'#C9A84C' }}>{fbStats.avg || '—'}</div>
                <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'2px' }}>out of 5</div>
              </div>
              <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'14px 16px', textAlign:'center' }}>
                <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'5px', fontWeight:'500' }}>Total responses</div>
                <div style={{ fontSize:'32px', fontWeight:'700', color:'#111827' }}>{fbStats.total}</div>
              </div>
              <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'14px 16px' }}>
                <div style={{ fontSize:'12px', color:'#6B7280', marginBottom:'8px', fontWeight:'500' }}>Rating breakdown</div>
                {[5,4,3,2,1].map(r => {
                  const count = fbStats.distribution?.[r] || 0
                  const pct   = fbStats.total > 0 ? Math.round((count/fbStats.total)*100) : 0
                  const colors = { 5:'#16A34A', 4:'#65A30D', 3:'#D97706', 2:'#EA580C', 1:'#DC2626' }
                  return (
                    <div key={r} style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'4px' }}>
                      <div style={{ fontSize:'11px', color:'#6B7280', width:'14px', textAlign:'right' }}>{r}</div>
                      <div style={{ flex:1, height:'8px', background:'#F3F4F6', borderRadius:'4px', overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:colors[r], borderRadius:'4px', minWidth: pct>0?'3px':'0' }}/>
                      </div>
                      <div style={{ fontSize:'11px', color:'#6B7280', width:'20px' }}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Feedback list */}
          {feedback.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:'14px' }}>No feedback received yet</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {feedback.map(f => {
                const guest   = f.guests || {}
                const stars   = '⭐'.repeat(f.rating) + '☆'.repeat(5 - f.rating)
                const rColors = { 5:'#16A34A', 4:'#65A30D', 3:'#D97706', 2:'#EA580C', 1:'#DC2626' }
                const rBgs    = { 5:'#DCFCE7', 4:'#F7FEE7', 3:'#FEF3C7', 2:'#FEF0E7', 1:'#FEE2E2' }
                return (
                  <div key={f.id} style={{ background:'white', border:`1px solid ${f.rating <= 2 ? '#FCA5A5' : '#E5E7EB'}`, borderRadius:'12px', padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:'12px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:rBgs[f.rating], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', fontWeight:'700', color:rColors[f.rating], flexShrink:0 }}>
                      {f.rating}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px' }}>
                        <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>
                          {guest.name} {guest.surname}
                        </div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
                          Room {guest.room}
                          {guest.check_in && ` · ${new Date(guest.check_in).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                          {guest.check_out && ` – ${new Date(guest.check_out).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                        </div>
                      </div>
                      <div style={{ fontSize:'16px', marginBottom:'3px' }}>{stars}</div>
                      {f.comment && (
                        <div style={{ fontSize:'13px', color:'#374151', lineHeight:'1.5', fontStyle:'italic' }}>
                          "{f.comment}"
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0 }}>
                      {new Date(f.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
