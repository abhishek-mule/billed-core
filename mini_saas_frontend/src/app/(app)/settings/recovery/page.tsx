"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Clock, Bell, MessageCircle, Sun, Moon,
  Calendar, ChevronDown, ChevronUp, Save, CheckCircle2, AlertCircle,
} from "lucide-react"
import { getCookie } from "@/lib/cookies"
import { fetchWithAuth } from "@/lib/fetch-with-auth"

interface RecoverySettings {
  autoReminders: boolean
  firstReminderDays: number
  reminderCadence: 'daily' | 'every_3_days' | 'weekly'
  maxReminders: number
  reminderTone: 'gentle' | 'firm' | 'auto'
  businessHoursStart: string
  businessHoursEnd: string
  skipWeekends: boolean
  autoEscalate: boolean
  escalationDays: number
}

const DEFAULT_SETTINGS: RecoverySettings = {
  autoReminders: false,
  firstReminderDays: 3,
  reminderCadence: 'every_3_days',
  maxReminders: 5,
  reminderTone: 'auto',
  businessHoursStart: '09:00',
  businessHoursEnd: '20:00',
  skipWeekends: true,
  autoEscalate: false,
  escalationDays: 15,
}

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Every day',
  every_3_days: 'Every 3 days',
  weekly: 'Once a week',
}

const TONE_LABELS: Record<string, string> = {
  gentle: 'Gentle only',
  firm: 'Firm only',
  auto: 'Gentle → Firm',
}

export default function RecoverySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<RecoverySettings>(DEFAULT_SETTINGS)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) { router.push('/auth'); return }
      const res = await fetch('/api/tenant/whatsapp-config', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const cfg = data?.config || {}
        setSettings({
          autoReminders: cfg.recoverySettings?.autoReminders ?? DEFAULT_SETTINGS.autoReminders,
          firstReminderDays: cfg.recoverySettings?.firstReminderDays ?? DEFAULT_SETTINGS.firstReminderDays,
          reminderCadence: cfg.recoverySettings?.reminderCadence ?? DEFAULT_SETTINGS.reminderCadence,
          maxReminders: cfg.recoverySettings?.maxReminders ?? DEFAULT_SETTINGS.maxReminders,
          reminderTone: cfg.recoverySettings?.reminderTone ?? DEFAULT_SETTINGS.reminderTone,
          businessHoursStart: cfg.operatingHours?.startTime ?? DEFAULT_SETTINGS.businessHoursStart,
          businessHoursEnd: cfg.operatingHours?.endTime ?? DEFAULT_SETTINGS.businessHoursEnd,
          skipWeekends: cfg.operatingHours?.skipWeekends ?? DEFAULT_SETTINGS.skipWeekends,
          autoEscalate: cfg.recoverySettings?.autoEscalate ?? DEFAULT_SETTINGS.autoEscalate,
          escalationDays: cfg.recoverySettings?.escalationDays ?? DEFAULT_SETTINGS.escalationDays,
        })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const body = {
        config: {
          operatingHours: {
            startTime: settings.businessHoursStart,
            endTime: settings.businessHoursEnd,
            skipWeekends: settings.skipWeekends,
          },
          recoverySettings: {
            autoReminders: settings.autoReminders,
            firstReminderDays: settings.firstReminderDays,
            reminderCadence: settings.reminderCadence,
            maxReminders: settings.maxReminders,
            reminderTone: settings.reminderTone,
            autoEscalate: settings.autoEscalate,
            escalationDays: settings.escalationDays,
          },
        },
      }
      await fetchWithAuth('/api/tenant/whatsapp-config', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-8 w-48 bg-card border border-border rounded-lg animate-pulse" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">UDHARI Recovery</h1>
            <p className="text-sm text-muted-foreground">Auto-reminders, business hours, and escalation rules</p>
          </div>
        </div>

        {/* Status banners */}
        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Settings saved
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Auto-Reminders */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex items-center gap-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Auto-Reminders</p>
              <p className="text-xs text-muted-foreground">Automatically remind customers about pending payments</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.autoReminders}
                onChange={e => setSettings(s => ({ ...s, autoReminders: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-muted dark:bg-muted-foreground/30 rounded-full peer peer-checked:bg-amber-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-card after:rounded-full after:h-5 after:w-5 after:transition-all" />
            </label>
          </div>
          {settings.autoReminders && (
            <div className="p-4 space-y-4">
              {/* First reminder after */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">First reminder after</label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 3, 7].map(days => (
                    <button
                      key={days}
                      onClick={() => setSettings(s => ({ ...s, firstReminderDays: days }))}
                      className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                        settings.firstReminderDays === days
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-border text-muted-foreground hover:border-border'
                      }`}
                    >
                      {days} {days === 1 ? 'day' : 'days'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cadence */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Reminder frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['daily', 'every_3_days', 'weekly'] as const).map(cadence => (
                    <button
                      key={cadence}
                      onClick={() => setSettings(s => ({ ...s, reminderCadence: cadence }))}
                      className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                        settings.reminderCadence === cadence
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-border text-muted-foreground hover:border-border'
                      }`}
                    >
                      {CADENCE_LABELS[cadence]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max reminders */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Max reminders before escalation</label>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 5, 7].map(n => (
                    <button
                      key={n}
                      onClick={() => setSettings(s => ({ ...s, maxReminders: n }))}
                      className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                        settings.maxReminders === n
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-border text-muted-foreground hover:border-border'
                      }`}
                    >
                      {n} reminders
                    </button>
                  ))}
                </div>
              </div>

              {/* Reminder tone */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Reminder tone</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gentle', 'firm', 'auto'] as const).map(tone => (
                    <button
                      key={tone}
                      onClick={() => setSettings(s => ({ ...s, reminderTone: tone }))}
                      className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                        settings.reminderTone === tone
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-border text-muted-foreground hover:border-border'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        {tone === 'gentle' ? <Sun className="w-3 h-3" /> : tone === 'firm' ? <Moon className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                        <span>{TONE_LABELS[tone]}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {settings.reminderTone === 'auto' ? 'Starts gentle, escalates to firm after 2 reminders' :
                   settings.reminderTone === 'gentle' ? 'Polite reminders only, never escalates' :
                   'Direct, urgent language on every reminder'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Business Hours */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Business Hours</p>
              <p className="text-xs text-muted-foreground">Reminders only sent during these hours</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Start time</label>
              <input
                type="time"
                value={settings.businessHoursStart}
                onChange={e => setSettings(s => ({ ...s, businessHoursStart: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">End time</label>
              <input
                type="time"
                value={settings.businessHoursEnd}
                onChange={e => setSettings(s => ({ ...s, businessHoursEnd: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.skipWeekends}
              onChange={e => setSettings(s => ({ ...s, skipWeekends: e.target.checked }))}
              className="h-4 w-4 accent-amber-500 rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">Skip weekends</p>
              <p className="text-xs text-muted-foreground">Don&apos;t send reminders on Saturday and Sunday</p>
            </div>
          </label>
        </div>

        {/* Advanced: Escalation */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full p-4 flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Escalation Rules</p>
              <p className="text-xs text-muted-foreground">Auto-escalate overdue accounts</p>
            </div>
            {advancedOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoEscalate}
                  onChange={e => setSettings(s => ({ ...s, autoEscalate: e.target.checked }))}
                  className="h-4 w-4 accent-amber-500 rounded border-border"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-escalate to firm reminders</p>
                  <p className="text-xs text-muted-foreground">Switch to firm tone after max reminders reached</p>
                </div>
              </label>
              {settings.autoEscalate && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Escalate after days overdue</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[10, 15, 30].map(days => (
                      <button
                        key={days}
                        onClick={() => setSettings(s => ({ ...s, escalationDays: days }))}
                        className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                          settings.escalationDays === days
                            ? 'border-amber-400 bg-amber-50 text-amber-700'
                            : 'border-border text-muted-foreground hover:border-border'
                        }`}
                      >
                        {days} days
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/settings"
            className="flex-1 h-11 rounded-lg border border-border flex items-center justify-center text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-11 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

      </div>
    </div>
  )
}
