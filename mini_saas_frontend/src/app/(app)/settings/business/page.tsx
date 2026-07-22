"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Store, Phone, Mail, MapPin, CreditCard, FileText, Landmark,
  Save, CheckCircle2, AlertCircle, Upload, X,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { getCookie, setCookie } from "@/lib/cookies"

interface BusinessProfile {
  name: string
  phone: string
  email: string
  address: string
  upiId: string
  gstin: string
  pan: string
  logo: string
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

export default function BusinessProfilePage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<BusinessProfile>({
    name: "", phone: "", email: "", address: "", upiId: "", gstin: "", pan: "", logo: "",
  })

  useEffect(() => {
    const load = async () => {
      try {
        const tenantId = getCookie("bz_tenant")
        if (!tenantId) { router.push("/auth"); return }
        const data = await db().tenants.get(tenantId)
        if (data) {
          setProfile({
            name: data.name || "",
            phone: data.phone || "",
            email: data.email || "",
            address: data.address || "",
            upiId: data.upiId || "",
            gstin: data.gstin || "",
            pan: data.pan || "",
            logo: data.logo || "",
          })
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    const gst = validateGSTIN(profile.gstin.toUpperCase())
    if (gst) errs.gstin = gst
    const pan = validatePAN(profile.pan.toUpperCase())
    if (pan) errs.pan = pan
    const em = validateEmail(profile.email)
    if (em) errs.email = em
    const ph = validatePhone(profile.phone)
    if (ph) errs.phone = ph
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors(p => ({ ...p, logo: "Logo must be under 2MB" }))
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setProfile(p => ({ ...p, logo: dataUrl }))
      setFieldErrors(p => { const n = { ...p }; delete n.logo; return n })
    }
    reader.readAsDataURL(file)
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
        name: profile.name?.trim() || undefined,
        phone: profile.phone?.trim() || undefined,
        email: profile.email?.trim() || undefined,
        address: profile.address?.trim() || undefined,
        upiId: profile.upiId?.trim() || undefined,
        gstin: profile.gstin?.toUpperCase().trim() || undefined,
        pan: profile.pan?.toUpperCase().trim() || undefined,
        logo: profile.logo || undefined,
        updatedAt: now,
      }

      await db().tenants.update(tenantId, updateData)

      const syncRes = await fetch("/api/tenant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updateData),
      })

      if (!syncRes.ok) {
        const errData = await syncRes.json().catch(() => ({}))
        throw new Error(errData.error || "Server rejected update")
      }

      if (profile.name) {
        setCookie("bz_tenant_name", profile.name)
        localStorage.setItem("tenantName", profile.name)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof BusinessProfile, value: string) => {
    setProfile(p => ({ ...p, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors(p => { const n = { ...p }; delete n[key]; return n })
    }
  }

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
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Business Profile</h1>
            <p className="text-sm text-muted-foreground">Shop name, logo, address, GST, PAN, UPI ID</p>
          </div>
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-success-soft border border-success rounded-lg text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Business profile saved
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
              <p className="text-sm font-semibold text-foreground">Shop Logo</p>
              <p className="text-xs text-muted-foreground">Appears on invoices, payment pages, and shared links</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {profile.logo ? (
              <div className="relative w-20 h-20 rounded-xl border border-border overflow-hidden bg-white shrink-0">
                <img src={profile.logo} alt="Shop logo" className="w-full h-full object-contain p-1" />
                <button
                  onClick={() => set("logo", "")}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"
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
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {profile.logo ? "Change Logo" : "Upload Logo"}
              </button>
              <p className="text-[10px] text-muted-foreground mt-1.5">PNG, JPG or SVG · Max 2MB</p>
            </div>
          </div>
          {fieldErrors.logo && (
            <p className="text-xs text-danger">{fieldErrors.logo}</p>
          )}
        </div>

        {/* Shop Identity */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">Shop Identity</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Shop name</label>
            <input
              value={profile.name}
              onChange={e => set("name", e.target.value)}
              placeholder="My Shop"
              className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
              </label>
              <input
                value={profile.phone}
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
                value={profile.email}
                onChange={e => set("email", e.target.value)}
                placeholder="shop@example.com"
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
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Address</span>
            </label>
            <textarea
              value={profile.address}
              onChange={e => set("address", e.target.value)}
              placeholder="Shop address"
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
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
                value={profile.gstin}
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
                value={profile.pan}
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
              value={profile.upiId}
              onChange={e => set("upiId", e.target.value)}
              placeholder="shop@paytm"
              className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Used for payment links in invoices</p>
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
