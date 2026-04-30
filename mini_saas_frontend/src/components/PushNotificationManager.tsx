'use client'

import { Bell, BellOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { usePushNotification } from '@/hooks/usePushNotification'

export function PushNotificationManager() {
  const {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification
  } = usePushNotification()

  if (!isSupported) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-amber-900">Push Notifications Not Supported</h3>
          <p className="text-sm text-amber-700 mt-1">
            Your browser doesn't support push notifications. Please use a modern browser like Chrome, Firefox, or Safari.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${isSubscribed ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-600'}`}>
            {isSubscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Push Notifications</h3>
            <p className="text-sm text-gray-500">
              {permission === 'granted' 
                ? 'You will receive notifications for important updates' 
                : 'Enable notifications to stay updated'}
            </p>
          </div>
        </div>
        
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
          permission === 'granted' 
            ? 'bg-emerald-100 text-emerald-700' 
            : permission === 'denied'
            ? 'bg-red-100 text-red-700'
            : 'bg-gray-100 text-gray-700'
        }`}>
          {permission === 'granted' && <CheckCircle className="w-3.5 h-3.5" />}
          {permission.charAt(0).toUpperCase() + permission.slice(1)}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {permission === 'default' && (
          <button
            onClick={requestPermission}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Requesting...
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                Enable Notifications
              </>
            )}
          </button>
        )}

        {permission === 'granted' && (
          <>
            {isSubscribed ? (
              <button
                onClick={unsubscribe}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Unsubscribing...
                  </>
                ) : (
                  <>
                    <BellOff className="w-4 h-4" />
                    Disable Notifications
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={subscribe}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    Enable Notifications
                  </>
                )}
              </button>
            )}

            {isSubscribed && (
              <button
                onClick={sendTestNotification}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl font-medium hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Send Test
                  </>
                )}
              </button>
            )}
          </>
        )}

        {permission === 'denied' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium">Notifications are blocked</p>
            <p className="mt-1">To enable notifications, go to your browser settings and allow notifications for this site.</p>
          </div>
        )}
      </div>

      {isSubscribed && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">You'll receive notifications for:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• New invoices created</li>
            <li>• Payment reminders</li>
            <li>• Low stock alerts</li>
            <li>• Important business updates</li>
          </ul>
        </div>
      )}
    </div>
  )
}