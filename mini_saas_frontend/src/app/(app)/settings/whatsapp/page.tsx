'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import type { TenantWhatsAppConfig } from '@/lib/billzo/types'

const DEFAULT_CONFIG: TenantWhatsAppConfig = {
  autoSend: false,
  paymentLinkEnabled: false,
  paymentLinkExpiry: 7,
  optInMessage: 'Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.',
  templateNames: {},
}

export default function WhatsAppSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<TenantWhatsAppConfig>(DEFAULT_CONFIG)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) { router.push('/auth'); return }

      const res = await fetch(`/api/tenant/whatsapp-config`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setConfig({ ...DEFAULT_CONFIG, ...data.config })
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
      const res = await fetch(`/api/tenant/whatsapp-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof TenantWhatsAppConfig>(key: K, value: TenantWhatsAppConfig[K]) => {
    setConfig(c => ({ ...c, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="p-2 rounded-xl hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Settings</h1>
          <p className="text-sm text-muted-foreground">Configure your WhatsApp Business integration</p>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Settings saved successfully!
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b">
          <MessageCircle className="h-5 w-5 text-green-600" />
          <h2 className="font-bold text-lg">Gupshup API Configuration</h2>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1.5">Gupshup API Key</label>
          <div className="relative">
            <input
              value={config.gupshupApiKey || ''}
              onChange={e => set('gupshupApiKey', e.target.value)}
              type={showApiKey ? 'text' : 'password'}
              placeholder="Enter your Gupshup API key"
              className="w-full h-11 rounded-xl border bg-card px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Get your API key from{' '}
            <a href="https://www.gupshup.io" target="_blank" rel="noopener" className="text-indigo-600 underline">
              gupshup.io
            </a>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">App Name</label>
            <input
              value={config.gupshupAppName || ''}
              onChange={e => set('gupshupAppName', e.target.value)}
              placeholder="My App"
              className="w-full h-11 rounded-xl border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">Source Number</label>
            <input
              value={config.sourceNumber || ''}
              onChange={e => set('sourceNumber', e.target.value)}
              placeholder="919876543210"
              type="tel"
              className="w-full h-11 rounded-xl border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-5">
        <div>
          <h2 className="font-bold text-lg mb-1">Auto-Send Settings</h2>
          <p className="text-xs text-muted-foreground">Control when WhatsApp messages are sent automatically</p>
        </div>

        <label className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer hover:bg-slate-50">
          <div className="flex-1">
            <div className="text-sm font-semibold">Auto-send invoice via WhatsApp</div>
            <div className="text-xs text-muted-foreground">
              Automatically send WhatsApp message after invoice creation
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.autoSend}
            onChange={e => set('autoSend', e.target.checked)}
            className="h-5 w-5 accent-green-600"
          />
        </label>

        <label className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer hover:bg-slate-50">
          <div className="flex-1">
            <div className="text-sm font-semibold">Include payment links</div>
            <div className="text-xs text-muted-foreground">
              Generate and include UPI payment links in WhatsApp messages
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.paymentLinkEnabled}
            onChange={e => set('paymentLinkEnabled', e.target.checked)}
            className="h-5 w-5 accent-green-600"
          />
        </label>

        {config.paymentLinkEnabled && (
          <div>
            <label className="block text-sm font-semibold mb-1.5">Payment Link Expiry</label>
            <div className="grid grid-cols-3 gap-2">
              {[7, 15, 30].map(days => (
                <button
                  key={days}
                  onClick={() => set('paymentLinkExpiry', days)}
                  className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                    config.paymentLinkExpiry === days
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-input hover:border-green-300'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-lg mb-1">Opt-in Message</h2>
          <p className="text-xs text-muted-foreground">
            Shown to customers when sending the first WhatsApp message (if they haven't opted in)
          </p>
        </div>
        <textarea
          value={config.optInMessage || ''}
          onChange={e => set('optInMessage', e.target.value)}
          rows={3}
          className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Hi {{name}}, you have been added as a customer..."
        />
      </div>

      <div className="flex gap-3">
        <button onClick={() => router.push('/settings')} className="flex-1 h-12 rounded-xl border font-medium">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 h-12 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}