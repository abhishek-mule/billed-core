"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, Mail, ArrowRight, BellRing, Zap, BarChart3, IndianRupee } from "lucide-react"

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
            <label htmlFor="email-input" className="block text-xs text-muted-foreground mb-1.5 font-medium tracking-wide">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-4 py-2.5 rounded border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:bg-card outline-none transition-all"
                aria-label="Email address"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm" aria-busy={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? "Sending link..." : "Continue with Email"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            We&apos;ll send you a magic link — no password needed.
          </p>
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

// ── Feature cards with micro-statistics ──

const FEATURES = [
  {
    icon: BellRing,
    title: "Smart Reminders",
    description: "Automated WhatsApp follow-ups that adapt to customer behaviour.",
    stat: "30% Faster Recovery",
    statLabel: "avg. time to collect",
  },
  {
    icon: Zap,
    title: "Instant Payments",
    description: "UPI deep links embedded in every message — zero friction to pay.",
    stat: "₹2.3Cr+",
    statLabel: "collected via BillZo",
  },
  {
    icon: BarChart3,
    title: "Recovery Intelligence",
    description: "Know who will pay, when, and which action works best.",
    stat: "500+ Merchants",
    statLabel: "trust BillZo daily",
  },
]

function LeftPanel() {
  return (
    <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden flex-col">
      {/* Deep-navy gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0f1f3d] to-[#162d50]" />

      {/* Geometric India pattern overlay */}
      <IndiaPattern />

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
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-center p-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <Image src="/logo_new.png" alt="BillZo" width={48} height={48} className="object-contain" />
            </div>
          </div>

          {/* Headline — extra-bold */}
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-4 tracking-tight text-white drop-shadow-lg">
            Recovery OS for Indian Merchants
          </h2>

          {/* Body text — reduced opacity */}
          <p className="text-base lg:text-lg text-white/60 mb-10 leading-relaxed max-w-xl drop-shadow">
            Turn overdue invoices into collected cash. Automated reminders, payment links, and smart recovery workflows — all in one dashboard.
          </p>

          {/* Feature cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group bg-white/[0.06] backdrop-blur-sm border border-white/[0.10] p-4 hover:bg-white/[0.10] transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-white/[0.10] rounded">
                    <f.icon className="w-3.5 h-3.5 text-white/80" />
                  </div>
                  <span className="text-sm font-semibold text-white/90">{f.title}</span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed mb-3">{f.description}</p>
                <div>
                  <div className="text-base font-bold text-white">{f.stat}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">{f.statLabel}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Made in India badge */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center">
        <div className="inline-flex items-center gap-1.5 bg-white/[0.06] backdrop-blur-sm px-3 py-1.5 border border-white/[0.10]">
          <IndianRupee className="w-3 h-3 text-white/60" />
          <span className="text-[11px] text-white/50 font-medium tracking-wide">Made in India · Built for MSMEs</span>
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
                <Image src="/logo_new.png" alt="BillZo" width={40} height={40} className="object-contain" />
              </div>
              <h1 className="text-lg font-bold text-card-foreground">Welcome to BillZo</h1>
              <p className="text-xs text-muted-foreground mt-1">Sign in with your email — no password needed</p>
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
