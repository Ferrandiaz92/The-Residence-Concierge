// public/sw.js
// Service worker — handles push events and notification clicks
// Registered by PushPermission.js on dashboard load

const CACHE_NAME = 'residence-concierge-v1'

// ── PUSH EVENT ────────────────────────────────────────────
// Fired when server sends a push notification
self.addEventListener('push', event => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = {
      title: 'The Residence Concierge',
      body:  event.data.text(),
      data:  { url: '/dashboard' },
    }
  }

  const options = {
    body:               payload.body    || '',
    badge:              payload.badge   || '/icons/badge.png',
    icon:               '/icons/icon-192.png',
    vibrate:            payload.vibrate || [200, 100, 200],
    requireInteraction: payload.requireInteraction || false,
    silent:             payload.silent  || false,
    tag:                payload.tag     || 'default',
    data:               payload.data    || {},
    // Action buttons on the notification
    actions: buildActions(payload.data),
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'The Residence Concierge', options)
  )
})

// ── NOTIFICATION CLICK ────────────────────────────────────
// Fired when user taps the notification
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const data   = event.notification.data || {}
  const action = event.action

  // Determine target URL based on action or notification type
  let targetUrl = '/dashboard'
  if (data.url) targetUrl = data.url
  if (data.tab)  targetUrl = `/dashboard?tab=${data.tab}`

  // Handle action buttons
  if (action === 'accept' && data.ticketId) {
    targetUrl = `/dashboard?tab=live&action=accept&ticketId=${data.ticketId}`
  }
  if (action === 'dismiss') {
    return // just close
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If dashboard is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', data })
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})

// ── NOTIFICATION CLOSE ────────────────────────────────────
self.addEventListener('notificationclose', event => {
  // Analytics hook — could log dismissals here if needed
})

// ── PUSH SUBSCRIPTION CHANGE ─────────────────────────────
// Fires when browser rotates the push subscription
// We re-register automatically
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: self.__WEB_PUSH_PUBLIC_KEY,
    }).then(subscription => {
      return fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription }),
      })
    })
  )
})

// ── HELPERS ──────────────────────────────────────────────
function buildActions(data) {
  if (!data) return []

  // Urgent ticket → show Accept button directly in notification
  if (data.type === 'new_ticket' && data.priority === 'urgent') {
    return [
      { action: 'accept',  title: '👍 Accept' },
      { action: 'dismiss', title: 'Dismiss'   },
    ]
  }

  // Escalation → no actions (need to open app to reply)
  return []
}
