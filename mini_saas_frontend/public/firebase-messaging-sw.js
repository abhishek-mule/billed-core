importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

self.addEventListener('install', function () {
  self.skipWaiting()
})
self.addEventListener('activate', function () {
  self.clients.claim()
})

const config = (function () {
  const params = new URLSearchParams(self.location.search)
  const apiKey = params.get('apiKey')
  const projectId = params.get('projectId')
  const messagingSenderId = params.get('messagingSenderId')
  const appId = params.get('appId')
  if (!apiKey || !projectId) return null
  return { apiKey, projectId, messagingSenderId, appId }
})()

let messaging = null

if (config) {
  firebase.initializeApp(config)
  messaging = firebase.messaging()

  messaging.onBackgroundMessage(function (payload) {
    const title = payload.notification ? payload.notification.title : null
    const body = payload.notification ? payload.notification.body : null
    const data = payload.data || {}
    const url = data.url || '/dashboard'

    self.registration.showNotification(title || 'BillZo', {
      body: body || '',
      icon: '/logo.svg',
      badge: '/logo.svg',
      tag: data.type || 'billzo-alert',
      requireInteraction: true,
      data: { url: url, ...data },
      actions: [
        { action: 'open', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  })
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification && event.notification.data ? event.notification.data.url : '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: url })
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
