// app/dashboard/page.js — mobile-responsive, role-based v2
'use client'
import { useState, useEffect } from 'react'
import LiveTab           from '../../components/LiveTab'
import DepartmentQueue  from '../../components/DepartmentQueue'
import MobileLiveTab    from '../../components/MobileLiveTab'
import GuestsTab        from '../../components/GuestsTab'
import MobileGuestsTab  from '../../components/MobileGuestsTab'
import AnalyticsTab     from '../../components/AnalyticsTab'
import ScheduledTab     from '../../components/ScheduledTab'
import VisitorsTab      from '../../components/VisitorsTab'
import SettingsTab      from '../../components/SettingsTab'
import FacilitiesTab   from '../../components/FacilitiesTab'
import NotificationBell from '../../components/NotificationBell'
import { useIsMobile }  from '../../lib/useIsMobile'
import PushPermission  from '../../components/PushPermission'
import '../../dashboard.css'

// ── Role helpers ─────────────────────────────────────────────
const DEPT_ROLES = ['maintenance','housekeeping','concierge','fnb','security','valet','frontdesk','employee']
const isManager  = r => ['manager','admin'].includes(r)
const isSupervisor    = r => r === 'supervisor'
const isCommunications= r => r === 'communications'
const isReception= r => r === 'receptionist'
const isDept     = r => DEPT_ROLES.includes(r)

// Desktop tabs (unchanged)
function getDesktopTabs(role) {
  return [
    { key:'live',      label:'Live',           roles:['receptionist','manager','admin',...DEPT_ROLES] },
    { key:'guests',    label:'Guests',          roles:['receptionist','manager','admin'] },
    { key:'visitors',  label:'Day Visitors',    roles:['receptionist','manager','admin'] },
    { key:'analytics', label:'Analytics',       roles:['manager','admin'] },
    { key:'scheduled', label:'Messaging',       roles:['manager','admin'] },
    { key:'settings',  label:'Concierge Setup', roles:['manager','admin'] },
    { key:'facilities', label:'Facilities', icon:'🎾', roles:['manager','receptionist','supervisor','concierge','communications'] },
    { key:'live',      label:'Conversations',   roles:['supervisor'] },
    { key:'settings',  label:'Concierge Setup', roles:['supervisor'] },
    { key:'scheduled', label:'Messaging',       roles:['communications'] },
    { key:'settings',  label:'Concierge Setup', roles:['communications'] },
  ].filter(t => t.roles.includes(role))
}

// Mobile tabs — simplified per role
// Manager/Admin: Live, Guests, Setup
// Reception:     Live, Guests (no Visitors)
// Dept:          Live only (full screen queue, no bottom nav)
function getMobileTabs(role) {
  if (isSupervisor(role)) return [
    { key:'live',     label:'Live',  icon:IconLive     },
    { key:'settings', label:'Setup', icon:IconSettings },
  ]
  if (isCommunications(role)) return [
    { key:'scheduled', label:'Messaging', icon:IconSettings },
    { key:'settings',  label:'Setup',     icon:IconSettings },
  ]
  if (isManager(role)) return [
    { key:'live',       label:'Live',      icon:IconLive       },
    { key:'guests',     label:'Guests',    icon:IconGuests     },
    { key:'facilities', label:'Facility',  icon:IconFacilities },
    { key:'settings',   label:'Setup',     icon:IconSettings   },
  ]
  // Reception: Live + Guests + Facilities
  if (isReception(role)) return [
    { key:'live',       label:'Live',      icon:IconLive       },
    { key:'guests',     label:'Guests',    icon:IconGuests     },
    { key:'facilities', label:'Facility',  icon:IconFacilities },
  ]
  return [] // dept: no bottom nav
}

function roleBadge(role) {
  if (isManager(role))   return { label:'Manager',   bg:'rgba(201,168,76,0.15)',  color:'#C9A84C' }
  if (isReception(role)) return { label:'Reception', bg:'rgba(159,212,184,0.15)', color:'#9FD4B8' }
  const label = role ? role.charAt(0).toUpperCase()+role.slice(1) : 'Staff'
  return { label, bg:'rgba(147,197,253,0.15)', color:'#93C5FD' }
}

// ── SVG Icons ────────────────────────────────────────────────
function IconLive({ size=22, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill={color}/><circle cx="12" cy="12" r="7" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5"/><circle cx="12" cy="12" r="11" stroke={color} strokeWidth="1" fill="none" opacity="0.2"/></svg>
}
function IconGuests({ size=22, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3.5" stroke={color} strokeWidth="1.5"/><path d="M2 20c0-4 3.1-7 7-7s7 3 7 7" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><circle cx="17" cy="8" r="2.5" stroke={color} strokeWidth="1.5"/><path d="M16 20h6c0-3-2-5-4.5-5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>
}
function IconVisitors({ size=22, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={color} strokeWidth="1.5"/><circle cx="12" cy="9" r="2.5" stroke={color} strokeWidth="1.5"/></svg>
}
function IconSettings({ size=22, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>
}
function IconFacilities({ size=22, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 17l4-8 4 4 4-6 4 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="2" y="19" width="20" height="2" rx="1" fill={color} opacity="0.3"/></svg>
}
function IconLogout({ size=18, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke={color} strokeWidth="2" strokeLinecap="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

// ── Tab content ──────────────────────────────────────────────
function TabContent({ tab, hotelId, session, selectedGuest, onSelectGuest, isMobile }) {
  // Employee / dept role always gets DepartmentQueue regardless of tab
  if (isDept(session?.role)) {
    return <DepartmentQueue hotelId={hotelId} session={session} />
  }
  switch (tab) {
    case 'live':      return isMobile
      ? <MobileLiveTab hotelId={hotelId} session={session} onSelectGuest={onSelectGuest} />
      : <LiveTab       hotelId={hotelId} session={session} onSelectGuest={onSelectGuest} />
    case 'guests':    return isMobile
      ? <MobileGuestsTab hotelId={hotelId} selectedGuest={selectedGuest} />
      : <GuestsTab       hotelId={hotelId} selectedGuest={selectedGuest} />
    case 'visitors':  return <VisitorsTab  hotelId={hotelId} onNavigateToConv={(conv) => {
      onSelectGuest(conv.guests || {})
      // Navigate to live tab and open the conversation
      if (typeof window !== 'undefined') {
        window.__openConversation = conv
      }
    }} />
    case 'analytics': return <AnalyticsTab hotelId={hotelId} />
    case 'scheduled': return <ScheduledTab hotelId={hotelId} />
    case 'settings':  return <SettingsTab    hotelId={hotelId} session={session} isMobile={isMobile} />
    case 'facilities': return <FacilitiesTab  hotelId={hotelId} session={session} isMobile={isMobile} />
    default:          return null
  }
}

// ══════════════════════════════════════════════════════════════
//  DESKTOP DASHBOARD (original layout, untouched)
// ══════════════════════════════════════════════════════════════
function DesktopDashboard({ session, tabs, activeTab, setActiveTab, searchQuery, setSearchQuery, searchResults, setSearchResults, selectedGuest, onSelectGuest, handleLogout, hotelId }) {
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
                  <div key={guest.id} onClick={() => onSelectGuest(guest)}
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
                        {guest.guest_type === 'day_visitor' ? '🌟 Day visitor' : guest.guest_type === 'member' ? '⭐ Member' : guest.stay_status === 'prospect' || !guest.room ? '🔍 Prospect' : `Room ${guest.room}`} · {guest.phone}
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
        <TabContent tab={activeTab} hotelId={hotelId} session={session} selectedGuest={selectedGuest} onSelectGuest={onSelectGuest} isMobile={false} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MOBILE TOPBAR — prominent logout for all roles
// ══════════════════════════════════════════════════════════════
function MobileTopbar({ session, badge, handleLogout, tabLabel, showSearch, onSelectGuest, onNavigate }) {
  const [searchOpen,  setSearchOpen]  = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results,     setResults]     = useState([])

  useEffect(() => {
    if (!showSearch || searchQuery.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/guests/search?q=${encodeURIComponent(searchQuery)}`)
      const d   = await res.json()
      setResults(d.guests || [])
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, showSearch])

  function selectGuest(guest) {
    onSelectGuest?.(guest)
    setSearchOpen(false); setSearchQuery(''); setResults([])
  }

  return (
    <div style={{ flexShrink:0 }}>

      {/* Main topbar row */}
      <div style={{ height:'58px', background:'#1C3D2E', display:'flex', alignItems:'center', padding:'0 16px', gap:'10px', borderBottom:'1px solid #2A5042' }}>

        {/* Logo / current tab */}
        {!searchOpen && (
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#C9A84C', lineHeight:1.1 }}>
              The Residence <span style={{ color:'rgba(255,255,255,0.6)', fontWeight:'400' }}>Concierge</span>
            </div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)', marginTop:'2px' }}>{tabLabel}</div>
          </div>
        )}

        {/* Inline search input */}
        {searchOpen && (
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:'8px', height:'38px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'10px', padding:'0 12px' }}>
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ opacity:0.5, flexShrink:0 }}>
              <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.5"/>
              <line x1="10" y1="10" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search guest…"
              style={{ flex:1, background:'none', border:'none', color:'white', fontSize:'15px', outline:'none', fontFamily:"'DM Sans', sans-serif" }}
            />
          </div>
        )}

        {/* Right-side actions */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>

          <NotificationBell />

          {/* Search toggle — only for roles that can search */}
          {showSearch && (
            <button onClick={() => { setSearchOpen(s => !s); if (searchOpen) { setSearchQuery(''); setResults([]) } }}
              style={{ background: searchOpen?'rgba(255,255,255,0.12)':'none', border:'none', cursor:'pointer', padding:'7px', borderRadius:'8px', display:'flex', alignItems:'center', color:'rgba(255,255,255,0.7)' }}>
              {searchOpen
                ? <span style={{ fontSize:'20px', lineHeight:1, color:'white' }}>×</span>
                : <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/><line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              }
            </button>
          )}

          {/* Avatar */}
          <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#C9A84C', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'#1C3D2E', flexShrink:0 }}>
            {session?.name?.[0]||'?'}
          </div>

          {/* LOGOUT — always visible, prominent */}
          <button onClick={handleLogout}
            style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 12px', background:'rgba(220,38,38,0.15)', border:'1px solid rgba(220,38,38,0.35)', borderRadius:'8px', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
            <IconLogout size={15} color='#FCA5A5' />
            <span style={{ fontSize:'12px', fontWeight:'600', color:'#FCA5A5' }}>Out</span>
          </button>
        </div>
      </div>

      {/* Role + name strip */}
      <div style={{ height:'28px', display:'flex', alignItems:'center', padding:'0 12px', gap:'6px', background:'#163228', borderBottom:'1px solid #2A5040', overflow:'hidden' }}>
        <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'20px', background:badge.bg, color:badge.color, textTransform:'uppercase', letterSpacing:'0.04em', flexShrink:0 }}>
          {badge.label}
        </span>
        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'120px' }}>{session?.name}</span>
        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)', flexShrink:0 }}>·</span>
        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{session?.hotelName}</span>
      </div>

      {/* Search results */}
      {results.length > 0 && searchOpen && (
        <div style={{ background:'white', maxHeight:'260px', overflowY:'auto', borderBottom:'1px solid #E5E7EB' }}>
          {results.map(guest => (
            <div key={guest.id} onClick={() => selectGuest(guest)}
              style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer' }}>
              <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#1C3D2E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:'#C9A84C', fontWeight:'700', flexShrink:0 }}>
                {(guest.name?.[0]||'?')}{(guest.surname?.[0]||'')}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>{guest.name} {guest.surname}</div>
                <div style={{ fontSize:'12px', color:'#6B7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {guest.guest_type==='day_visitor'?'🌟 Day visitor':guest.guest_type==='member'?'⭐ Member':guest.stay_status==='prospect'||!guest.room?'🔍 Prospect':`Room ${guest.room}`} · {guest.phone}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MOBILE BOTTOM NAV
// ══════════════════════════════════════════════════════════════
function MobileBottomNav({ tabs, activeTab, setActiveTab }) {
  return (
    <div style={{ flexShrink:0, background:'#1C3D2E', borderTop:'1px solid #2A5040', display:'flex', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map(tab => {
        const active = activeTab === tab.key
        return (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', padding:'10px 4px', background: active?'rgba(201,168,76,0.1)':'none', border:'none', borderTop: active?'2px solid #C9A84C':'2px solid transparent', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", transition:'all .15s' }}>
            <tab.icon size={22} color={active?'#C9A84C':'rgba(255,255,255,0.38)'} />
            <span style={{ fontSize:'10px', fontWeight: active?'700':'500', color: active?'#C9A84C':'rgba(255,255,255,0.38)', lineHeight:1 }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MOBILE DASHBOARD
// ══════════════════════════════════════════════════════════════
function MobileDashboard({ session, activeTab, setActiveTab, selectedGuest, onSelectGuest, handleLogout, hotelId }) {
  const role    = session?.role
  const badge   = roleBadge(role)
  const tabs    = getMobileTabs(role)

  // Dept roles: full-screen DepartmentQueue, no bottom nav, no search
  if (isDept(role)) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'#F9FAFB', fontFamily:"'DM Sans', sans-serif" }}>
        <MobileTopbar
          session={session}
          badge={badge}
          handleLogout={handleLogout}
          tabLabel="My Queue"
          showSearch={false}
        />
        <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
          <DepartmentQueue hotelId={hotelId} session={session} />
        </div>
      </div>
    )
  }

  const currentTab = tabs.find(t => t.key === activeTab) || tabs[0]
  // Search available for reception and manager on guests / visitors tabs
  const showSearch = activeTab === 'guests' && !isDept(role)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'#F9FAFB', fontFamily:"'DM Sans', sans-serif" }}>
      <MobileTopbar
        session={session}
        badge={badge}
        handleLogout={handleLogout}
        tabLabel={currentTab?.label || 'Dashboard'}
        showSearch={showSearch}
        onSelectGuest={onSelectGuest}
      />
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        <TabContent tab={activeTab} hotelId={hotelId} session={session} selectedGuest={selectedGuest} onSelectGuest={onSelectGuest} isMobile={true} />
      </div>
      <MobileBottomNav tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} />
      <PushPermission session={session} isMobile={true} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [activeTab,     setActiveTab]     = useState('live')
  const [session,       setSession]       = useState(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedGuest, setSelectedGuest] = useState(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(d => {
        if (d.session) {
          setSession(d.session)
          // Set correct default tab based on role
          const role = d.session.role
          if (role === 'communications') setActiveTab('scheduled')
          else if (role === 'supervisor') setActiveTab('live')
          else if (role === 'employee')   setActiveTab('live')
          // manager, receptionist stay on 'live' (already default)
        } else {
          window.location.href = '/login'
        }
      })
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
    setSelectedGuest(guest); setSearchQuery(''); setSearchResults([])
    setActiveTab('guests')
  }

  function handleLogout() {
    fetch('/api/auth/login', { method:'DELETE' }).then(() => { window.location.href = '/login' })
  }

  if (!session) {
    return (
      <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#1C3D2E' }}>
        <div style={{ color:'#C9A84C', fontSize:'16px', fontFamily:"'DM Sans', sans-serif" }}>Loading…</div>
      </div>
    )
  }

  const desktopTabs = getDesktopTabs(session.role)
  const hotelId     = session.hotelId

  // Ensure activeTab is valid for this role
  const mobileTabs   = getMobileTabs(session.role)
  const allValidKeys = isMobile
    ? mobileTabs.map(t => t.key)   // no 'live' appended — each role only gets their tabs
    : desktopTabs.map(t => t.key)
  const defaultTab   = allValidKeys[0] || 'live'
  const validTab     = allValidKeys.includes(activeTab) ? activeTab : defaultTab

  const sharedProps = { session, activeTab: validTab, setActiveTab, selectedGuest, onSelectGuest: selectGuest, handleLogout, hotelId }

  if (isMobile) return <MobileDashboard {...sharedProps} />

  return (
    <DesktopDashboard
      {...sharedProps}
      tabs={desktopTabs}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchResults={searchResults}
      setSearchResults={setSearchResults}
    />
  )
}
