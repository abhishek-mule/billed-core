"use client"

import React, { useState } from "react"
import Image from "next/image"
import { ArrowRight, ExternalLink, Loader2, Lock, Mail } from "lucide-react"

// ── Email provider → inbox URL, so "Open Email" jumps to the right mailbox ──
function inboxUrlFor(email: string): string {
  const domain = (email.split("@")[1] || "").trim().toLowerCase()
  const providers: Array<[string[], string]> = [
    [["gmail.com", "googlemail.com"], "https://mail.google.com/mail/u/0/#inbox"],
    [["yahoo.com", "yahoo.in", "ymail.com"], "https://mail.yahoo.com"],
    [["outlook.com", "hotmail.com", "live.com", "msn.com"], "https://outlook.live.com/mail/"],
    [["icloud.com", "me.com"], "https://www.icloud.com/mail/"],
    [["protonmail.com", "proton.me"], "https://mail.proton.me"],
    [["zoho.com", "zoho.in"], "https://mail.zoho.com"],
    [["fastmail.com", "fastmail.fm"], "https://app.fastmail.com"],
  ]
  const provider = providers.find(([domains]) => domains.includes(domain))
  if (provider) return provider[1]
  return "https://mail.google.com/mail/u/0/#inbox"
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "No login code found. Please click the link in your email again.",
  missing_token: "No login code found. Please click the link in your email again.",
  config: "Email login is not configured.",
  invalid_code: "This login link is invalid or expired. Please request a new one.",
  invalid: "This login link is invalid or expired. Please request a new one.",
  no_user: "Could not find your account. Please request a new link.",
  failed: "Something went wrong during login. Please try again.",
}

async function defaultSendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || "Failed to send link" }
    return { success: true }
  } catch {
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

// --- TYPE DEFINITIONS ---

export interface Testimonial {
  avatarSrc: string
  name: string
  handle: string
  text: string
}

interface SendMagicLinkResult {
  success: boolean
  error?: string
}

interface SignInPageProps {
  title?: React.ReactNode
  description?: React.ReactNode
  heroImageSrc?: string
  testimonials?: Testimonial[]
  onSendMagicLink?: (email: string) => Promise<SendMagicLinkResult>
}

// --- SUB-COMPONENTS ---

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:border-primary/70 focus-within:bg-primary/10">
    {children}
  </div>
)

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial, delay: string }) => (
  <div className={`animate-testimonial ${delay} flex items-start gap-3 rounded-3xl bg-slate-950/45 backdrop-blur-xl border border-white/10 p-5 w-64`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={testimonial.avatarSrc} className="h-10 w-10 object-cover rounded-2xl" alt={`${testimonial.name}'s avatar`} />
    <div className="text-sm leading-snug text-white">
      <p className="flex items-center gap-1 font-medium">{testimonial.name}</p>
      <p className="text-white/50">{testimonial.handle}</p>
      <p className="mt-1 text-white/70">{testimonial.text}</p>
    </div>
  </div>
)

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light text-foreground tracking-tighter">Welcome</span>,
  description = "Access your account and continue your journey with us",
  heroImageSrc,
  testimonials = [],
  onSendMagicLink,
}) => {
  const [mounted, setMounted] = useState(false)
  React.useEffect(() => setMounted(true), [])
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const [queryError, setQueryError] = useState("")
  React.useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("error")
    if (!key) { setQueryError(""); return }
    setQueryError(ERROR_MESSAGES[key] || ERROR_MESSAGES[key.toLowerCase()] || `Error: ${key}` || "Something went wrong. Please try again.")
  }, [])

  // Handle magic link that lands on /auth with ?code= (PKCE) — forward to callback handler
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const tokenHash = params.get("token_hash")
    if (!code && !tokenHash) return
    // If Supabase sent a code to /auth instead of /auth/callback, handle it here
    setAutoLogin(true)
    fetch("/api/auth/callback-exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, tokenHash, type: params.get("type") }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || "This login link is invalid or expired. Please request a new one.")
          setAutoLogin(false)
          window.history.replaceState(null, "", window.location.pathname)
          return
        }
        window.location.href = data.redirectTo || "/dashboard"
      })
      .catch(() => {
        setError("Could not finish login. Please try again.")
        setAutoLogin(false)
      })
  }, [])

  React.useEffect(() => {
    async function finishSupabaseHashLogin() {
      const hash = window.location.hash
      // Supabase may redirect with #error=access_denied&error_description=... when link expired
      if (hash.includes("error=")) {
        const errParams = new URLSearchParams(hash.slice(1))
        const errDesc = errParams.get("error_description") || errParams.get("error") || ""
        const decoded = errDesc ? decodeURIComponent(errDesc.replaceAll("+", " ")) : ""
        setError(decoded || ERROR_MESSAGES.invalid || "This login link is invalid or expired. Please request a new one.")
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
        return
      }
      if (!hash.includes("access_token=")) return
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      const params = new URLSearchParams(hash.slice(1))
      const accessToken = params.get("access_token")
      if (!accessToken) {
        setError("This login link is invalid or expired. Please request a new one.")
        return
      }
      setAutoLogin(true)
      setError("")
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
          setAutoLogin(false)
          return
        }
        window.location.href = data.redirectTo || "/onboarding"
      } catch {
        setError("Could not finish login. Please try again.")
        setAutoLogin(false)
      }
    }
    finishSupabaseHashLogin()
  }, [])

  const activeError = error || queryError

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    if (!email.includes("@")) {
      setError("Please enter a valid email address")
      return
    }
    setLoading(true)
    const result = onSendMagicLink
      ? await onSendMagicLink(email)
      : await defaultSendMagicLink(email)
    if (!result.success) {
      setError(result.error || "Failed to send link")
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  if (autoLogin) {
    return (
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground animate-element animate-delay-100">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Finishing sign in...</span>
        </div>
      </div>
    )
  }

  return (
    <div suppressHydrationWarning className="h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden md:overflow-hidden">
      {/* Right column: magic-link form */}
      <section className="flex-1 md:order-2 flex items-center justify-center p-6 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6 py-4">
            {/* Mobile brand mark — hero panel is hidden below md */}
            <div className="md:hidden flex flex-col items-center animate-element animate-delay-100">
              <div className="w-12 h-12 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center p-1.5 mb-2">
                <Image src="/logo.svg" alt="BillZo" width={32} height={32} className="object-contain" />
              </div>
              <span className="text-sm font-semibold text-foreground">BillZo</span>
            </div>

            <h1 className="animate-element animate-delay-100 text-4xl md:text-5xl font-semibold leading-tight">{title}</h1>
            <p className="animate-element animate-delay-200 text-muted-foreground text-sm sm:text-base">{description}</p>

            {activeError ? (
              <div className="animate-element animate-delay-300 space-y-3">
                <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-destructive/[0.07] border border-destructive/25 text-destructive text-sm leading-relaxed">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  {activeError}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Clear local + ?error= query errors and strip the query
                    // string — a plain reload would preserve ?error= and loop
                    // the user back onto this error screen.
                    setError("")
                    setQueryError("")
                    window.history.replaceState(null, "", window.location.pathname)
                  }}
                  className="w-full rounded-2xl border border-border py-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : sent ? (
              <div className="animate-element animate-delay-300 space-y-3">
                <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] text-center px-5 py-7 relative overflow-hidden">
                  <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-primary/[0.06]" />
                  <div className="relative">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Check your inbox</p>
                    <p className="text-xs text-muted-foreground mt-1">Sent to {email}</p>
                  </div>
                </div>
                <a
                  href={inboxUrlFor(email)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Email
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </a>
                <button
                  type="button"
                  onClick={() => { setSent(false); setEmail(""); setError("") }}
                  className="w-full rounded-2xl border border-border py-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="animate-element animate-delay-300">
                  <label className="text-sm font-medium text-muted-foreground">Business Email</label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <input
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        aria-label="Email address"
                        className="w-full bg-transparent text-sm p-4 pl-11 rounded-2xl focus:outline-none"
                      />
                    </div>
                  </GlassInputWrapper>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="group animate-element animate-delay-400 w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {loading ? "Sending link..." : "Send Magic Link"}
                  {!loading && <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />}
                </button>

                <div className="animate-element animate-delay-500 flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><Lock className="w-3 h-3" />Passwordless</span>
                </div>
              </form>
            )}

            <p suppressHydrationWarning className="text-center text-[10px] text-muted-foreground/70 leading-relaxed">
              By signing in, you agree to our{" "}
              <a href="#" className="text-primary hover:underline underline-offset-2">Terms of Service</a>
              {" "}and{" "}
              <a href="#" className="text-primary hover:underline underline-offset-2">Privacy Policy</a>
            </p>
          </div>
        </div>
      </section>

      {/* Left column: hero image + testimonials */}
      {heroImageSrc && (
        <section className="hidden md:block md:order-1 flex-1 relative p-4">
          <div className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${heroImageSrc})` }}>
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-[#0a1628]/40 via-transparent to-[#0a1628]/80" />
            <div className="absolute top-0 left-0 right-0 h-1 flex rounded-t-3xl overflow-hidden">
              <div className="flex-1 bg-[#FF9933]" />
              <div className="flex-1 bg-white" />
              <div className="flex-1 bg-[#138808]" />
            </div>
            <div className="absolute top-8 left-8 flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg">
                <Image src="/logo.svg" alt="BillZo" width={28} height={28} className="object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-white text-sm leading-tight tracking-wide">BillZo</span>
                <span className="text-[9px] text-white/60 tracking-[0.22em] uppercase mt-0.5">Recovery OS</span>
              </div>
            </div>
            <div className="absolute bottom-20 left-8 right-8">
              <p className="font-display font-semibold text-white text-[26px] leading-[1.1] tracking-tight drop-shadow-lg">
                Every unpaid invoice<br />has a next move.
              </p>
              <p className="mt-2 text-[12px] text-white/65 leading-relaxed max-w-xs">
                From invoice to payment — BillZo manages the entire recovery journey, automatically.
              </p>
              <div className="mt-4 flex gap-2.5">
                <div className="rounded-2xl bg-white/[0.08] backdrop-blur-md border border-white/10 px-3.5 py-2.5">
                  <p className="text-[10px] text-white/55">Recovering</p>
                  <p className="text-lg font-semibold text-white tracking-tight">₹17,460</p>
                  <p className="text-[10px] text-emerald-300/90">82% likely to pay today</p>
                </div>
                <div className="rounded-2xl bg-white/[0.08] backdrop-blur-md border border-white/10 px-3.5 py-2.5">
                  <p className="text-[10px] text-white/55">Active customers</p>
                  <p className="text-lg font-semibold text-white tracking-tight">12</p>
                  <p className="text-[10px] text-white/55">Next WhatsApp · 7:30 PM</p>
                </div>
              </div>
            </div>
            <div className="absolute bottom-6 left-6 flex items-center gap-1.5 bg-white/[0.08] backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              <span className="text-xs font-semibold text-white/70">Proudly built for Indian MSMEs</span>
            </div>
          </div>
          {testimonials.length > 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 px-8 w-full justify-center">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] && <div className="hidden xl:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" /></div>}
              {testimonials[2] && <div className="hidden 2xl:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" /></div>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}