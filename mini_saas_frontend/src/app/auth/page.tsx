"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, Mail, ArrowRight, Shield, Zap, Users } from "lucide-react"

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
        <div role="alert" className="px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs">{msg}</div>
        <button onClick={() => window.location.reload()} className="w-full py-2.5 border border-border text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      {sent ? (
        <div className="space-y-3">
          <div className="py-6 bg-primary/5 rounded-xl text-center border border-primary/10">
            <Mail className="w-7 h-7 text-primary mx-auto mb-2" />
            <p className="text-xs text-primary font-medium">Check your inbox — click the link to sign in.</p>
          </div>
          <button onClick={() => { setSent(false); setEmail("") }} className="w-full py-2.5 border border-border text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
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
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-card outline-none transition-all"
                aria-label="Email address"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm" aria-busy={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? "Sending link..." : "Continue with Email"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
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
        <div className="w-10 h-10 rounded-lg bg-muted" />
      </div>
      <div className="h-5 w-48 mx-auto bg-muted rounded" />
      <div className="h-4 w-64 mx-auto bg-muted rounded" />
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="space-y-3">
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden flex-col">
      <div className="absolute inset-0">
        <Image
          src="/left.jpeg"
          alt="BillZo Dashboard"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
      </div>

      {/* Full-coverage Glassmorphism Layer over entire left panel */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xl">
        {/* Subtle shine overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
        
        {/* Content centered within the glass layer */}
        <div className="relative h-full flex flex-col items-center justify-center px-8 text-white">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-md rounded-2xl border border-white/30 flex items-center justify-center p-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <Image src="/logo_new.png" alt="BillZo" width={48} height={48} className="object-contain" />
            </div>
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight text-white drop-shadow-lg">
            Recovery OS for Indian Merchants
          </h2>
          <p className="text-base lg:text-lg text-white/80 mb-8 leading-relaxed max-w-xl drop-shadow">
            Turn overdue invoices into collected cash. Automated reminders, payment links, and smart recovery workflows — all in one dashboard.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/20 text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
              <Shield className="w-4 h-4" />
              <span>Automated follow-ups</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/20 text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
              <Zap className="w-4 h-4" />
              <span>Instant payment links</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/20 text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
              <Users className="w-4 h-4" />
              <span>Customer promises tracker</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MobileLogoBar() {
  return (
    <div className="lg:hidden flex flex-col items-center gap-1 p-5 border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-2">
        <Image src="/logo_new.png" alt="BillZo" width={28} height={28} className="object-contain" />
        <span className="font-bold text-foreground text-sm">BillZo</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Recovery OS for Indian Merchants</p>
    </div>
  )
}

export default function AuthPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      <LeftPanel />
      <MobileLogoBar />

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Suspense fallback={<LoginSkeleton />}>
          <div className="w-full max-w-[340px]">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <Image src="/logo_new.png" alt="BillZo" width={40} height={40} className="object-contain" />
              </div>
              <h1 className="text-lg font-bold text-card-foreground">Welcome to BillZo</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Sign in with your email — no password needed</p>
            </div>

            {/* Card */}
            <div className="bg-card rounded-2xl border border-border p-5 shadow-lg">
              <MagicLinkForm />
            </div>

            {/* Footer */}
            <p className="text-center text-[11px] text-muted-foreground mt-5">
              By signing in, you agree to the{' '}
              <a href="#" className="text-primary hover:text-primary/80 underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-primary hover:text-primary/80 underline">Privacy Policy</a>
            </p>
          </div>
        </Suspense>
      </div>
    </div>
  )
}
