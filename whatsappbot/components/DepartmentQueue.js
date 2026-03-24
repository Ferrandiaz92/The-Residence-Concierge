// components/DepartmentQueue.js
// Shown to maintenance/housekeeping staff instead of conversations
// Displays their tickets in Pending / In Progress / Completed columns

'use client'
import { useState, useEffect } from 'react'

const DEPT_LABELS = {
  maintenance:  { label: 'Maintenance',  color: '#64748B', bg: '#F1F5F9' },
  housekeeping: { label: 'Housekeeping', color: '#16A34A', bg: '#F0FDF4' },
  concierge:    { label: 'Concierge',    color: '#9333EA', bg: '#FDF2F8' },
  fnb:          { label: 'F&B',          color: '#D97706', bg: '#FEF3C7' },
}

const STATUS_COLUMNS = [
  { key: 'pending',     label: 'Pending',     color: '#D97706', bg: '#FEF3C7' },
  { key: 'in_progress', label: 'In progress', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'resolved',    label: 'Completed',   color: '#16A34A', bg: '#F0FDF4' },
]

export default function DepartmentQueue({ hotelId, session }) {
  const [tickets, setTickets]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [updating, setUpdating] = useState(null)

  const dept = session?.department || session?.role

  useEffect(() => {
    if (!hotelId) return
    loadTickets()
    const interval = setInterval(loadTickets, 30000)
    return () => clearInterval(interval)
  }, [hotelId])

  async function loadTickets() {
    try {
      const res  = await fetch(`/api/tickets?hotelId=${hotelId}&department=${dept}`)
      const data = await res.json()
      setTickets(data.tickets || [])
    } finally { setLoading(false) }
  }

  async function updateStatus(ticketId, status) {
    setUpdating(ticketId)
    try {
      await fetch('/api/tickets', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ticketId, status }),
      })
      loadTickets()
    } finally { setUpdating(null) }
  }

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--gray-400)',fontFamily:'var(--font)' }}>
      Loading tickets...
    </div>
  )

  const deptConfig = DEPT_LABELS[dept] || DEPT_LABELS.maintenance

  return (
    <div style={{ height:'100%',display:'flex',flexDirection:'column',fontFamily:'var(--font)',overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'12px 16px',background:'white',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:'10px',flexShrink:0 }}>
        <div style={{ fontSize:'11px',fontWeight:'700',padding:'3px 10px',borderRadius:'6px',background:deptConfig.bg,color:deptConfig.color }}>
          {deptConfig.label}
        </div>
        <div style={{ fontSize:'13px',fontWeight:'500',color:'var(--gray-900)' }}>Ticket queue</div>
        <div style={{ fontSize:'11px',color:'var(--gray-400)',marginLeft:'auto' }}>
          {tickets.filter(t => t.status !== 'resolved').length} open · auto-refreshes every 30s
        </div>
      </div>

      {/* 3 columns */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',padding:'14px',flex:1,overflow:'hidden',background:'var(--gray-50)' }}>
        {STATUS_COLUMNS.map(col => {
          const colTickets = tickets.filter(t => {
            if (col.key === 'in_progress') return t.status === 'in_progress' || t.status === 'escalated'
            if (col.key === 'resolved') return t.status === 'resolved' || t.status === 'cancelled'
            return t.status === col.key || t.status === 'pending'
          })

          return (
            <div key={col.key} style={{ display:'flex',flexDirection:'column',overflow:'hidden' }}>
              {/* Column header */}
              <div style={{ display:'flex',alignItems:'center',gap:'7px',marginBottom:'10px' }}>
                <div style={{ fontSize:'11px',fontWeight:'600',color:col.color }}>{col.label}</div>
                <div style={{ fontSize:'10px',fontWeight:'700',padding:'1px 7px',borderRadius:'10px',background:col.bg,color:col.color }}>
                  {colTickets.length}
                </div>
              </div>

              {/* Tickets */}
              <div style={{ display:'flex',flexDirection:'column',gap:'8px',overflowY:'auto',flex:1 }}
                className="scrollable">
                {colTickets.length === 0 && (
                  <div style={{ padding:'20px',textAlign:'center',color:'var(--gray-300)',fontSize:'11px',background:'white',borderRadius:'var(--radius-lg)',border:'0.5px dashed var(--border)' }}>
                    No tickets
                  </div>
                )}
                {colTickets.map(t => {
                  const minsOpen = Math.round(t.minutes_open || 0)
                  const timeLabel = minsOpen < 60 ? `${minsOpen}m` : `${Math.floor(minsOpen/60)}h ${minsOpen%60}m`
                  const isUrgent  = t.priority === 'urgent'
                  const isOverdue = minsOpen > 30 && col.key !== 'resolved'

                  return (
                    <div key={t.id} style={{ background:'white',border:`0.5px solid ${isUrgent?'#FCA5A5':isOverdue?'#FDE68A':'var(--border)'}`,borderRadius:'var(--radius-lg)',padding:'12px',position:'relative' }}>

                      {/* Priority badge */}
                      {isUrgent && (
                        <div style={{ position:'absolute',top:'10px',right:'10px',fontSize:'8px',fontWeight:'700',padding:'2px 6px',borderRadius:'4px',background:'var(--red-light)',color:'var(--red)' }}>
                          URGENT
                        </div>
                      )}

                      {/* Ticket number + time */}
                      <div style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px' }}>
                        <div style={{ fontSize:'10px',fontWeight:'600',color:'var(--gray-400)' }}>#{t.ticket_number}</div>
                        <div style={{ fontSize:'9px',color:isOverdue?'#D97706':'var(--gray-300)',fontWeight:isOverdue?'600':'400' }}>
                          {col.key === 'resolved' ? `Resolved in ${timeLabel}` : `Open ${timeLabel}`}
                        </div>
                      </div>

                      {/* Category */}
                      <div style={{ fontSize:'10px',fontWeight:'600',color:deptConfig.color,marginBottom:'4px',textTransform:'capitalize' }}>
                        {t.category?.replace(/_/g,' ')}
                      </div>

                      {/* Description */}
                      <div style={{ fontSize:'12px',color:'var(--gray-800)',lineHeight:'1.4',marginBottom:'8px' }}>
                        {t.description}
                      </div>

                      {/* Room + guest */}
                      <div style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'10px' }}>
                        {t.room && (
                          <div style={{ fontSize:'10px',fontWeight:'500',padding:'2px 7px',borderRadius:'4px',background:'var(--gray-100)',color:'var(--gray-600)' }}>
                            Room {t.room}
                          </div>
                        )}
                        {t.guest_name && (
                          <div style={{ fontSize:'10px',color:'var(--gray-400)' }}>
                            {t.guest_name} {t.guest_surname || ''}
                          </div>
                        )}
                      </div>

                      {/* Assigned to */}
                      {t.assigned_to_name && (
                        <div style={{ fontSize:'9px',color:'var(--gray-400)',marginBottom:'8px' }}>
                          Assigned to: {t.assigned_to_name}
                        </div>
                      )}

                      {/* Action buttons */}
                      {col.key === 'pending' && (
                        <button
                          onClick={() => updateStatus(t.id, 'in_progress')}
                          disabled={updating === t.id}
                          style={{ width:'100%',padding:'6px',background:'var(--green-800)',border:'none',borderRadius:'var(--radius-sm)',fontSize:'11px',fontWeight:'500',color:'white',cursor:'pointer',fontFamily:'var(--font)' }}>
                          {updating === t.id ? 'Updating...' : '👍 Accept ticket'}
                        </button>
                      )}
                      {col.key === 'in_progress' && (
                        <div style={{ display:'flex',gap:'6px' }}>
                          <button
                            onClick={() => updateStatus(t.id, 'resolved')}
                            disabled={updating === t.id}
                            style={{ flex:1,padding:'6px',background:'var(--green-800)',border:'none',borderRadius:'var(--radius-sm)',fontSize:'11px',fontWeight:'500',color:'white',cursor:'pointer',fontFamily:'var(--font)' }}>
                            {updating === t.id ? '...' : '✅ Mark resolved'}
                          </button>
                          <button
                            onClick={() => updateStatus(t.id, 'escalated')}
                            disabled={updating === t.id}
                            style={{ padding:'6px 10px',background:'white',border:'0.5px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:'11px',color:'var(--gray-500)',cursor:'pointer',fontFamily:'var(--font)' }}>
                            ❌ Can't fix
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
