// app/dashboard/page.js (updated — adds Visitors tab)
'use client'
import { useState, useEffect } from 'react'
import LiveTab          from '../../components/LiveTab'
import GuestsTab        from '../../components/GuestsTab'
import AnalyticsTab     from '../../components/AnalyticsTab'
import ScheduledTab     from '../../components/ScheduledTab'
import VisitorsTab      from '../../components/VisitorsTab'
import SettingsTab      from '../../components/SettingsTab'
import NotificationBell from '../../components/NotificationBell'
import '../../dashboard.css'

export default function DashboardPage() {
  const [activeTab, setActiveTab]         = useState('live')
  const [session, setSession]             = useState(null)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedGuest, setSelectedGuest] = useState(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(d => { if (d.session) setSession(d.session); else window.location.href = '/login' })
      .catch(() => { window.location.href = '/login' })
  }, [])

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const res  = await fetch(`/api/guests/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.guests || [])
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
    fetch('/api/auth/login', { method:'DELETE' })
      .then(() => { window.location.href = '/login' })
  }

  const hotelId = session?.hotelId

  const tabs = [
    { key:'live',      label:'Live',             roles:['receptionist','manager','admin','maintenance','housekeeping','concierge','fnb','security','valet','frontdesk'] },
    { key:'guests',    label:'Guests',            roles:['receptionist','manager','admin'] },
    { key:'visitors',  label:'Day Visitors',      roles:['receptionist','manager','admin'] },
    { key:'analytics', label:'Analytics',         roles:['manager','admin'] },
    { key:'scheduled', label:'Messaging',         roles:['manager','admin'] },
    { key:'settings',  label:'Concierge Setup',   roles:['manager','admin'] },
  ].filter(t => !session || t.roles.includes(session.role))

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', background:'#F9FAFB', fontFamily:"'DM Sans', sans-serif" }}>

      {/* TOPBAR */}
      <div style={{ height:'56px', background:'#1C3D2E', display:'flex', alignItems:'center', padding:'0 20px', gap:'16px', flexShrink:0, borderBottom:'1px solid #2A5A42' }}>
        <div style={{ fontSize:'16px', fontWeight:'700', color:'#C9A84C', whiteSpace:'nowrap', flexShrink:0 }}>
          The <span style={{ color:'white', fontWeight:'400' }}>Residence</span> <span style={{ color:'#C9A84C' }}>Concierge</span>
        </div>

        <div style={{ flex:1, maxWidth:'560px', margin:'0 auto', position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', height:'36px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'10px', padding:'0 14px' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink:0, opacity:0.6 }}>
              <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.5"/>
              <line x1="10" y1="10" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search guest by room number, name or phone..."
              style={{ flex:1, background:'none', border:'none', color:'white', fontSize:'14px', outline:'none', fontFamily:"'DM Sans', sans-serif" }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontSize:'18px', lineHeight:1, padding:0 }}>×</button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div style={{ position:'absolute', top:'44px', left:0, right:0, background:'white', borderRadius:'12px', border:'0.5px solid #E5E7EB', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:200, overflow:'hidden' }}>
              {searchResults.map(guest => {
                const lc = { en:{bg:'#DCFCE7',color:'#14532D'}, ru:{bg:'#DBEAFE',color:'#1E3A5F'}, he:{bg:'#FEF3C7',color:'#78350F'} }[guest.language] || {bg:'#DCFCE7',color:'#14532D'}
                return (
                  <div key={guest.id} onClick={() => selectGuest(guest)}
                    style={{ padding:'12px 16px', cursor:'pointer', borderBottom:'0.5px solid #F3F4F6', display:'flex', alignItems:'center', gap:'12px' }}
                    onMouseEnter={e => e.currentTarget.style.background='#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background='white'}
                  >
                    <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                      {(guest.name?.[0]||'?')}{(guest.surname?.[0]||'')}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>{guest.name} {guest.surname}</div>
                      <div style={{ fontSize:'12px', color:'#6B7280', marginTop:'1px' }}>
                        {guest.guest_type === 'day_visitor' ? '🌟 Day visitor' : `Room ${guest.room}`} · {guest.phone}
                      </div>
                    </div>
                    <div style={{ fontSize:'11px', fontWeight:'700', padding:'3px 8px', borderRadius:'5px', background:lc.bg, color:lc.color }}>
                      {(guest.language||'EN').toUpperCase()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'14px' }}>
          <NotificationBell />
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.6)', fontWeight:'500' }}>{session?.hotelName}</div>
          <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#C9A84C', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'#1C3D2E', flexShrink:0 }}>
            {session?.name?.[0]||'?'}
          </div>
          <button onClick={handleLogout}
            style={{ background:'none', border:'1px solid rgba(255,255,255,0.25)', borderRadius:'8px', color:'rgba(255,255,255,0.7)', fontSize:'13px', fontWeight:'500', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", padding:'6px 14px' }}>
            Logout
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display:'flex', background:'#163228', borderBottom:'1px solid #2A5040', flexShrink:0 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding:'13px 20px', fontSize:'14px', fontWeight:activeTab===tab.key?'700':'500', color:activeTab===tab.key?'#C9A84C':'rgba(255,255,255,0.55)', background:'none', border:'none', borderBottom:activeTab===tab.key?'3px solid #C9A84C':'3px solid transparent', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", whiteSpace:'nowrap', transition:'all .15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        {activeTab === 'live'      && <LiveTab hotelId={hotelId} session={session} onSelectGuest={selectGuest} />}
        {activeTab === 'guests'    && <GuestsTab hotelId={hotelId} selectedGuest={selectedGuest} />}
        {activeTab === 'visitors'  && <VisitorsTab hotelId={hotelId} />}
        {activeTab === 'analytics' && <AnalyticsTab hotelId={hotelId} />}
        {activeTab === 'scheduled' && <ScheduledTab hotelId={hotelId} />}
        {activeTab === 'settings'  && <SettingsTab hotelId={hotelId} />}
      </div>
    </div>
  )
}
