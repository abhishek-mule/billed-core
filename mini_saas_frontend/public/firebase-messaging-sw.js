importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())

const config = (() => {
  const params = new URLSearchParams(self.location.search)
  const apiKey = params.get('apiKey')
  const projectId = params.get('projectId')
  const messagingSenderId = params.get('messagingSenderId')
  const appId = params.get('appId')
  if (!apiKey || !projectId) return null
  return { apiKey, projectId, messagingSenderId, appId }
})()

let messaging: any = null

if (config) {
  firebase.initializeApp(config)
  messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload: any) => {
    const { title, body } = payload.notification || {}
    const data = payload.data || {}
    const url = data.url || '/dashboard'

    self.registration.showNotification(title || 'BillZo', {
      body: body || '',
      icon: '/logo_new.png',
      badge: '/logo-icon.svg',
      tag: data.type || 'billzo-alert',
      requireInteraction: true,
      data: { url, ...data },
      actions: [
        { action: 'open', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  })
}

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification?.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url })
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
