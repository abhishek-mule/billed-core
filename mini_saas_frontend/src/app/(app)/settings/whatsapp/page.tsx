"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ArrowLeft, MessageCircle, CheckCircle2, AlertCircle, LayoutTemplate, ChevronRight,
} from "lucide-react"
import type { TenantWhatsAppConfig } from "@/lib/billzo/types"
import { getCookie } from "@/lib/cookies"
import { fetchWithAuth } from "@/lib/fetch-with-auth"
import { getErrorMessage } from "@/lib/billzo/ui-errors"

import { PageShell } from "@/components/billzo/PageShell"

const DEFAULT_CONFIG: TenantWhatsAppConfig = {
  autoSend: false,
  paymentLinkEnabled: false,
  paymentLinkExpiry: 7,
  optInMessage: "Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.",
  templateNames: {},
}

export default function PaymentRemindersSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [config, setConfig] = useState<TenantWhatsAppConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) return
      const res = await fetch("/api/tenant/whatsapp-config", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setConfig({ ...DEFAULT_CONFIG, ...data.config })
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load WhatsApp settings'))
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      await fetchWithAuth("/api/tenant/whatsapp-config", {
        method: "PUT",
        body: JSON.stringify({ config }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save settings'))
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof TenantWhatsAppConfig>(key: K, value: TenantWhatsAppConfig[K]) => {
    setConfig(c => ({ ...c, [key]: value }))
  }

  if (loading) {
    return (
      <PageShell variant="narrow" title="Payment Reminders" subtitle="BillZo sends payment reminders automatically">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-card border border-border rounded-lg animate-pulse" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell variant="narrow" title="Payment Reminders" subtitle="BillZo sends payment reminders automatically">
      <div className="space-y-5">

        <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Settings
        </Link>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-success-soft border border-success rounded-lg text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Settings saved
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-danger-soft border border-danger rounded-lg text-sm text-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Status banner — BillZo owns the reminder channel (Meta WABA) */}
        <div className="rounded-lg border border-success bg-success-soft p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Automatic payment reminders enabled</p>
            <p className="text-xs text-muted-foreground">BillZo delivers reminders over WhatsApp on your behalf. No setup needed.</p>
          </div>
        </div>

        {/* Templates link */}
        <Link
          href="/settings/whatsapp/templates"
          className="bg-card border border-border rounded-lg p-4 flex items-center gap-3 hover:border-border transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-info-soft flex items-center justify-center shrink-0">
            <LayoutTemplate className="w-4 h-4 text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Message Templates</p>
            <p className="text-xs text-muted-foreground">Customize invoice, reminder, and receipt templates</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>

        {/* Auto-Send */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Auto-Send</p>
              <p className="text-xs text-muted-foreground">Control when messages go out automatically</p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoSend}
              onChange={e => set("autoSend", e.target.checked)}
              className="h-4 w-4 accent-emerald-500 rounded border-border"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Auto-send invoice via WhatsApp</p>
              <p className="text-xs text-muted-foreground">After creating an invoice</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.paymentLinkEnabled}
              onChange={e => set("paymentLinkEnabled", e.target.checked)}
              className="h-4 w-4 accent-emerald-500 rounded border-border"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Include payment links</p>
              <p className="text-xs text-muted-foreground">Add UPI payment links in messages</p>
            </div>
          </label>

          {config.paymentLinkEnabled && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Payment link expiry</label>
              <div className="grid grid-cols-3 gap-2">
                {[7, 15, 30].map(days => (
                  <button
                    key={days}
                    onClick={() => set("paymentLinkExpiry", days)}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      config.paymentLinkExpiry === days
                        ? "border-success bg-success-soft text-success"
                        : "border-border text-muted-foreground hover:border-border"
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Opt-in message */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Opt-in Message</p>
            <p className="text-xs text-muted-foreground">First message sent to new customers before regular messages</p>
          </div>
          <textarea
            value={config.optInMessage || ""}
            onChange={e => set("optInMessage", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            placeholder="Hi {{name}}..."
          />
          <p className="text-[10px] text-muted-foreground">
            {"Use {{name}} for customer name, {{link}} for payment link"}
          </p>
        </div>

        {/* Save */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/settings"
            className="flex-1 h-11 rounded-lg border border-border flex items-center justify-center text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-11 rounded-lg bg-success text-white text-sm font-semibold hover:bg-success disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

      </div>
    </PageShell>
  )
}
