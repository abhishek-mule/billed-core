/**
 * Service Worker Configuration for BillZo
 * Implements offline caching, background sync, and push notifications.
 */
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim, skipWaiting } from 'workbox-core'

// @ts-ignore
precacheAndRoute(self.__WB_MANIFEST || [])

skipWaiting()
clientsClaim()

// Navigation Routing: Always try network first to support auth states
const navigationRoute = new NavigationRoute(new NetworkFirst({
  cacheName: 'start-url',
  plugins: [{
    cacheWillUpdate: async ({ response }) => {
      if (response && response.type === 'opaqueredirect') {
        return new Response(response.body, {
          status: 200,
          statusText: 'OK',
          headers: response.headers,
        })
      }
      return response
    }
  }]
}))
registerRoute(navigationRoute)

// Cache static fonts
registerRoute(
  /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
  new CacheFirst({
    cacheName: 'static-font-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 })]
  })
)

// Cache static images
registerRoute(
  /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
  new CacheFirst({
    cacheName: 'static-image-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 })]
  })
)

// API Caching: Critical data needs network priority
registerRoute(
  /\/api\/(gst|payment|inventory)/i,
  new NetworkFirst({
    cacheName: 'critical-apis',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })]
  })
)

// API Caching: Background/non-critical data can be stale-while-revalidate
registerRoute(
  /\/api\/(dashboard|reports|products)/i,
  new StaleWhileRevalidate({
    cacheName: 'stale-apis',
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 })]
  })
)

// Self-triggered Background Sync for offline transactions
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(
      // Replay pending actions from IndexedDB
      fetch('/api/sync/trigger', { method: 'POST' })
    )
  }
})
