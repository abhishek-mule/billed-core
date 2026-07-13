type NetworkCallback = (online: boolean) => void

const listeners = new Set<NetworkCallback>()

function handleOnline() {
  listeners.forEach((cb) => cb(true))
  scheduleBackgroundSync()
}

function handleOffline() {
  listeners.forEach((cb) => cb(false))
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
}

export function onNetworkChange(cb: NetworkCallback) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export function scheduleBackgroundSync() {
  if (typeof navigator === 'undefined') return
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      const swReg = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }
      if (swReg.sync) {
        swReg.sync.register('sync-billzo').catch(() => {
          window.setTimeout(() => {
            if (isOnline()) {
              window.dispatchEvent(new CustomEvent('billzo:sync'))
            }
          }, 500)
        })
      } else {
        window.setTimeout(() => {
          if (isOnline()) {
            window.dispatchEvent(new CustomEvent('billzo:sync'))
          }
        }, 500)
      }
    })
  } else {
    window.setTimeout(() => {
      if (isOnline()) {
        window.dispatchEvent(new CustomEvent('billzo:sync'))
      }
    }, 500)
  }
}

export function listenForBackgroundSync() {
  if (typeof navigator === 'undefined') return
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'background-sync') {
        window.dispatchEvent(new CustomEvent('billzo:sync'))
      }
    })
  }
}
