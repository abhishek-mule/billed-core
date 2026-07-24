"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, IndianRupee, Smartphone, Building, Banknote,
  Save, CheckCircle2, AlertCircle, Copy, Check, ExternalLink,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { getCookie } from "@/lib/cookies"
import { PaymentEngine } from "@/lib/billzo/payment/engine"
import type { PaymentConfig, PaymentPresentation } from "@/lib/billzo/payment/types"

const DEFAULT_CONFIG: PaymentConfig = { method: 'upi' }

const METHOD_OPTIONS = [
  { value: 'upi', label: 'UPI', icon: Smartphone, desc: 'Google Pay, PhonePe, Paytm' },
  { value: 'bank', label: 'Bank Transfer', icon: Building, desc: 'NEFT / IMPS / RTGS' },
  { value: 'cash', label: 'Cash Only', icon: Banknote, desc: 'No online payments' },
] as const

const PREVIEW_INVOICE = { total: 4250, invoiceNumber: 'INV-PREVIEW' }

export default function ReceivePaymentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    const load = async () => {
      try {
        const tenantId = getCookie("bz_tenant")
        if (!tenantId) { router.push("/auth"); return }
        const data = await db().tenants.get(tenantId)
        if (data?.paymentConfig) {
          setConfig(data.paymentConfig)
        } else if (data?.upiId) {
          setConfig({ method: 'upi', upiId: data.upiId })
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const set = (key: keyof PaymentConfig, value: any) => {
    setConfig(p => ({ ...p, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors(p => { const n = { ...p }; delete n[key]; return n })
    }
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (config.method === 'upi' && !config.upiId) {
      errs.upiId = 'UPI ID is required'
    } else if (config.method === 'upi' && config.upiId && !/^[\w.-]+@[\w.-]+$/.test(config.upiId)) {
      errs.upiId = 'Invalid UPI ID format'
    }
    if (config.method === 'bank') {
      if (!config.bankAccount) errs.bankAccount = 'Account number is required'
      else if (!/^\d{9,18}$/.test(config.bankAccount)) errs.bankAccount = 'Account number must be 9-18 digits'
      if (!config.bankIfsc) errs.bankIfsc = 'IFSC is required'
      else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(config.bankIfsc.toUpperCase())) errs.bankIfsc = 'Invalid IFSC format'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) throw new Error("Not authenticated")

      const cleanConfig: PaymentConfig = { method: config.method }
      if (config.method === 'upi') {
        cleanConfig.upiId = config.upiId?.trim()
        cleanConfig.upiVerifiedByMerchant = config.upiVerifiedByMerchant
      }
      if (config.method === 'bank') {
        cleanConfig.bankAccount = config.bankAccount?.trim()
        cleanConfig.bankIfsc = config.bankIfsc?.toUpperCase().trim()
        cleanConfig.bankName = config.bankName?.trim()
        cleanConfig.accountHolderName = config.accountHolderName?.trim()
      }

      const now = new Date().toISOString()
      await db().tenants.update(tenantId, { paymentConfig: cleanConfig, updatedAt: now })

      const syncRes = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section: "payment", data: cleanConfig }),
      })

      if (!syncRes.ok) {
        const errData = await syncRes.json().catch(() => ({}))
        throw new Error(errData.error || "Server rejected update")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const preview = useMemo<PaymentPresentation | null>(() => {
    if (!config.method) return null
    return PaymentEngine.buildPresentation({ invoice: PREVIEW_INVOICE, paymentConfig: config })
  }, [config])

  const isConfigured = config.method === 'cash' ||
    (config.method === 'upi' && !!config.upiId) ||
    (config.method === 'bank' && !!config.bankAccount && !!config.bankIfsc)

  const [copied, setCopied] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-8 w-48 bg-card border border-border rounded-lg animate-pulse" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Receive Payments</h1>
            <p className="text-sm text-muted-foreground">Choose how customers pay you</p>
          </div>
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-success-soft border border-success rounded-lg text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>Payment method saved successfully.<br />We recommend sending yourself one sample invoice and completing a ₹1 payment to confirm everything works correctly.</div>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-danger-soft border border-danger rounded-lg text-sm text-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left: Configuration */}
          <div className="lg:col-span-3 space-y-5">

            {/* Method selection */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <IndianRupee className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">Payment Method</p>
              </div>
              <div className="grid gap-2">
                {METHOD_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const selected = config.method === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setConfig(p => ({
                          method: opt.value as PaymentConfig['method'],
                          ...(opt.value === 'upi' ? { upiId: p.upiId, upiVerifiedByMerchant: p.upiVerifiedByMerchant } : {}),
                          ...(opt.value === 'bank' ? { bankAccount: p.bankAccount, bankIfsc: p.bankIfsc, bankName: p.bankName, accountHolderName: p.accountHolderName } : {}),
                        } as PaymentConfig))
                        setFieldErrors({})
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selected ? 'border-primary' : 'border-muted-foreground/30'
                      }`}>
                        {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Configuration fields */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  {config.method === 'upi' ? <Smartphone className="w-4 h-4 text-muted-foreground" /> :
                   config.method === 'bank' ? <Building className="w-4 h-4 text-muted-foreground" /> :
                   <Banknote className="w-4 h-4 text-muted-foreground" />}
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {config.method === 'upi' ? 'UPI Configuration' :
                   config.method === 'bank' ? 'Bank Account Details' :
                   'Cash Only'}
                </p>
              </div>

              {config.method === 'upi' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">UPI ID</label>
                    <input
                      value={config.upiId || ''}
                      onChange={e => set('upiId', e.target.value)}
                      placeholder="shop@paytm"
                      className={`w-full h-10 rounded-lg border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${
                        fieldErrors.upiId ? 'border-danger' : 'border-border'
                      }`}
                    />
                    {fieldErrors.upiId && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.upiId}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1.5">Your UPI VPA (e.g. shop@paytm, name@okaxis)</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.upiVerifiedByMerchant || false}
                      onChange={e => set('upiVerifiedByMerchant', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">I have verified this UPI ID works</p>
                      <p className="text-[10px] text-muted-foreground">Confirmed by scanning QR with another phone</p>
                    </div>
                  </label>
                </div>
              )}

              {config.method === 'bank' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Account Holder Name</label>
                    <input
                      value={config.accountHolderName || ''}
                      onChange={e => set('accountHolderName', e.target.value)}
                      placeholder="Sharma Hardware"
                      className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Account Number</label>
                    <input
                      value={config.bankAccount || ''}
                      onChange={e => set('bankAccount', e.target.value)}
                      placeholder="123456789012"
                      className={`w-full h-10 rounded-lg border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${
                        fieldErrors.bankAccount ? 'border-danger' : 'border-border'
                      }`}
                    />
                    {fieldErrors.bankAccount && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.bankAccount}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">IFSC Code</label>
                      <input
                        value={config.bankIfsc || ''}
                        onChange={e => set('bankIfsc', e.target.value.toUpperCase())}
                        placeholder="HDFC0001234"
                        maxLength={11}
                        className={`w-full h-10 rounded-lg border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary uppercase ${
                          fieldErrors.bankIfsc ? 'border-danger' : 'border-border'
                        }`}
                      />
                      {fieldErrors.bankIfsc && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.bankIfsc}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Bank Name</label>
                      <input
                        value={config.bankName || ''}
                        onChange={e => set('bankName', e.target.value)}
                        placeholder="HDFC Bank"
                        className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {config.method === 'cash' && (
                <p className="text-sm text-muted-foreground py-2">
                  Collect payment directly from the customer.
                </p>
              )}
            </div>
          </div>

          {/* Right: Preview & Status */}
          <div className="lg:col-span-2 space-y-4">

            {/* Status badge */}
            <div className={`rounded-xl border p-4 ${
              isConfigured
                ? 'bg-success-soft border-success'
                : 'bg-warning-soft border-warning'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isConfigured ? 'bg-success' : 'bg-warning'
                }`} />
                <div>
                  <p className={`text-sm font-semibold ${
                    isConfigured ? 'text-success' : 'text-warning'
                  }`}>
                    {isConfigured ? 'Ready to receive payments' : 'Online payments not configured'}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    isConfigured ? 'text-success' : 'text-warning'
                  }`}>
                    {isConfigured
                      ? 'Customers can pay online'
                      : 'Configure a payment method to receive online payments'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live preview — mirrors real invoice */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customer Preview</p>
              </div>
              <div className="p-4">
                {preview && (
                  <div className="space-y-4">
                    {/* Invoice header */}
                    <div className="text-center">
                      <p className="text-xs font-mono text-muted-foreground">{PREVIEW_INVOICE.invoiceNumber}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">₹4,250</p>
                    </div>

                    <div className="border-t border-border" />

                    {/* Method-specific content */}
                    {preview.paymentMethod === 'upi' && preview.metadata.upiId && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-3 py-2.5">
                          <span className="text-sm font-mono text-foreground">{preview.metadata.upiId}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(preview.metadata.upiId)
                              setCopied(true)
                              setTimeout(() => setCopied(false), 2000)
                            }}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                          </button>
                        </div>
                        {preview.button?.url && (
                          <a
                            href={preview.button.url}
                            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            {preview.button.label}
                          </a>
                        )}
                      </div>
                    )}

                    {preview.paymentMethod === 'bank' && (
                      <div className="space-y-2 text-xs">
                        {preview.metadata.accountHolderName && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account Holder</span>
                            <span className="font-medium text-foreground">{preview.metadata.accountHolderName}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account</span>
                          <span className="font-mono text-foreground">{preview.metadata.accountNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IFSC</span>
                          <span className="font-mono text-foreground">{preview.metadata.ifsc}</span>
                        </div>
                        {preview.metadata.bankName && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bank</span>
                            <span className="font-medium text-foreground">{preview.metadata.bankName}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {preview.paymentMethod === 'cash' && (
                      <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        Collect payment directly from the customer.
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      {preview.subtitle}
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
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
            className="flex-1 h-11 rounded-lg bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

      </div>
    </div>
  )
}
