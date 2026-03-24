// app/dashboard/page.js
'use client'
import { useState, useEffect, useCallback } from 'react'
import LiveTab       from '../../components/LiveTab'
import GuestsTab     from '../../components/GuestsTab'
import AnalyticsTab  from '../../components/AnalyticsTab'
import '../dashboard.css'

export default function DashboardPage() {
  const [activeTab, setActiveTab]         = useState('live')
  const [session, setSession]             = useState(null)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedGuest, setSelectedGuest] = useState(null)
  const [searching, setSearching]         = useState(false)

  // Load session
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(d => { if (d.session) setSession(d.session) })
      .catch(() => { window.location.href = '/login' })
  }, [])

  // Search guests
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res  = await fetch(`/api/guests/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data.guests || [])
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  function selectGuest(guest) {
    setSelectedGuest(guest)
    setSearchQuery('')
    setSearchResults([])
    setActiveTab('guests')
  }

  function handleLogout() {
    fetch('/api/auth/login', { method: 'DELETE' })
      .then(() => { window.location.href = '/login' })
  }

  const hotelId = session?.hotelId

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      background: 'var(--gray-50)',
      fontFamily: 'var(--font)',
    }}>

      {/* ── TOPBAR ── */}
      <div style={{
        height: '48px', background: 'var(--green-800)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: '12px', flexShrink: 0,
        borderBottom: '0.5px solid var(--green-700)',
      }}>
        {/* Logo */}
        <div style={{
          fontSize: '13px', fontWeight: '600',
          color: 'var(--gold)', whiteSpace: 'nowrap',
          letterSpacing: '0.2px',
        }}>
          The <span style={{ color: 'white', fontWeight: '400' }}>Residence</span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: '520px', margin: '0 auto', position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            height: '30px', background: 'rgba(255,255,255,0.1)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 'var(--radius-sm)', padding: '0 10px',
          }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="white" strokeWidth="1.2"/>
              <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search guest by room, name or phone..."
              style={{
                flex: 1, background: 'none', border: 'none',
                color: 'white', fontSize: '12px', outline: 'none',
                fontFamily: 'var(--font)',
              }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '36px', left: 0, right: 0,
              background: 'white', borderRadius: 'var(--radius-md)',
              border: '0.5px solid var(--border-md)',
              boxShadow: 'var(--shadow-md)', zIndex: 100, overflow: 'hidden',
            }}>
              {searchResults.map(guest => (
                <div key={guest.id}
                  onClick={() => selectGuest(guest)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '0.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'var(--green-800)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', color: 'var(--gold)', fontWeight: '600', flexShrink: 0,
                  }}>
                    {(guest.name?.[0] || '?')}{(guest.surname?.[0] || '')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>
                      {guest.name} {guest.surname}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                      Room {guest.room} · {guest.phone}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '9px', fontWeight: '600', padding: '2px 6px',
                    borderRadius: '4px',
                    background: guest.language === 'ru' ? 'var(--blue-light)' : guest.language === 'he' ? 'var(--amber-light)' : 'var(--success-light)',
                    color: guest.language === 'ru' ? 'var(--blue)' : guest.language === 'he' ? 'var(--amber)' : 'var(--success)',
                  }}>
                    {(guest.language || 'en').toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right side */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
            {session?.hotelName}
          </div>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'var(--gold)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '10px',
            fontWeight: '600', color: 'var(--green-900)',
          }}>
            {session?.name?.[0] || '?'}
          </div>
          <button onClick={handleLogout} style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.4)', fontSize: '11px',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Logout
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{
        display: 'flex', background: '#163228',
        borderBottom: '0.5px solid #2a5040', flexShrink: 0,
      }}>
        {[
          { key: 'live',      label: 'Live' },
          { key: 'guests',    label: 'Guests' },
          ...(session?.role === 'manager' || session?.role === 'admin'
            ? [{ key: 'analytics', label: 'Analytics' }]
            : []
          ),
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '9px 20px', fontSize: '12px', fontWeight: '500',
              color: activeTab === tab.key ? 'var(--gold)' : 'rgba(255,255,255,0.4)',
              background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--gold)' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font)',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'live' && (
          <LiveTab hotelId={hotelId} onSelectGuest={selectGuest} />
        )}
        {activeTab === 'guests' && (
          <GuestsTab hotelId={hotelId} selectedGuest={selectedGuest} />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab hotelId={hotelId} />
        )}
      </div>

    </div>
  )
}
