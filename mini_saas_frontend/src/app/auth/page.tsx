"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, Mail, IndianRupee, Zap, Clock, Users, TrendingUp, Lock, ArrowRight } from "lucide-react"

// ── Fonts ──
// Fraunces: a warm, editorial display serif — carries the "ledger / paper" personality.
// Inter: quiet, legible body face for the actual work of reading and typing.
// JetBrains Mono: reserved strictly for data, timestamps, and small-caps labels.
function FontFaces() {
  return (
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,450;9..144,560;9..144,650&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      .font-display { font-family: 'Fraunces', ui-serif, Georgia, serif; font-feature-settings: 'ss01' 1; }
      .font-body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
      .font-ledger { font-family: 'JetBrains Mono', ui-monospace, monospace; }
    `}</style>
  )
}

function MagicLinkForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const searchParams = useSearchParams()

  useEffect(() => {
    async function finishSupabaseHashLogin() {
      const hash = window.location.hash
      if (!hash.includes("access_token=")) return
      setLoading(true)
      setError("")
      const params = new URLSearchParams(hash.slice(1))
      const accessToken = params.get("access_token")
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      if (!accessToken) {
        setError("This login link is invalid or expired. Please request a new one.")
        setLoading(false)
        return
      }
      try {
        const res = await fetch("/api/auth/supabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ accessToken }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "This login link is invalid or expired. Please request a new one.")
          setLoading(false)
          return
        }
        window.location.href = data.redirectTo || "/onboarding"
      } catch {
        setError("Could not finish login. Please try again.")
        setLoading(false)
      }
    }
    finishSupabaseHashLogin()
  }, [])

  const hasError = searchParams?.get("error")
  const errorMessage = hasError
    ? hasError === "missing_code" || hasError === "missing_token"
      ? "No login code found. Please click the link in your email again."
      : hasError === "config"
        ? "Email login is not configured."
        : hasError === "invalid_code" || hasError === "invalid"
          ? "This login link is invalid or expired. Please request a new one."
          : hasError === "no_user"
            ? "Could not find your account. Please request a new link."
            : hasError === "failed"
              ? "Something went wrong during login. Please try again."
              : "Something went wrong. Please try again."
    : ""

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email.includes("@")) {
      setError("Please enter a valid email address")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to send link")
        setLoading(false)
        return
      }
      setSent(true)
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  if (errorMessage || error) {
    const msg = errorMessage || error
    return (
      <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
        <div role="alert" className="flex items-start gap-2.5 px-4 py-3 bg-destructive/[0.07] border border-destructive/25 rounded-sm text-destructive text-xs font-body leading-relaxed">
          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
          {msg}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-2.5 border border-border text-muted-foreground rounded-sm text-sm font-body font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
      {sent ? (
        <div className="space-y-3">
          <div className="relative py-7 px-5 bg-info/[0.06] rounded-sm text-center border border-info/15 overflow-hidden">
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-info/[0.06]" />
            <div className="relative">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-info/10 border border-info/20 flex items-center justify-center">
                <Mail className="w-4 h-4 text-info" />
              </div>
              <p className="text-xs text-info font-body font-medium leading-relaxed">
                Check your inbox — click the link to sign in.
              </p>
              <p className="text-[11px] text-info/60 font-body mt-1">Sent to {email}</p>
            </div>
          </div>
          <button
            onClick={() => { setSent(false); setEmail("") }}
            className="w-full py-2.5 border border-border text-muted-foreground rounded-sm text-sm font-body font-medium hover:bg-muted hover:text-foreground transition-colors"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="email-input" className="block text-[10px] font-ledger uppercase text-muted-foreground mb-1.5 tracking-[0.12em]">
              Business Email
            </label>
            <div className="relative group">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-info transition-colors" aria-hidden="true" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-sm border border-border bg-muted text-sm font-body text-foreground placeholder:text-muted-foreground focus:border-info focus:ring-2 focus:ring-info/15 focus:bg-card outline-none transition-all"
                aria-label="Email address"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="group w-full py-3 bg-info hover:bg-info text-white rounded-sm text-sm font-body font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_14px_rgba(37,99,235,0.28)]"
            aria-busy={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {loading ? "Sending link..." : "Send Magic Link"}
            {!loading && <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />}
          </button>
          <div className="flex items-center justify-center gap-4 text-[10px] font-body text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" />Passwordless</span>

          </div>
        </form>
      )}
    </div>
  )
}

function LoginSkeleton() {
  return (
    <div className="w-full max-w-[360px] space-y-4 animate-pulse">
      <div className="flex justify-center">
        <div className="w-11 h-11 rounded-full bg-muted" />
      </div>
      <div className="h-5 w-48 mx-auto bg-muted rounded" />
      <div className="h-4 w-64 mx-auto bg-muted rounded" />
      <div className="bg-card shadow-xl p-8 space-y-4">
        <div className="space-y-3">
          <div className="h-11 bg-muted rounded" />
          <div className="h-11 bg-muted rounded" />
        </div>
      </div>
    </div>
  )
}

// ── Perforation: a torn ticket-stub edge, the page's one signature motif ──
// Grounded directly in the subject — this is an invoice-recovery product,
// so the login card reads like a tear-off receipt stub.

function Perforation({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dot = tone === "dark" ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.14)"
  const holes = Array.from({ length: 26 })
  return (
    <div className="relative flex items-center" aria-hidden="true">
      <div className="flex-1 flex items-center gap-[7px] overflow-hidden">
        {holes.map((_, i) => (
          <span key={i} className="w-[3px] h-[3px] rounded-full shrink-0" style={{ background: dot }} />
        ))}
      </div>
    </div>
  )
}

// ── Radial progress ring for the "likely to pay" stat ──

function RadialProgress({ value, size = 34 }: { value: number; size?: number }) {
  const stroke = 3
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#4ade80"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-ledger text-success">
        {value}%
      </span>
    </div>
  )
}



// ── Live Recovery Journey Preview ──

const RECOVERY_STEPS = [
  { label: "Invoice Created", status: "done", detail: null },
  { label: "Reminder Sent", status: "done", detail: null },
  { label: "Customer Read", status: "done", detail: "2 min ago" },
  { label: "Waiting for Payment", status: "active", detail: "82% chance of payment today" },
  { label: "Payment Received", status: "future", detail: null },
]

function RecoveryJourneyPreview() {
  return (
    <div className="bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-success" />
          <span className="text-[9px] font-ledger text-white/40 uppercase tracking-[0.15em]">Live Recovery</span>
        </div>
        <span className="text-[8px] font-ledger text-white/25">#INV-4471</span>
      </div>
      <Perforation tone="dark" />
      <div className="space-y-0 mt-2">
        {RECOVERY_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all ${
                  step.status === "done"
                    ? "bg-success/20 border-success/60 text-success"
                    : step.status === "active"
                      ? "bg-info/20 border-info text-info shadow-[0_0_10px_rgba(96,165,250,0.5)]"
                      : "border-white/[0.15] text-white/20"
                }`}
              >
                {step.status === "done" ? "✓" : step.status === "active" ? "●" : "○"}
              </div>
              {i < RECOVERY_STEPS.length - 1 && (
                <div
                  className={`w-px min-h-[18px] flex-1 ${i < 3 ? "bg-white/[0.08]" : "bg-white/[0.04]"}`}
                  style={{ height: step.detail ? "28px" : "18px" }}
                />
              )}
            </div>
            <div className="pt-px">
              <div className={`text-xs font-body leading-tight ${
                step.status === "done" ? "text-white/60" : step.status === "active" ? "text-white/90 font-medium" : "text-white/25"
              }`}>
                {step.label}
              </div>
              {step.detail && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {step.status === "active" && <RadialProgress value={82} size={16} />}
                  <span className="text-[10px] font-body text-white/40">{step.status === "active" ? "chance of payment today" : step.detail}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Recovery Engine Status ──

const STATUS_MESSAGES = [
  "Analyzing payment behavior...",
  "Optimizing reminder timing...",
  "Preparing next follow-up...",
  "Monitoring active recoveries...",
  "Learning from payment patterns...",
]

function RecoveryEngineStatus() {
  const [statusIndex, setStatusIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-info" />
          <span className="text-[9px] font-ledger text-white/40 uppercase tracking-[0.15em]">Engine</span>
        </div>
        <span className="text-[9px] font-ledger text-white/30">● Monitoring</span>
      </div>

      <div className="mb-2">
        <div className="text-[9px] font-body text-white/40 mb-0.5">Recovering</div>
        <div className="text-xl font-display font-semibold text-white tracking-tight">₹17,460</div>
      </div>

      <div className="space-y-1 mb-2">
        <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
          <span className="text-[9px] font-body text-white/40">Active Customers</span>
          <div className="flex items-center gap-1">
            <Users className="w-2.5 h-2.5 text-white/40" />
            <span className="text-[10px] font-ledger text-white/70">12</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
          <span className="text-[9px] font-body text-white/40">Likely to Pay Today</span>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-2.5 h-2.5 text-success" />
            <span className="text-[10px] font-ledger text-success">82%</span>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-white/[0.06] mb-2">
        <div className="text-[9px] font-body text-white/40 mb-0.5">Next Action</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 text-info" />
            <span className="text-[10px] font-body text-white/70 font-medium">WhatsApp</span>
          </div>
          <span className="text-[9px] font-ledger text-white/50">7:30 PM</span>
        </div>
      </div>

      <div className="pt-1.5 border-t border-white/[0.06]">
        <div className="flex items-center gap-1 transition-all duration-500">
          <span className="w-0.5 h-0.5 rounded-full bg-info animate-pulse shrink-0" />
          <span className="text-[9px] font-ledger text-white/35 truncate transition-all duration-500" key={statusIndex}>
            {STATUS_MESSAGES[statusIndex]}
          </span>
        </div>
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden flex-col">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1628] to-[#162d50]" />

      <div className="absolute top-0 left-0 right-0 h-1 flex">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      <div className="absolute inset-0 bg-black/10">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] via-transparent to-transparent pointer-events-none" />

        <div className="relative h-full flex flex-col items-center text-white">
          {/* Top section: logo, heading, description */}
          <div className="flex flex-col items-center shrink-0 px-8 pt-6 pb-2">
            <div className="flex flex-col items-center mb-3 animate-in fade-in slide-in-from-top-3 duration-700">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg mb-1.5">
                <Image src="/logo.svg" alt="BillZo" width={50} height={50} className="object-contain" />
              </div>
              <div className="font-display font-semibold text-xs text-white/85 tracking-wide">BillZo</div>
              <div className="text-[8px] font-ledger text-white/40 tracking-[0.25em] uppercase mt-0.5">Recovery OS</div>
            </div>

            <h2 className="font-display font-semibold text-2xl lg:text-[2rem] leading-[1.08] tracking-tight text-white drop-shadow-lg text-center max-w-lg">
              Every unpaid invoice
              <br />
              <span className="text-white/60">has a next move.</span>
            </h2>

            <p className="text-[11px] lg:text-xs font-body text-white/55 mt-2 leading-relaxed max-w-md text-center">
              From invoice to payment — BillZo manages the entire recovery journey, automatically.
            </p>

            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex -space-x-1.5">
                {["A", "K", "R", "M"].map((letter) => (
                  <div key={letter} className="w-4 h-4 rounded-full bg-white/[0.12] border border-white/[0.06] flex items-center justify-center text-[7px] font-ledger text-white/50">
                    {letter}
                  </div>
                ))}
              </div>
              <span className="text-[9px] font-body text-white/40">Trusted by growing Indian businesses</span>
            </div>
          </div>

          {/* Cards section: takes remaining space */}
          <div className="flex-1 min-h-0 w-full max-w-2xl px-8 pb-20 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150">
              <RecoveryJourneyPreview />
              <RecoveryEngineStatus />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 left-0 right-0 flex justify-center">
        <div className="inline-flex items-center gap-1.5 bg-white/[0.06] backdrop-blur-sm px-3 py-1.5 border border-white/[0.10]">
          <IndianRupee className="w-3 h-3 text-white/60" />
          <span className="text-[11px] font-body text-white/50 font-medium tracking-wide">Proudly Built for Indian MSMEs</span>
        </div>
      </div>
    </div>
  )
}

function MobileLogoBar() {
  return (
    <div className="lg:hidden flex flex-col items-center gap-1 p-5 border-b border-border bg-gradient-to-r from-[#0a1628] to-[#162d50] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] flex">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="w-8 h-8 bg-white/95 rounded-lg flex items-center justify-center p-1.5 shadow">
          <Image src="/logo.svg" alt="BillZo" width={22} height={22} className="object-contain" />
        </div>
        <span className="font-display font-semibold text-white text-sm">BillZo</span>
      </div>
      <p className="text-[11px] font-body text-white/60">Recovery OS for Indian Merchants</p>
    </div>
  )
}

export default function AuthPage() {
  return (
    <>
      <FontFaces />
      <div className="min-h-screen flex flex-col lg:flex-row bg-background">
        <LeftPanel />
        <MobileLogoBar />

        <div className="flex-1 flex flex-col bg-white relative overflow-hidden">

          <div className="flex-1 flex items-center justify-center p-8 lg:p-12">
            <Suspense fallback={<LoginSkeleton />}>
              <div className="w-full max-w-[360px] animate-in fade-in slide-in-from-bottom-3 duration-600">
                <div className="text-center mb-5 animate-in fade-in slide-in-from-top-2 duration-500 delay-100">
                  <div className="flex justify-center mb-3">
                    <div className="w-12 h-12 rounded-full bg-card border border-border shadow-sm flex items-center justify-center">
                      <Image src="/logo.svg" alt="BillZo" width={40} height={40} className="object-contain" />
                    </div>
                  </div>
                  <h1 className="font-display font-semibold text-lg text-card-foreground">Welcome back</h1>
                  <p className="text-[11px] font-body text-muted-foreground mt-1">Continue managing your business.</p>
                </div>

                {/* Login card */}
                <div className="bg-card shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-600 delay-200">
                  <div className="p-6">
                    <MagicLinkForm />
                  </div>
                </div>

                <p className="text-center text-[10px] font-body text-muted-foreground mt-3 leading-relaxed">
                  By signing in, you agree to the{" "}
                  <a href="#" className="text-info hover:text-info underline underline-offset-2">Terms of Service</a>
                  {" "}and{" "}
                  <a href="#" className="text-info hover:text-info underline underline-offset-2">Privacy Policy</a>
                </p>
              </div>
            </Suspense>
          </div>

          {/* India map watermark — in flow at bottom, never overlaps */}
          <div className="shrink-0 self-start w-36 sm:w-40 lg:w-48 opacity-60 pointer-events-none animate-in fade-in duration-500 delay-300">
            <img
              src="/indi_dog.svg"
              alt="India"
              className="w-full h-auto rounded-r-md border border-border/10 border-l-0"
            />
          </div>
        </div>
      </div>
    </>
  )
}