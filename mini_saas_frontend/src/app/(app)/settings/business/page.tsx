"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Store, Phone, Mail, MapPin, CreditCard, FileText, Landmark,
  Save, CheckCircle2, AlertCircle,
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
}

export default function BusinessProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [profile, setProfile] = useState<BusinessProfile>({
    name: "", phone: "", email: "", address: "", upiId: "", gstin: "", pan: "",
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

  const save = async () => {
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) throw new Error("Not authenticated")

      // Save locally
      const now = new Date().toISOString()
      await db().tenants.update(tenantId, {
        name: profile.name || undefined,
        phone: profile.phone || undefined,
        email: profile.email || undefined,
        address: profile.address || undefined,
        upiId: profile.upiId || undefined,
        gstin: profile.gstin || undefined,
        pan: profile.pan || undefined,
        updatedAt: now,
      })

      // Sync to server
      const syncRes = await fetch("/api/tenant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile),
      })

      // Update cookie + localStorage so AppShell reflects the new name immediately
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

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Business Profile</h1>
            <p className="text-sm text-muted-foreground">Shop name, address, GST, PAN, UPI ID</p>
          </div>
        </div>

        {/* Status */}
        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Business profile saved
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

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
                className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
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
                className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
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
                onChange={e => set("gstin", e.target.value)}
                placeholder="22AAAAA0000A1Z5"
                className="w-full h-10 rounded-lg border border-border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                <span className="flex items-center gap-1"><Landmark className="w-3 h-3" /> PAN</span>
              </label>
              <input
                value={profile.pan}
                onChange={e => set("pan", e.target.value)}
                placeholder="AAAAA0000A"
                className="w-full h-10 rounded-lg border border-border px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary uppercase"
              />
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
