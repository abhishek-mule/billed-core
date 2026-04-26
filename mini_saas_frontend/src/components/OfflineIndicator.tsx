'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount, failedCount, syncQueue } = useOfflineQueue()

  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white"
          >
            <div className="px-4 py-3 flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm font-medium">You're offline. Changes will sync when connected.</span>
            </div>
          </motion.div>
        )}

        {isOnline && pendingCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-blue-500 text-white"
          >
            <div className="px-4 py-3 flex items-center justify-center gap-2">
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Syncing {pendingCount} item{pendingCount > 1 ? 's' : ''}...</span>
                </>
              ) : (
                <>
                  <button
                    onClick={() => syncQueue()}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-medium">{pendingCount} pending sync{pendingCount > 1 ? 's' : ''}</span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}

        {isOnline && failedCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500 text-white"
          >
            <div className="px-4 py-3 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">{failedCount} sync failed. Tap to retry.</span>
              <button
                onClick={() => syncQueue()}
                className="ml-2 px-2 py-1 bg-white/20 rounded text-xs font-medium hover:bg-white/30"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function useNetworkStatus() {
  const { isOnline, isSyncing, pendingCount } = useOfflineQueue()
  
  return {
    isOnline,
    isSyncing,
    hasPendingSync: pendingCount > 0,
  }
}