// components/PushPermission.js
// Mobile-only component — shown once on dashboard load
// Requests notification permission and registers the push subscription
// Silently re-registers on each load if already permitted (keeps subscription fresh)

'use client'
import { useState, useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// Convert VAPID key from base64 to Uint8Array (required by browser API)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function PushPermission({ session, isMobile }) {
  const [state,    setState]    = useState('idle') // idle | asking | granted | denied | unsupported
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (!session)        return
    if (!VAPID_PUBLIC_KEY) {
      console.warn('Push: VAPID key not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel')
      return
    }

    // All operational roles get push — desktop and mobile
    const PUSH_ROLES = ['receptionist','manager','admin','supervisor',
      'maintenance','housekeeping','concierge','fnb','security','valet','frontdesk','employee']
    if (!PUSH_ROLES.includes(session.role)) return

    checkAndRegister()
  }, [session])

  async function checkAndRegister() {
    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }

    const permission = Notification.permission

    if (permission === 'granted') {
      // Already granted — silently re-register to keep subscription fresh
      await registerSubscription()
      setState('granted')
      return
    }

    if (permission === 'denied') {
      setState('denied')
      return
    }

    // permission === 'default' — show our banner first, then ask
    setShowBanner(true)
    setState('idle')
  }

  async function handleAllow() {
    setShowBanner(false)
    setState('asking')

    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        await registerSubscription()
        setState('granted')
      } else {
        setState('denied')
      }
    } catch (err) {
      console.error('Permission request error:', err)
      setState('denied')
    }
  }

  async function registerSubscription() {
    try {
      // Register (or get existing) service worker
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // Get or create push subscription
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      // Send to server
      await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: sub.toJSON() }),
      })

      // Store in sessionStorage so we don't re-register on every render
      sessionStorage.setItem('push_registered', '1')
    } catch (err) {
      console.error('Push registration error:', err)
    }
  }

  // Handle notification clicks from service worker (tab switching)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = event => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const { tab } = event.data.data || {}
        if (tab) {
          // Dispatch custom event that the dashboard can listen to
          window.dispatchEvent(new CustomEvent('push-navigate', { detail: { tab } }))
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // Don't render anything if not showing banner
  if (!showBanner) return null

  return (
    <div style={{
      position:   'fixed',
      bottom:     'calc(env(safe-area-inset-bottom) + 70px)', // above bottom nav
      left:       '12px',
      right:      '12px',
      zIndex:     500,
      background: '#1C3D2E',
      borderRadius: '16px',
      padding:    '16px',
      boxShadow:  '0 8px 32px rgba(0,0,0,0.3)',
      fontFamily: "'DM Sans', sans-serif",
      border:     '1px solid #2A5A42',
    }}>
      {/* Close */}
      <button onClick={() => setShowBanner(false)}
        style={{ position:'absolute', top:'12px', right:'14px', background:'none', border:'none', color:'rgba(255,255,255,0.4)', fontSize:'20px', cursor:'pointer', lineHeight:1, padding:0 }}>
        ×
      </button>

      {/* Bell icon */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
        <div style={{ width:'40px', height:'40px', borderRadius:'12px', background:'rgba(201,168,76,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0 }}>
          🔔
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'white', marginBottom:'4px' }}>
            Enable notifications
          </div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.6)', lineHeight:'1.5', marginBottom:'14px' }}>
            Get instant alerts for new tickets and urgent requests — even when the app is in the background.
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={handleAllow}
              style={{ flex:1, padding:'10px', background:'#C9A84C', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'700', color:'#1C3D2E', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              {state === 'asking' ? 'Enabling…' : 'Enable notifications'}
            </button>
            <button onClick={() => setShowBanner(false)}
              style={{ padding:'10px 14px', background:'rgba(255,255,255,0.08)', border:'none', borderRadius:'10px', fontSize:'13px', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              Not now
            </button>
          </div>
        </div>
      </div>

      {/* iOS tip */}
      <div style={{ marginTop:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', borderRadius:'10px', fontSize:'11px', color:'rgba(255,255,255,0.4)', lineHeight:'1.5' }}>
        📱 <strong style={{ color:'rgba(255,255,255,0.6)' }}>iPhone users:</strong> tap Share → "Add to Home Screen" first for best results.
      </div>
    </div>
  )
}
