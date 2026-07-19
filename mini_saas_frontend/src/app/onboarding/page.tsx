"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Loader2,
  Store,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Upload,
  MessageCircle,
  PartyPopper,
  SkipForward,
  FileSpreadsheet,
} from "lucide-react"
import { useContactImport } from "@/lib/billzo/useContactImport"
import { trackEvent, events } from "@/lib/billzo/analytics"

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

type Step = "business" | "whatsapp" | "import" | "active"

const STEPS: { key: Step; label: string }[] = [
  { key: "business", label: "Business" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "import", label: "Customers" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("business")

  // Business
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [gstin, setGstin] = useState("")
  const [category, setCategory] = useState("")
  const [businessErrors, setBusinessErrors] = useState<{ businessName?: string; phone?: string; gstin?: string; phoneDuplicate?: string }>({})
  const [creating, setCreating] = useState(false)
  const [merchantId, setMerchantId] = useState<string | null>(null)

  // WhatsApp
  const [waStatus, setWaStatus] = useState<"idle" | "connecting" | "no-key" | "ready">("idle")
  const [waLoading, setWaLoading] = useState(false)

  // Import
  const [importMode, setImportMode] = useState<"skip" | "csv">("skip")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<{ created: number; skipped?: number; errors?: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const { parseCSV, state: importState } = useContactImport()

  // ── Redirect existing tenant ──
  useEffect(() => {
    const tid = getCookie("bz_tenant")
    if (tid) router.push("/dashboard")
  }, [router])

  // ── Step 1: phone validation ──
  const handlePhoneBlur = useCallback(async () => {
    const clean = phone.replace(/\D/g, "").slice(-10)
    if (clean.length !== 10) return
    try {
      const res = await fetch("/api/merchants/validate-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clean }),
      })
      const data = await res.json()
      setBusinessErrors((p) => ({
        ...p,
        phoneDuplicate: data.exists ? data.message || "This WhatsApp number is already linked to another BillZo account." : undefined,
      }))
    } catch {
      /* non-critical */
    }
  }, [phone])

  const submitBusiness = useCallback(async () => {
    const e: typeof businessErrors = {}
    if (!businessName.trim()) e.businessName = "Business name is required"
    else if (businessName.trim().length < 2) e.businessName = "Business name must be at least 2 characters"
    const clean = phone.replace(/\D/g, "").slice(-10)
    if (!clean) e.phone = "WhatsApp number is required"
    else if (clean.length !== 10) e.phone = "Please enter a valid 10-digit number"
    if (gstin && gstin.length !== 15) e.gstin = "GSTIN must be 15 characters"
    if (e.businessName || e.phone || e.gstin) { setBusinessErrors(e); return }
    if (businessErrors.phoneDuplicate) return

    setCreating(true)
    setBusinessErrors({})
    try {
      const res = await fetch("/api/merchants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: businessName.trim(), phone: clean, gstin: gstin.trim() || undefined, category: category || undefined }),
      })
      const data = await res.json()
      if (res.status === 409) { setBusinessErrors({ phoneDuplicate: data.hint || data.error }); setCreating(false); return }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)

      setMerchantId(data.merchantId)
      setCookie("bz_tenant", data.merchantId)
      setCookie("bz_tenant_name", data.merchantName)
      localStorage.setItem("tenantId", data.merchantId)
      localStorage.setItem("tenantName", data.merchantName)
      trackEvent(data.merchantId, events.login_email, { step: "registered" })
      setStep("whatsapp")
    } catch (err: any) {
      setBusinessErrors({ businessName: err.message || "Failed to create merchant. Please try again." })
    } finally {
      setCreating(false)
    }
  }, [businessName, phone, gstin, category, businessErrors.phoneDuplicate])

  // ── Step 2: WhatsApp (required but resilient) ──
  const checkWhatsApp = useCallback(async () => {
    setWaLoading(true)
    try {
      const res = await fetch("/api/whatsapp/status")
      const data = await res.json()
      const ok = data?.connected || data?.status === "connected" || data?.configured
      setWaStatus(ok ? "ready" : "no-key")
    } catch {
      setWaStatus("no-key")
    } finally {
      setWaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (step === "whatsapp" && waStatus === "idle") checkWhatsApp()
  }, [step, waStatus, checkWhatsApp])

  const finishOnboarding = useCallback(async () => {
    const tid = getCookie("bz_tenant") || merchantId
    if (tid) {
      trackEvent(tid, events.onboarding_completed, { step: "activated" })
      await fetch("/api/merchants/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" } }).catch(() => {})
    }
    setStep("active")
    setTimeout(() => router.push("/recovery/readiness"), 1800)
  }, [merchantId, router])

  // ── Step 3: import ──
  const handleCsvChange = useCallback(async (file: File) => {
    setCsvFile(file)
    setImportError(null)
    setImportResult(null)
    await parseCSV(file)
  }, [parseCSV])

  const submitImport = useCallback(async () => {
    const tid = getCookie("bz_tenant") || merchantId
    if (!tid) { setImportError("Session lost. Please refresh."); return }

    if (importMode === "skip") {
      trackEvent(tid, events.onboarding_completed, { step: "skipped_import" })
      await finishOnboarding()
      return
    }

    // CSV import — send only non-duplicate contacts
    const toSend = importState.contacts.filter((c) => !c.isDuplicate)
    if (toSend.length === 0) { setImportError("No new customers found in the file."); return }
    setImporting(true)
    setImportError(null)
    try {
      const rows = toSend.map((c) => ({
        name: c.name,
        phone: c.phone,
        whatsapp_number: c.whatsapp_number || c.phone,
        email: c.email,
      }))
      const res = await fetch("/api/customers/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode: "skip" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Import failed")
      setImportResult({ created: data.created || 0, skipped: data.skipped?.length, errors: data.errors?.length })
      trackEvent(tid, events.onboarding_completed, { step: "imported", customerCount: data.created || 0 })
      await finishOnboarding()
    } catch (err: any) {
      setImportError(err.message || "Import failed. You can add customers later.")
    } finally {
      setImporting(false)
    }
  }, [importMode, importState.contacts, merchantId, finishOnboarding])

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="max-w-lg mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-foreground">BillZo</span>
          </div>
          {step !== "active" && (
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-border"}`} />
                  {i < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-in zoom-in-95 duration-300">
          {step === "active" ? (
            <div className="rounded-2xl border border-border bg-card shadow-lg p-10 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success animate-in zoom-in-95">
                <PartyPopper className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-bold text-card-foreground">Recovery is Active ✅</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Opening your Recovery Center...</p>
            </div>
          ) : step === "business" ? (
            <div className="rounded-2xl border border-border bg-card shadow-lg p-7">
              <div className="flex items-center gap-3 mb-5">
                <Image src="/logo.svg" alt="BillZo" width={32} height={32} className="object-contain" />
                <div>
                  <h1 className="text-xl font-bold text-card-foreground">Set up your business</h1>
                  <p className="text-xs text-muted-foreground">Start recovering payments in minutes</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Name <span className="text-destructive">*</span></label>
                  <input autoFocus value={businessName} onChange={(e) => { setBusinessName(e.target.value); setBusinessErrors((p) => ({ ...p, businessName: undefined })) }}
                    placeholder="Ravi Electronics" className={`mt-2 w-full rounded-xl border-2 bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${businessErrors.businessName ? "border-destructive" : "border-input focus:border-primary"}`} />
                  {businessErrors.businessName && <p className="mt-1 text-sm text-destructive">{businessErrors.businessName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business WhatsApp Number <span className="text-destructive">*</span></label>
                  <p className="text-[11px] text-muted-foreground mb-1">BillZo reminds your customers on this number. It cannot be linked to another account.</p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium border-r border-border pr-2">+91</span>
                    <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setBusinessErrors((p) => ({ ...p, phone: undefined, phoneDuplicate: undefined })) }}
                      onBlur={handlePhoneBlur} placeholder="9876543210" maxLength={10}
                      className={`mt-2 w-full rounded-xl border-2 bg-background pl-[4.5rem] pr-4 py-3 text-base font-medium focus:outline-none transition-colors ${businessErrors.phone || businessErrors.phoneDuplicate ? "border-destructive" : "border-input focus:border-primary"}`} />
                  </div>
                  {businessErrors.phone && <p className="mt-1 text-sm text-destructive">{businessErrors.phone}</p>}
                  {businessErrors.phoneDuplicate && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive">{businessErrors.phoneDuplicate}</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">GSTIN <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input value={gstin} onChange={(e) => { setGstin(e.target.value.toUpperCase()); setBusinessErrors((p) => ({ ...p, gstin: undefined })) }} placeholder="27ABCDE1234F1Z5" maxLength={15}
                    className={`mt-2 w-full rounded-xl border-2 bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${businessErrors.gstin ? "border-destructive" : "border-input focus:border-primary"}`} />
                  {businessErrors.gstin && <p className="mt-1 text-sm text-destructive">{businessErrors.gstin}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Category <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-2 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base font-medium focus:border-primary focus:outline-none transition-colors">
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={submitBusiness} disabled={!businessName.trim() || !phone.trim() || creating}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {creating ? "Creating..." : "Continue"}
                </button>
              </div>
            </div>
          ) : step === "whatsapp" ? (
            <div className="rounded-2xl border border-border bg-card shadow-lg p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-card-foreground">Connect WhatsApp</h1>
                  <p className="text-xs text-muted-foreground">BillZo sends reminders here</p>
                </div>
              </div>
              {waStatus === "no-key" ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">WhatsApp isn&apos;t configured yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">You can still finish setup and configure WhatsApp later from Settings. Reminders will stay pending until it&apos;s connected.</p>
                </div>
              ) : waStatus === "ready" ? (
                <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-4 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">WhatsApp is connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking connection...
                </div>
              )}
              <div className="mt-5 flex gap-3">
                <button onClick={() => setStep("business")} className="px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button onClick={finishOnboarding} disabled={waLoading}
                  className="flex-1 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  {waStatus === "no-key" ? "Finish setup" : "Continue"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card shadow-lg p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-card-foreground">Add your customers</h1>
                  <p className="text-xs text-muted-foreground">So BillZo can spot who owes you money</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setImportMode("skip")} className={`rounded-xl border-2 p-4 text-left transition-colors ${importMode === "skip" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <SkipForward className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold">Skip for now</p>
                  <p className="text-[11px] text-muted-foreground">Add customers later</p>
                </button>
                <label className={`rounded-xl border-2 p-4 text-left transition-colors cursor-pointer ${importMode === "csv" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold">Import CSV</p>
                  <p className="text-[11px] text-muted-foreground">From Excel / phonebook</p>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setImportMode("csv"); handleCsvChange(e.target.files[0]) } }} />
                </label>
              </div>
              {importMode === "csv" && (
                <div className="mt-3">
                  {csvFile ? (
                    <div className="rounded-xl border border-border p-3 text-sm">
                      <p className="font-medium">{csvFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {importState.loading ? "Reading..." : `${importState.validCount} valid · ${importState.duplicateCount} duplicate · ${importState.invalidCount} invalid`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Upload a CSV with columns: name, phone</p>
                  )}
                </div>
              )}
              {importResult && (
                <div className="mt-3 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">
                  Imported {importResult.created} customer{importResult.created === 1 ? "" : "s"}
                  {importResult.skipped ? ` · ${importResult.skipped} skipped` : ""}
                </div>
              )}
              {importError && <p className="mt-3 text-sm text-destructive">{importError}</p>}
              <div className="mt-5 flex gap-3">
                <button onClick={() => setStep("whatsapp")} className="px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button onClick={submitImport} disabled={importing || (importMode === "csv" && importState.loading)}
                  className="flex-1 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {importMode === "skip" ? "Finish setup" : importing ? "Importing..." : "Import & Finish"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground p-4">
        By creating a business, you agree to the{' '}
        <a href="#" className="text-primary hover:text-primary/80 underline">Terms of Service</a>
        {' '}and{' '}
        <a href="#" className="text-primary hover:text-primary/80 underline">Privacy Policy</a>
      </p>
    </div>
  )
}
