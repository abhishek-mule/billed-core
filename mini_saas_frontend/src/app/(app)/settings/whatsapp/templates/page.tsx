'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, Plus, CheckCircle2, AlertCircle, Loader2, Clock, X } from 'lucide-react'
import type { TenantWhatsAppConfig } from '@/lib/billzo/types'

const TEMPLATE_TYPES = [
  { key: 'invoice', label: 'Invoice Notification', desc: 'Sent when a new invoice is created for a customer', placeholder: 'Hello {{1}}, your invoice #{{2}} for ₹{{3}} is ready. Pay now: {{4}}' },
  { key: 'reminderGentle', label: 'Gentle Reminder', desc: 'Soft reminder for pending payments (after 3 days)', placeholder: 'Hi {{1}}, a gentle reminder — ₹{{2}} is pending on invoice #{{3}}. Please pay at your earliest. – {{4}}' },
  { key: 'reminderFirm', label: 'Firm Reminder', desc: 'Urgent reminder for overdue payments (after 7 days)', placeholder: 'URGENT: ₹{{1}} outstanding on invoice #{{2}}. Please clear payment today. – {{3}}' },
  { key: 'receipt', label: 'Payment Receipt', desc: 'Sent automatically after successful payment', placeholder: 'Payment received! ₹{{1}} received from {{2}} for invoice #{{3}}. Thank you! – {{4}}' },
  { key: 'udharGentle', label: 'Udhar Gentle Reminder', desc: 'Soft reminder for udhar/sales on credit', placeholder: 'Hi {{1}}, kind reminder — ₹{{2}} udhar is pending. Please clear when possible. – {{3}}' },
  { key: 'udharFirm', label: 'Udhar Firm Reminder', desc: 'Escalation for old udhar accounts', placeholder: 'URGENT: ₹{{1}} udhar outstanding. Please clear payment today. – {{2}}' },
]

const PLACEHOLDER_HELP = {
  '{{1}}': 'Customer name',
  '{{2}}': 'Amount / Invoice number / Days',
  '{{3}}': 'Invoice number / Shop name',
  '{{4}}': 'Shop name / Payment link',
}

export default function WhatsAppTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createType, setCreateType] = useState('')
  const [createBody, setCreateBody] = useState('')
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [gupshupStatus, setGupshupStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [configRes] = await Promise.all([
        fetch(`/api/tenant/whatsapp-config`, { credentials: 'include' }),
      ])
      if (configRes.ok) {
        const data = await configRes.json()
        setTemplates(data.config?.templateNames || {})
      }
      const statusRes = await fetch(`/api/whatsapp/status`, { credentials: 'include' })
      if (statusRes.ok) setGupshupStatus('ok')
      else if (statusRes.status !== 404) setGupshupStatus('error')
    } catch {
      setGupshupStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const saveTemplate = async () => {
    if (!createType || !createBody.trim()) return
    setSaving(true)
    setError('')
    try {
      const newTemplates = { ...templates, [createType]: createBody.trim() }
      const res = await fetch(`/api/tenant/whatsapp-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: { templateNames: newTemplates } }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setTemplates(newTemplates)
      setShowCreate(false)
      setCreateType('')
      setCreateBody('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (key: string) => {
    const newTemplates = { ...templates }
    delete newTemplates[key]
    setSaving(true)
    try {
      await fetch(`/api/tenant/whatsapp-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: { templateNames: newTemplates } }),
      })
      setTemplates(newTemplates)
    } finally {
      setSaving(false)
    }
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
        <button onClick={() => router.push('/settings/whatsapp')} className="p-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Templates</h1>
          <p className="text-sm text-muted-foreground">Define message templates for auto-send and reminders</p>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Template saved!
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Meta Template Requirements</p>
            <p className="text-xs text-amber-700 mt-1">
              WhatsApp Business API requires pre-approved templates. After creating here, submit via{' '}
              <a href="https://business.facebook.com" target="_blank" rel="noopener" className="underline">
                Meta Business Suite
              </a>{' '}
              or your Gupshup dashboard. Utility templates are cheapest to approve.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {TEMPLATE_TYPES.map(({ key, label, desc, placeholder }) => {
          const hasTemplate = !!templates[key]
          return (
            <div key={key} className="rounded-2xl border bg-card shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{label}</span>
                    {hasTemplate ? (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Template set
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-medium">Not configured</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <div className="flex gap-2">
                  {hasTemplate && (
                    <button
                      onClick={() => deleteTemplate(key)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Remove template"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setCreateType(key); setCreateBody(templates[key] || placeholder); setShowCreate(true) }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border"
                  >
                    {hasTemplate ? 'Edit' : 'Add'}
                  </button>
                </div>
              </div>
              {hasTemplate && (
                <div className="px-4 pb-4">
                  <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground font-mono leading-relaxed">
                    {templates[key]}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(PLACEHOLDER_HELP).map(([ph, help]) => (
                      <span key={ph} className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                        {ph} = {help}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Edit Template — {TEMPLATE_TYPES.find(t => t.key === createType)?.label}</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5">Message Body</label>
                <textarea
                  value={createBody}
                  onChange={e => setCreateBody(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border bg-card px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Available placeholders:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PLACEHOLDER_HELP).map(([ph, help]) => (
                    <span key={ph} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg">
                      <span className="font-mono font-semibold">{ph}</span>{' '}
                      <span className="text-indigo-400">= {help}</span>
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                After saving, submit this template in Meta Business Suite or Gupshup for approval. Once approved, it will be used for sending messages.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t bg-muted/50">
              <button onClick={() => setShowCreate(false)} className="flex-1 h-11 rounded-xl border font-medium">Cancel</button>
              <button
                onClick={saveTemplate}
                disabled={saving || !createBody.trim()}
                className="flex-1 h-11 rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}