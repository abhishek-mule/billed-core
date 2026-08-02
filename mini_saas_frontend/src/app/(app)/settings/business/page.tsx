"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Store, Phone, Mail, MapPin, CreditCard, FileText, Landmark,
  Save, CheckCircle2, AlertCircle, Upload, X, Smartphone, Receipt, ScrollText,
  Clock, Palette,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { getCookie, setCookie } from "@/lib/cookies"

interface BusinessHours {
  enabled: boolean
  days: string[]
  start: string
  end: string
}

interface BusinessIdentity {
  name: string
  phone: string
  email: string
  address: string
  upiId: string
  gstin: string
  pan: string
  logo: string
  invoicePrefix: string
  invoiceFooter: string
  paymentTerms: string
  whatsappBusinessNumber: string
  brandColor: string
  businessHours: BusinessHours
}

const PAYMENT_TERMS_OPTIONS = [
  { value: "Due on receipt", label: "Immediate — Due on receipt" },
  { value: "Due in 7 days", label: "7 Days" },
  { value: "Due in 15 days", label: "15 Days" },
  { value: "Due in 30 days", label: "30 Days" },
  { value: "Due in 45 days", label: "45 Days" },
  { value: "Due in 60 days", label: "60 Days" },
]

const WEEKDAYS = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
]

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: false, days: ["mon", "tue", "wed", "thu", "fri", "sat"],
  start: "09:30", end: "19:00",
}

function validateGSTIN(v: string): string | null {
  if (!v) return null
  if (v.length !== 15) return "GSTIN must be exactly 15 characters"
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v))
    return "Invalid GSTIN format"
  return null
}

function validatePAN(v: string): string | null {
  if (!v) return null
  if (v.length !== 10) return "PAN must be exactly 10 characters"
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v))
    return "Invalid PAN format"
  return null
}

function validateEmail(v: string): string | null {
  if (!v) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    return "Invalid email format"
  return null
}

function validatePhone(v: string): string | null {
  if (!v) return null
  const digits = v.replace(/\D/g, "")
  if (digits.length !== 10) return "Phone must be 10 digits"
  return null
}

function validateInvoicePrefix(v: string): string | null {
  if (!v) return "Invoice prefix is required"
  if (!/^[A-Za-z0-9-]+$/.test(v)) return "Only letters, numbers, and hyphens allowed"
  if (v.length > 10) return "Prefix too long (max 10 chars)"
  return null
}

export default function BusinessIdentityPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [paymentTermsCustom, setPaymentTermsCustom] = useState(false)
  const [identity, setIdentity] = useState<BusinessIdentity>({
    name: "", phone: "", email: "", address: "", upiId: "",
    gstin: "", pan: "", logo: "", invoicePrefix: "INV-",
    invoiceFooter: "", paymentTerms: "Due in 30 days",
    whatsappBusinessNumber: "", brandColor: "#1e293b",
    businessHours: { ...DEFAULT_BUSINESS_HOURS },
  })

  useEffect(() => {
    const load = async () => {
      try {
        const tenantId = getCookie("bz_tenant")
        if (!tenantId) { router.push("/auth"); return }
        const data = await db().tenants.get(tenantId)
        if (data) {
          const hours = data.businessHours || DEFAULT_BUSINESS_HOURS
          setIdentity({
            name: data.name || "",
            phone: data.phone || "",
            email: data.email || "",
            address: data.address || "",
            upiId: data.upiId || "",
            gstin: data.gstin || "",
            pan: data.pan || "",
            logo: data.logo || "",
            invoicePrefix: data.invoicePrefix || "INV-",
            invoiceFooter: data.invoiceFooter || "",
            paymentTerms: data.paymentTerms || "Due in 30 days",
            whatsappBusinessNumber: data.whatsappBusinessNumber || "",
            brandColor: data.brandColor || "#1e293b",
            businessHours: {
              enabled: hours.enabled ?? false,
              days: Array.isArray(hours.days) ? hours.days : ["mon","tue","wed","thu","fri","sat"],
              start: hours.start || "09:30",
              end: hours.end || "19:00",
            },
          })
          const pt = data.paymentTerms || "Due in 30 days"
          setPaymentTermsCustom(!PAYMENT_TERMS_OPTIONS.some(o => o.value === pt))
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const invoicePreview = identity.invoicePrefix
    ? `${identity.invoicePrefix}000124`
    : "INV-000124"

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    const gst = validateGSTIN(identity.gstin.toUpperCase())
    if (gst) errs.gstin = gst
    const pan = validatePAN(identity.pan.toUpperCase())
    if (pan) errs.pan = pan
    const em = validateEmail(identity.email)
    if (em) errs.email = em
    const ph = validatePhone(identity.phone)
    if (ph) errs.phone = ph
    const ip = validateInvoicePrefix(identity.invoicePrefix)
    if (ip) errs.invoicePrefix = ip
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors(p => ({ ...p, logo: "Logo must be under 5MB" }))
      return
    }
    setUploading(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("logo", file)
      const res = await fetch("/api/merchant/logo", {
        method: "POST", credentials: "include", body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Upload failed")
      }
      const data = await res.json()
      setIdentity(p => ({ ...p, logo: data.url }))
      setFieldErrors(p => { const n = { ...p }; delete n.logo; return n })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const removeLogo = async () => {
    setUploading(true)
    try {
      const res = await fetch("/api/merchant/logo", { method: "DELETE", credentials: "include" })
      if (!res.ok) throw new Error("Failed to remove logo")
      setIdentity(p => ({ ...p, logo: "" }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) throw new Error("Not authenticated")

      const now = new Date().toISOString()
      const updateData: Record<string, any> = {
        name: identity.name?.trim() || undefined,
        phone: identity.phone?.trim() || undefined,
        email: identity.email?.trim() || undefined,
        address: identity.address?.trim() || undefined,
        upiId: identity.upiId?.trim() || undefined,
        gstin: identity.gstin?.toUpperCase().trim() || undefined,
        pan: identity.pan?.toUpperCase().trim() || undefined,
        logo: identity.logo || undefined,
        invoicePrefix: identity.invoicePrefix?.trim() || "INV-",
        invoiceFooter: identity.invoiceFooter?.trim() || undefined,
        paymentTerms: identity.paymentTerms?.trim() || "Due in 30 days",
        whatsappBusinessNumber: identity.whatsappBusinessNumber?.trim() || undefined,
        brandColor: identity.brandColor || "#1e293b",
        businessHours: identity.businessHours,
        updatedAt: now,
      }

      await db().tenants.update(tenantId, updateData)

      const syncRes = await fetch("/api/merchant/business-identity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updateData),
      })

      if (!syncRes.ok) {
        const errData = await syncRes.json().catch(() => ({}))
        throw new Error(errData.error || "Server rejected update")
      }

      if (identity.name) {
        setCookie("bz_tenant_name", identity.name)
        localStorage.setItem("tenantName", identity.name)
      }
      if (identity.logo) localStorage.setItem("tenantLogo", identity.logo)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof BusinessIdentity, value: any) => {
    setIdentity(p => ({ ...p, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors(p => { const n = { ...p }; delete n[key]; return n })
    }
  }

  const toggleDay = (day: string) => {
    setIdentity(p => {
      const days = p.businessHours.days.includes(day)
        ? p.businessHours.days.filter(d => d !== day)
        : [...p.businessHours.days, day]
      return { ...p, businessHours: { ...p.businessHours, days } }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-8 w-48 bg-card border border-border rounded-lg animate-pulse" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-28 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Business Identity</h1>
            <p className="text-sm text-muted-foreground">
              One source of truth for invoices, WhatsApp, payment pages, and receipts
            </p>
          </div>
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-success-soft border border-success rounded-lg text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Business identity saved
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-danger-soft border border-danger rounded-lg text-sm text-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Logo */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Company Logo</p>
              <p className="text-xs text-muted-foreground">
                Appears on invoices, payment pages, WhatsApp messages, dashboard, and shared links
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {identity.logo ? (
              <div className="relative w-20 h-20 rounded-xl border border-border overflow-hidden bg-white shrink-0">
                <img src={identity.logo} alt="Company logo" className="w-full h-full object-contain p-1" />
                <button
                  onClick={removeLogo}
                  disabled={uploading}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/20 flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                    Uploading...
                  </span>
                ) : identity.logo ? "Change Logo" : "Upload Logo"}
              </button>
              <p className="text-[10px] text-muted-foreground mt-1.5">PNG, JPG, WebP, SVG or GIF · Max 5MB</p>
            </div>
          </div>
          {fieldErrors.logo && (
            <p className="text-xs text-danger">{fieldErrors.logo}</p>
          )}
        </div>

        {/* Company Identity */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">Company Identity</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Company Name</label>
            <input
              value={identity.name}
              onChange={e => set("name", e.target.value)}
              placeholder="My Business"
              className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
              </label>
              <input
                value={identity.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="9876543210"
                type="tel"
                className={`w-full h-10 rounded-lg border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${
                  fieldErrors.phone ? "border-danger" : "border-border"
                }`}
              />
              {fieldErrors.phone && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.phone}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>
              </label>
              <input
                value={identity.email}
                onChange={e => set("email", e.target.value)}
                placeholder="business@example.com"
                type="email"
                className={`w-full h-10 rounded-lg border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${
                  fieldErrors.email ? "border-danger" : "border-border"
                }`}
              />
              {fieldErrors.email && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.email}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Business Address</span>
            </label>
            <textarea
              value={identity.address}
              onChange={e => set("address", e.target.value)}
              placeholder="Full business address"
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          {/* Brand Color */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              <span className="flex items-center gap-1"><Palette className="w-3 h-3" /> Brand Color</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={identity.brandColor}
                onChange={e => set("brandColor", e.target.value)}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
              />
              <input
                value={identity.brandColor}
                onChange={e => set("brandColor", e.target.value)}
                placeholder="#1e293b"
                maxLength={7}
                className="w-28 h-10 rounded-lg border border-border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: identity.brandColor || "#1e293b" }} />
                Used on invoices and payment pages
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp & Contact */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">WhatsApp & Contact</p>
              <p className="text-xs text-muted-foreground">Used for customer-facing WhatsApp messages</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> WhatsApp Business Number</span>
            </label>
            <input
              value={identity.whatsappBusinessNumber}
              onChange={e => set("whatsappBusinessNumber", e.target.value)}
              placeholder="+919876543210"
              type="tel"
              className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Separate from your business phone. Used as the sender for WhatsApp Business API.
            </p>
          </div>
        </div>

        {/* Tax & Payment Info */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">Tax & Payment Info</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> GSTIN</span>
              </label>
              <input
                value={identity.gstin}
                onChange={e => set("gstin", e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className={`w-full h-10 rounded-lg border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary uppercase ${
                  fieldErrors.gstin ? "border-danger" : "border-border"
                }`}
              />
              {fieldErrors.gstin && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.gstin}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><Landmark className="w-3 h-3" /> PAN</span>
              </label>
              <input
                value={identity.pan}
                onChange={e => set("pan", e.target.value.toUpperCase())}
                placeholder="AAAAA0000A"
                maxLength={10}
                className={`w-full h-10 rounded-lg border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary uppercase ${
                  fieldErrors.pan ? "border-danger" : "border-border"
                }`}
              />
              {fieldErrors.pan && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.pan}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> UPI ID</span>
            </label>
            <input
              value={identity.upiId}
              onChange={e => set("upiId", e.target.value)}
              placeholder="business@paytm"
              className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Used for payment links, QR codes on invoices, and payment pages
            </p>
          </div>
        </div>

        {/* Invoice Settings */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Invoice Settings</p>
              <p className="text-xs text-muted-foreground">Controls how invoices look and behave</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><Receipt className="w-3 h-3" /> Invoice Prefix</span>
              </label>
              <input
                value={identity.invoicePrefix}
                onChange={e => set("invoicePrefix", e.target.value)}
                placeholder="INV-"
                className={`w-full h-10 rounded-lg border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${
                  fieldErrors.invoicePrefix ? "border-danger" : "border-border"
                }`}
              />
              {fieldErrors.invoicePrefix && <p className="text-[10px] text-danger mt-0.5">{fieldErrors.invoicePrefix}</p>}
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Preview:</span>
                <span className="font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">
                  {invoicePreview}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><ScrollText className="w-3 h-3" /> Payment Terms</span>
              </label>
              {paymentTermsCustom ? (
                <div className="flex gap-2">
                  <input
                    value={identity.paymentTerms}
                    onChange={e => set("paymentTerms", e.target.value)}
                    placeholder="Due in 30 days"
                    className="flex-1 h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => { setPaymentTermsCustom(false); set("paymentTerms", "Due in 30 days") }}
                    className="px-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Presets
                  </button>
                </div>
              ) : (
                <select
                  value={PAYMENT_TERMS_OPTIONS.some(o => o.value === identity.paymentTerms) ? identity.paymentTerms : "other"}
                  onChange={e => {
                    if (e.target.value === "other") {
                      setPaymentTermsCustom(true)
                    } else {
                      set("paymentTerms", e.target.value)
                    }
                  }}
                  className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary bg-card"
                >
                  {PAYMENT_TERMS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  <option value="other">Custom...</option>
                </select>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Shown on invoices</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              <span className="flex items-center gap-1"><ScrollText className="w-3 h-3" /> Invoice Footer</span>
            </label>
            <textarea
              value={identity.invoiceFooter}
              onChange={e => set("invoiceFooter", e.target.value)}
              placeholder="Thank you for your business!"
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Optional message at the bottom of every invoice</p>
          </div>
        </div>

        {/* Business Hours */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Business Hours</p>
              <p className="text-xs text-muted-foreground">
                Used by reminder scheduler and call suggestions to respect your working hours
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={identity.businessHours.enabled}
                onChange={e => set("businessHours", { ...identity.businessHours, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-foreground" />
            </label>
            <span className="text-xs text-foreground">
              {identity.businessHours.enabled ? "Business hours enabled" : "Business hours disabled"}
            </span>
          </div>
          {identity.businessHours.enabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">Working Days</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAYS.map(d => (
                    <button
                      key={d.id}
                      onClick={() => toggleDay(d.id)}
                      className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
                        identity.businessHours.days.includes(d.id)
                          ? "bg-foreground text-background border-foreground"
                          : "bg-card text-muted-foreground border-border hover:border-muted-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Opens</label>
                  <input
                    type="time"
                    value={identity.businessHours.start}
                    onChange={e => set("businessHours", { ...identity.businessHours, start: e.target.value })}
                    className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Closes</label>
                  <input
                    type="time"
                    value={identity.businessHours.end}
                    onChange={e => set("businessHours", { ...identity.businessHours, end: e.target.value })}
                    className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </>
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
            className="flex-1 h-11 rounded-lg bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

      </div>
    </div>
  )
}
