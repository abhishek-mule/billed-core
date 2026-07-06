"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, Mail, IndianRupee, Zap, Clock, Users, TrendingUp, ShieldCheck, Lock } from "lucide-react"

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
        <div role="alert" className="px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded text-destructive text-xs">{msg}</div>
        <button onClick={() => window.location.reload()} className="w-full py-2.5 border border-border text-muted-foreground rounded text-sm font-medium hover:bg-muted transition-colors">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {sent ? (
        <div className="space-y-3">
          <div className="py-6 bg-blue-50 rounded text-center border border-blue-100">
            <Mail className="w-7 h-7 text-blue-600 mx-auto mb-2" />
            <p className="text-xs text-blue-700 font-medium">Check your inbox — click the link to sign in.</p>
          </div>
          <button onClick={() => { setSent(false); setEmail("") }} className="w-full py-2.5 border border-border text-muted-foreground rounded text-sm font-medium hover:bg-muted transition-colors">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email-input" className="block text-xs text-muted-foreground mb-1.5 font-medium tracking-wide">Business Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full pl-9 pr-4 py-2.5 rounded border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:bg-card outline-none transition-all"
                aria-label="Email address"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm" aria-busy={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? "Sending link..." : "Send Magic Link"}
          </button>
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" />Passwordless</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Offline First</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Secure</span>
          </div>
        </form>
      )}
    </div>
  )
}

function LoginSkeleton() {
  return (
    <div className="w-full max-w-[340px] space-y-4 animate-pulse">
      <div className="flex justify-center">
        <div className="w-10 h-10 rounded bg-muted" />
      </div>
      <div className="h-5 w-48 mx-auto bg-muted rounded" />
      <div className="h-4 w-64 mx-auto bg-muted rounded" />
      <div className="bg-card shadow-xl p-8 space-y-4">
        <div className="space-y-3">
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
        </div>
      </div>
    </div>
  )
}

// ── Abstract India geometric pattern SVG ──

function IndiaPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="india-grid" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          <polygon points="60,0 120,30 120,90 60,120 0,90 0,30" fill="none" stroke="white" strokeWidth="0.5" />
          <polygon points="60,0 120,30 120,90 60,120 0,90 0,30" fill="none" stroke="white" strokeWidth="0.5" transform="translate(60,60)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#india-grid)" />
      {/* Stylized abstract India outline */}
      <g transform="translate(400,300) scale(1.1)" opacity="0.6" fill="none" stroke="white" strokeWidth="1">
        <path d="
          M-20,-80 L-30,-70 L-45,-65 L-55,-50
          L-60,-35 L-70,-25 L-85,-15 L-95,5
          L-100,20 L-95,35 L-85,45 L-70,55
          L-55,65 L-40,85 L-25,95 L-10,100
          L5,105 L20,100 L30,90 L40,75
          L50,60 L55,45 L50,30 L45,15
          L40,5 L45,-5 L55,-15 L60,-25
          L55,-35 L50,-45 L45,-55 L35,-65
          L20,-75 L5,-80 L-20,-80
        " />
      </g>
    </svg>
  )
}

// ── Animated Background Nodes ──

function AnimatedBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {/* Dotted network lines */}
      <line x1="120" y1="80" x2="250" y2="200" stroke="white" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.3" />
      <line x1="250" y1="200" x2="400" y2="150" stroke="white" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.3" />
      <line x1="400" y1="150" x2="550" y2="280" stroke="white" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.3" />
      <line x1="550" y1="280" x2="680" y2="220" stroke="white" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.3" />
      <line x1="120" y1="80" x2="300" y2="420" stroke="white" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.2" />
      <line x1="680" y1="220" x2="500" y2="450" stroke="white" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.2" />
      {/* Nodes */}
      <circle cx="120" cy="80" r="3" fill="white" opacity="0.4" filter="url(#glow)" />
      <circle cx="250" cy="200" r="2.5" fill="white" opacity="0.3" />
      <circle cx="400" cy="150" r="3" fill="white" opacity="0.35" filter="url(#glow)" />
      <circle cx="550" cy="280" r="2" fill="white" opacity="0.25" />
      <circle cx="680" cy="220" r="3" fill="white" opacity="0.4" filter="url(#glow)" />
      <circle cx="300" cy="420" r="2.5" fill="white" opacity="0.3" />
      <circle cx="500" cy="450" r="2" fill="white" opacity="0.25" />
      {/* Floating micro particles (very small) */}
      <circle cx="180" cy="140" r="1" fill="white" opacity="0.2" />
      <circle cx="450" cy="90" r="1" fill="white" opacity="0.15" />
      <circle cx="620" cy="350" r="1" fill="white" opacity="0.2" />
      <circle cx="340" cy="380" r="1" fill="white" opacity="0.15" />
      <circle cx="80" cy="280" r="1" fill="white" opacity="0.2" />
      <circle cx="720" cy="100" r="1" fill="white" opacity="0.15" />
      <circle cx="200" cy="480" r="1.2" fill="white" opacity="0.2" />
      <circle cx="600" cy="500" r="1" fill="white" opacity="0.15" />
    </svg>
  )
}

// ── Live Recovery Journey Preview ──

const RECOVERY_STEPS = [
  { label: "Invoice Created", status: "done", detail: null },
  { label: "Reminder Sent", status: "done", detail: null },
  { label: "Customer Read", status: "done", detail: "2 min ago" },
  { label: "Waiting for Payment", status: "active", detail: "Estimated probability: 82%" },
  { label: "Payment Received", status: "future", detail: null },
]

function RecoveryJourneyPreview() {
  return (
    <div className="bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-[0.15em]">Live Recovery Journey</span>
      </div>

      {/* Steps */}
      <div className="space-y-0">
        {RECOVERY_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all ${
                  step.status === "done"
                    ? "bg-green-500/20 border-green-400/60 text-green-400"
                    : step.status === "active"
                      ? "bg-blue-500/20 border-blue-400 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]"
                      : "border-white/[0.15] text-white/20"
                }`}
              >
                {step.status === "done" ? "✓" : step.status === "active" ? "●" : "○"}
              </div>
              {i < RECOVERY_STEPS.length - 1 && (
                <div
                  className={`w-px min-h-[18px] flex-1 ${
                    i < 3 ? "bg-white/[0.08]" : "bg-white/[0.04]"
                  }`}
                  style={{ height: step.detail ? "28px" : "18px" }}
                />
              )}
            </div>
            <div className="pt-px">
              <div
                className={`text-xs leading-tight ${
                  step.status === "done"
                    ? "text-white/60"
                    : step.status === "active"
                      ? "text-white/90 font-medium"
                      : "text-white/25"
                }`}
              >
                {step.label}
              </div>
              {step.detail && (
                <div className="text-[10px] text-white/40 mt-0.5">{step.detail}</div>
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
  "Monitoring customer payments",
  "Optimizing reminder timing",
  "Learning payment behavior",
  "Preparing next follow-up",
  "Analyzing recovery patterns",
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
    <div className="bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] text-white/40 font-mono uppercase tracking-[0.15em]">Recovery Engine</span>
        </div>
        <span className="text-[10px] text-white/30 font-mono">● Live</span>
      </div>

      {/* Hero metric */}
      <div className="mb-4">
        <div className="text-[10px] text-white/40 mb-0.5">Recovering</div>
        <div className="text-xl font-bold text-white tracking-tight">₹17,460</div>
      </div>

      {/* Secondary metrics */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <span className="text-[10px] text-white/40">Active Customers</span>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3 text-white/40" />
            <span className="text-xs font-medium text-white/70">12</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <span className="text-[10px] text-white/40">Likely to Pay Today</span>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs font-medium text-green-400">82%</span>
          </div>
        </div>
      </div>

      {/* Next action */}
      <div className="pt-3 border-t border-white/[0.06] mb-3">
        <div className="text-[10px] text-white/40 mb-1">Next Action</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-white/70 font-medium">Reminder</span>
          </div>
          <span className="text-[10px] text-white/50">Today · 7:30 PM</span>
        </div>
      </div>

      {/* Rotating status */}
      <div className="pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5 transition-all duration-500">
          <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <span className="text-[10px] text-white/35 font-mono truncate transition-all duration-500" key={statusIndex}>
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
      {/* Deep-navy gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0f1f3d] to-[#162d50]" />

      {/* Geometric India pattern overlay */}
      <IndiaPattern />

      {/* Animated nodes network */}
      <AnimatedBackground />

      {/* Subtle tricolor accent stripe at the top */}
      <div className="absolute top-0 left-0 right-0 h-1 flex">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />

        <div className="relative h-full flex flex-col items-center justify-center px-10 text-white">
          {/* Logo + branding */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center p-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)] mb-2">
              <span className="text-lg font-bold text-white/90">B</span>
            </div>
            <div className="text-xs font-bold text-white/80 tracking-wide">BillZo</div>
            <div className="text-[9px] text-white/40 tracking-[0.2em] uppercase">Recovery OS</div>
          </div>

          {/* Headline — extra-bold */}
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 tracking-tight text-white drop-shadow-lg">
            Recovery OS for Indian Merchants
          </h2>

          {/* Tagline */}
          <p className="text-sm lg:text-base text-white/60 mb-8 leading-relaxed max-w-lg drop-shadow">
            From invoice to payment — BillZo manages the entire recovery journey.
          </p>

          {/* Recovery Journey + Engine side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
            <RecoveryJourneyPreview />
            <RecoveryEngineStatus />
          </div>
        </div>
      </div>

      {/* Built for Indian MSMEs badge */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center">
        <div className="inline-flex items-center gap-1.5 bg-white/[0.06] backdrop-blur-sm px-3 py-1.5 border border-white/[0.10]">
          <IndianRupee className="w-3 h-3 text-white/60" />
          <span className="text-[11px] text-white/50 font-medium tracking-wide">Built for Indian MSMEs</span>
        </div>
      </div>
    </div>
  )
}

function MobileLogoBar() {
  return (
    <div className="lg:hidden flex flex-col items-center gap-1 p-5 border-b border-border bg-gradient-to-r from-[#0a1628] to-[#162d50]">
      <div className="flex items-center gap-2">
        <Image src="/logo_new.png" alt="BillZo" width={28} height={28} className="object-contain" />
        <span className="font-bold text-white text-sm">BillZo</span>
      </div>
      <p className="text-[11px] text-white/60">Recovery OS for Indian Merchants</p>
    </div>
  )
}

export default function AuthPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      <LeftPanel />
      <MobileLogoBar />

      <div className="flex-1 flex items-center justify-center p-8 lg:p-12 bg-background">
        <Suspense fallback={<LoginSkeleton />}>
          <div className="w-full max-w-[360px]">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Image src="/logo_new.png" alt="BillZo" width={36} height={36} className="object-contain" />
              </div>
              <h1 className="text-lg font-bold text-card-foreground">Welcome back</h1>
              <p className="text-xs text-muted-foreground mt-1">Continue managing your business.</p>
            </div>

            {/* Card — no border-radius, deeper shadow, more padding */}
            <div className="bg-card shadow-xl p-8">
              <MagicLinkForm />
            </div>

            {/* Footer */}
            <p className="text-center text-[11px] text-muted-foreground mt-6">
              By signing in, you agree to the{' '}
              <a href="#" className="text-blue-600 hover:text-blue-700 underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-blue-600 hover:text-blue-700 underline">Privacy Policy</a>
            </p>
          </div>
        </Suspense>
      </div>
    </div>
  )
}
