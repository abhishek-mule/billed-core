"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2, Store, CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
}

const CATEGORIES = [
  "Electronics & Appliances",
  "Grocery & General Store",
  "Clothing & Textiles",
  "Hardware & Paints",
  "Stationery & Printing",
  "Automobile Parts",
  "Medical & Pharmacy",
  "Restaurant & Food",
  "Jewellery & Watches",
  "Other",
]

export default function OnboardingPage() {
  const router = useRouter()

  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [gstin, setGstin] = useState("")
  const [category, setCategory] = useState("")

  const [loading, setLoading] = useState<"idle" | "creating" | "done">("idle")
  const [errors, setErrors] = useState<{
    businessName?: string
    phone?: string
    gstin?: string
    phoneDuplicate?: string
  }>({})

  // ── If user already has a merchant, redirect to dashboard ──
  useEffect(() => {
    const tenantId = getCookie("bz_tenant")
    if (tenantId) {
      router.push("/dashboard")
    }
  }, [router])

  // ── Validate phone on blur ──
  const handlePhoneBlur = async () => {
    const clean = phone.replace(/\D/g, "").slice(-10)
    if (clean.length !== 10) return

    try {
      const res = await fetch("/api/merchants/validate-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clean }),
      })
      const data = await res.json()

      if (data.exists) {
        setErrors((prev) => ({
          ...prev,
          phoneDuplicate: data.message || "This WhatsApp number is already linked to another BillZo account.",
        }))
      } else {
        setErrors((prev) => ({ ...prev, phoneDuplicate: undefined }))
      }
    } catch {
      // Non-critical: proceed anyway
    }
  }

  const handleSubmit = async () => {
    const newErrors: typeof errors = {}

    if (!businessName.trim()) {
      newErrors.businessName = "Business name is required"
    } else if (businessName.trim().length < 2) {
      newErrors.businessName = "Business name must be at least 2 characters"
    }

    const cleanPhone = phone.replace(/\D/g, "").slice(-10)
    if (!cleanPhone) {
      newErrors.phone = "WhatsApp number is required"
    } else if (cleanPhone.length !== 10) {
      newErrors.phone = "Please enter a valid 10-digit number"
    }

    if (gstin && gstin.length !== 15) {
      newErrors.gstin = "GSTIN must be 15 characters"
    }

    if (newErrors.businessName || newErrors.phone || newErrors.gstin) {
      setErrors(newErrors)
      return
    }

    if (errors.phoneDuplicate) {
      return
    }

    setLoading("creating")
    setErrors({})

    try {
      const res = await fetch("/api/merchants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          phone: cleanPhone,
          gstin: gstin?.trim() || undefined,
          category: category || undefined,
        }),
      })

      const data = await res.json()

      if (res.status === 409) {
        setErrors({ phoneDuplicate: data.hint || data.error })
        setLoading("idle")
        return
      }

      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`)
      }

      // ── Success: cache and redirect ──
      setCookie("bz_tenant", data.merchantId)
      setCookie("bz_tenant_name", data.merchantName)
      localStorage.setItem("tenantId", data.merchantId)
      localStorage.setItem("tenantName", data.merchantName)

      setLoading("done")
      setTimeout(() => router.push("/dashboard"), 1700)
    } catch (error: any) {
      console.error("Failed to create merchant:", error)
      setErrors({ businessName: error.message || "Failed to create merchant. Please try again." })
      setLoading("idle")
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-lg mx-auto flex items-center gap-2 p-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold text-foreground">BillZo</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-in zoom-in-95 duration-300">
          {loading === "done" ? (
            <div className="rounded-2xl border border-border bg-card shadow-lg p-10 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success animate-in zoom-in-95">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-bold text-card-foreground">You&apos;re all set!</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Setting up your dashboard...</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card shadow-lg p-7">
              <div className="flex items-center gap-3 mb-5">
                <Image src="/logo_new.png" alt="BillZo" width={32} height={32} className="object-contain" />
                <div>
                  <h1 className="text-xl font-bold text-card-foreground">Set up your business</h1>
                  <p className="text-xs text-muted-foreground">Create your BillZo merchant account</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Business Name */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Business Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    autoFocus
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value)
                      setErrors((prev) => ({ ...prev, businessName: undefined }))
                    }}
                    placeholder="Ravi Electronics"
                    className={`mt-2 w-full rounded-xl border-2 bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${
                      errors.businessName ? "border-destructive focus:border-destructive" : "border-input focus:border-primary"
                    }`}
                  />
                  {errors.businessName && <p className="mt-1 text-sm text-destructive">{errors.businessName}</p>}
                </div>

                {/* WhatsApp Number */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Business WhatsApp Number <span className="text-destructive">*</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground mb-1">
                    This number identifies your business. It cannot be linked to another BillZo account.
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium border-r border-border pr-2">+91</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                        setErrors((prev) => ({ ...prev, phone: undefined, phoneDuplicate: undefined }))
                      }}
                      onBlur={handlePhoneBlur}
                      placeholder="9876543210"
                      maxLength={10}
                      className={`mt-2 w-full rounded-xl border-2 bg-background pl-[4.5rem] pr-4 py-3 text-base font-medium focus:outline-none transition-colors ${
                        errors.phone || errors.phoneDuplicate
                          ? "border-destructive focus:border-destructive"
                          : "border-input focus:border-primary"
                      }`}
                    />
                  </div>
                  {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone}</p>}
                  {errors.phoneDuplicate && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive">{errors.phoneDuplicate}</p>
                    </div>
                  )}
                </div>

                {/* GSTIN (optional) */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    GSTIN <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    value={gstin}
                    onChange={(e) => {
                      setGstin(e.target.value.toUpperCase())
                      setErrors((prev) => ({ ...prev, gstin: undefined }))
                    }}
                    placeholder="27ABCDE1234F1Z5"
                    maxLength={15}
                    className={`mt-2 w-full rounded-xl border-2 bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${
                      errors.gstin ? "border-destructive focus:border-destructive" : "border-input focus:border-primary"
                    }`}
                  />
                  {errors.gstin && <p className="mt-1 text-sm text-destructive">{errors.gstin}</p>}
                </div>

                {/* Category (optional) */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Business Category <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-2 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base font-medium focus:border-primary focus:outline-none transition-colors"
                  >
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!businessName.trim() || !phone.trim() || loading === "creating"}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  {loading === "creating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {loading === "creating" ? "Creating..." : "Start Billing"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-muted-foreground p-4">
        By creating a business, you agree to the{' '}
        <a href="#" className="text-primary hover:text-primary/80 underline">Terms of Service</a>
        {' '}and{' '}
        <a href="#" className="text-primary hover:text-primary/80 underline">Privacy Policy</a>
      </p>
    </div>
  )
}
