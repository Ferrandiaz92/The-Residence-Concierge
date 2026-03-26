// components/NotificationBell.js
'use client'
import { useState, useEffect, useRef } from 'react'

const TYPE_ICONS = {
  partner_confirmed: { icon: '✅', color: '#16A34A', bg: '#F0FDF4' },
  partner_declined:  { icon: '❌', color: '#D94040', bg: '#FDEAEA' },
  guest_message:     { icon: '💬', color: '#2563EB', bg: '#EFF6FF' },
  ticket_escalated:  { icon: '⚠️', color: '#D97706', bg: '#FEF3C7' },
  bot_handoff:       { icon: '🔁', color: '#9333EA', bg: '#FAF5FF' },
}

export default function NotificationBell({ onNavigate }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen]                   = useState(false)
  const ref                               = useRef(null)

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 15000)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifications() {
    try {
      const res  = await fetch('/api/notifications')
      const data = await res.json()
      setNotifications(data.notifications || [])
    } catch {}
  }

  async function markRead(id) {
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markAllRead: true }),
    })
    setNotifications([])
    setOpen(false)
  }

  function handleNotifClick(notif) {
    markRead(notif.id)
    setOpen(false)
    if (onNavigate) onNavigate(notif)
  }

  const count = notifications.length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 1.5C9 1.5 13.5 3 13.5 9V13.5H4.5V9C4.5 3 9 1.5 9 1.5Z" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" fill="none"/>
          <path d="M7.5 13.5C7.5 14.3284 8.17157 15 9 15C9.82843 15 10.5 14.3284 10.5 13.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2"/>
          <line x1="9" y1="1.5" x2="9" y2="0.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        {count > 0 && (
          <div style={{
            position: 'absolute', top: '0', right: '0',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#D94040', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '9px', fontWeight: '700', color: 'white',
          }}>
            {count > 9 ? '9+' : count}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'fixed',
          top: '90px',
          right: '12px',
          left: '12px',
          width: 'auto',
          maxWidth: '360px',
          marginLeft: 'auto',
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          border: '0.5px solid var(--border-md)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, overflow: 'hidden',
          fontFamily: 'var(--font)',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 14px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-900)' }}>
              Notifications {count > 0 && <span style={{ color: 'var(--gray-400)', fontWeight: '400' }}>({count})</span>}
            </div>
            {count > 0 && (
              <button onClick={markAllRead} style={{
                fontSize: '11px', color: 'var(--gray-400)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '12px' }}>
                All caught up ✓
              </div>
            ) : notifications.map(n => {
              const style = TYPE_ICONS[n.type] || TYPE_ICONS.guest_message
              const timeAgo = getTimeAgo(n.created_at)
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    display: 'flex', gap: '10px', padding: '12px 14px',
                    borderBottom: '0.5px solid var(--border)',
                    cursor: 'pointer', background: 'white',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: style.bg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '14px', flexShrink: 0,
                  }}>
                    {style.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px', fontWeight: '500', color: 'var(--gray-900)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{
                        fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--gray-300)', marginTop: '3px' }}>
                      {timeAgo}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function getTimeAgo(ts) {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs/24)}d ago`
}
