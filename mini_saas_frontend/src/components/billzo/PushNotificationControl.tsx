'use client'

import { useState, useEffect } from 'react'
import { Bell, Smartphone, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export function PushNotificationControl({ tenantId }: { tenantId: string }) {
  const [permission, setPermission] = useState<string>('default')
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const handleEnable = async () => {
    setBusy(true)
    setStatusMsg(null)
    try {
      const { registerDevice } = await import('@/lib/billzo/notifications')
      const result = await registerDevice(tenantId)
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission)
      }
      if (result.success) {
        setStatusMsg('✅ Push notifications enabled successfully!')
      } else {
        setStatusMsg(`⚠️ ${result.reason || 'Notification permission not granted or Firebase config missing.'}`)
      }
    } catch (err: any) {
      setStatusMsg(`❌ Error: ${err.message || 'Failed to enable notifications'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleTestPush = async () => {
    setBusy(true)
    setStatusMsg(null)
    const title = '💰 Payment Received'
    const body = 'Rajesh Traders paid ₹2,450 via UPI'
    try {
      // Trigger native browser Notification banner directly
      const { showLocalNotification } = await import('@/lib/billzo/notifications')
      showLocalNotification(title, body)

      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          type: 'payment_received',
          url: '/invoices',
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (data.simulated) {
          setStatusMsg(`⚠️ Local banner shown, but NO server push — Firebase Admin not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON (and NEXT_PUBLIC_FIREBASE_VAPID_KEY) in Vercel, then redeploy, for real mobile push.`)
        } else if (typeof data.deliveredCount === 'number' && data.deliveredCount === 0) {
          setStatusMsg(`⚠️ No devices delivered (${data.failedCount ?? 0} failed) — FCM tokens invalid/not registered. On your phone tap Re-register Device, grant permission, keep the app open.`)
        } else {
          setStatusMsg(`✅ Push sent! Delivered to ${data.deliveredCount} device(s). Check your phone lockscreen.`)
        }
      } else {
        setStatusMsg(`⚠️ Test push output: ${data.error || data.message || 'No registered devices'}`)
      }
    } catch (err: any) {
      setStatusMsg(`❌ Error: ${err.message || 'Failed to send test push'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span>Firebase FCM Push Notifications</span>
              {permission === 'granted' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Enabled
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Permission: {permission}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receive instant alerts for payments received, broken promises, and recovery updates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEnable}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
            {permission === 'granted' ? 'Re-register Device' : 'Enable Notifications'}
          </button>

          <button
            onClick={handleTestPush}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            Send Test Push
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-lg bg-muted/60 border border-border text-xs font-medium text-foreground">
          {statusMsg}
        </div>
      )}
    </div>
  )
}
