'use client'

import { useEffect, useState } from 'react'
import {
  Bell,
  RotateCcw,
  MessageSquare,
  IndianRupee,
  Package,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { defaultNotificationPreferences, type NotificationPreferences } from '@billzo/shared'

// ─── Preference rows (category toggles, tenant-scoped, server is source) ───

const PREFERENCE_ROWS: {
  key: keyof Pick<NotificationPreferences, 'recovery' | 'payments' | 'inventory' | 'backInStock'>
  icon: React.ElementType
  title: string
  description: string
}[] = [
  {
    key: 'recovery',
    icon: RotateCcw,
    title: 'Recovery alerts',
    description: 'Promises broken, customers needing attention, payments that resolve a recovery case',
  },
  {
    key: 'payments',
    icon: IndianRupee,
    title: 'Payment alerts',
    description: 'When a customer pays, invoice settlements land in your notification center',
  },
  {
    key: 'inventory',
    icon: Package,
    title: 'Inventory alerts',
    description: 'Low stock and out-of-stock transitions for your products',
  },
  {
    key: 'backInStock',
    icon: RefreshCw,
    title: 'Back in stock notices',
    description: 'Optional — tell you when an out-of-stock product is back. Off by default to avoid noise',
  },
]

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function NotificationPreferencesControl() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultNotificationPreferences())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/notifications/preferences', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load preferences')
        const data = await res.json()
        if (active) setPrefs({ ...defaultNotificationPreferences(), ...data.preferences })
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load preferences')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const toggle = async (
    key: keyof Pick<NotificationPreferences, 'pushEnabled' | 'recovery' | 'payments' | 'inventory' | 'backInStock'>,
  ) => {
    const next = !prefs[key]
    setSaving(true)
    setPendingKeys((k) => [...k, key])
    setError(null)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save preference')
      }
      const data = await res.json()
      setPrefs((prev) => ({ ...prev, ...data.preferences }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save preference')
    } finally {
      setSaving(false)
      setPendingKeys((k) => k.filter((x) => x !== key))
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-info-soft text-info flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Notification preferences</h3>
          <p className="text-xs text-muted-foreground">
            These control what lands in your notification center. You can still receive important alerts anytime.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {PREFERENCE_ROWS.map(({ key, icon: Icon, title, description }) => (
          <div key={key} className="flex items-center gap-3 py-3">
            <div className="w-8 h-8 rounded-lg bg-muted/50 text-muted-foreground flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
            </div>
            <Toggle on={prefs[key]} disabled={saving && !pendingKeys.includes(key)} onToggle={() => toggle(key)} />
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">
          {saving ? 'Saving…' : 'Changes apply immediately to your notification center and delivery.'}
        </p>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-danger-soft/50 border border-danger/30 text-xs font-medium text-danger inline-flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
    </div>
  )
}