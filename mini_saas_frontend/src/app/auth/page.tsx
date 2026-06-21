"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, Mail, ArrowRight, Phone, MessageSquare, Lock, Eye, EyeOff, Apple, Check } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
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
        ? "Email login is not configured. Please use phone OTP."
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
      <div className="space-y-3">
        <div role="alert" className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-red-500 text-xs">{msg}</div>
        <button onClick={() => window.location.reload()} className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sent ? (
        <div className="space-y-3">
          <div className="py-6 bg-violet-50 rounded-xl text-center border border-violet-100">
            <Mail className="w-7 h-7 text-violet-500 mx-auto mb-2" />
            <p className="text-xs text-violet-700 font-medium">Check your inbox — click the link to sign in.</p>
          </div>
          <button onClick={() => { setSent(false); setEmail("") }} className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email-input" className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" aria-hidden="true" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white outline-none transition-all"
                aria-label="Email address"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-violet-200" aria-busy={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? "Sending link..." : "Continue with Email"}
          </button>
        </form>
      )}
    </div>
  )
}

function PasswordForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email.includes("@")) { setError("Please enter a valid email"); return }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Invalid email or password")
        setLoading(false)
        return
      }
      if (remember) localStorage.setItem("billzo-remember-email", email)
      else localStorage.removeItem("billzo-remember-email")
      window.location.href = data.redirectTo || "/dashboard"
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  useEffect(() => {
    const remembered = localStorage.getItem("billzo-remember-email")
    if (remembered) setEmail(remembered)
  }, [])

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div role="alert" className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-red-500 text-xs">{error}</div>}
      <div>
        <label htmlFor="pw-email" className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide">Email Address</label>
        <input
          id="pw-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white outline-none transition-all"
        />
      </div>
      <div>
        <label htmlFor="pw-password" className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide">Password</label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" aria-hidden="true" />
          <input
            id="pw-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white outline-none transition-all"
          />
          <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors" tabIndex={-1} aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <button type="button" onClick={() => setRemember(v => !v)} className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${remember ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-300 bg-white'}`} aria-checked={remember} role="checkbox">
            {remember && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          <span className="text-xs text-gray-400">Remember me</span>
        </label>
        <button type="button" className="text-xs text-violet-600 hover:text-violet-700 hover:underline transition-colors">Forgot password?</button>
      </div>
      <button type="submit" disabled={loading} className="w-full py-2.5 bg-gray-900 hover:bg-gray-950 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm" aria-busy={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  )
}

function PhoneOtpForm() {
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const phoneRef = useRef<string>("")

  const handleSendOtp = async () => {
    setError("")
    const cleaned = phone.replace(/\D/g, '').slice(0, 10)
    if (cleaned.length !== 10) { setError("Please enter a valid 10-digit mobile number"); return }
    setSending(true)
    phoneRef.current = `91${cleaned}`
    try {
      const res = await fetch("/api/auth/phone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed to send OTP"); setSending(false); return }
      setStep('otp')
    } catch { setError("Something went wrong. Please try again.") }
    setSending(false)
  }

  const handleVerify = async () => {
    setError("")
    const cleanedOtp = otp.replace(/\D/g, '')
    if (cleanedOtp.length < 4) { setError("Please enter a valid OTP"); return }
    setVerifying(true)
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneRef.current, otp: cleanedOtp }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (data.tenantId) setCookie('bz_tenant', data.tenantId)
        if (data.shopName) setCookie('bz_tenant_name', data.shopName)
        window.location.href = data.redirectTo || "/auth/resolve"
      } else { setError(data.error || "Invalid OTP"); setVerifying(false) }
    } catch { setError("Could not verify OTP. Please try again."); setVerifying(false) }
  }

  const handleResend = () => { setOtp(""); setStep('phone') }

  return (
    <div className="space-y-3">
      {error && <div role="alert" className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-red-500 text-xs">{error}</div>}
      <div>
        <label htmlFor="phone-input" className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide">Mobile Number</label>
        <div className="relative">
          <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" aria-hidden="true" />
          <span className="absolute left-9 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium border-r border-gray-200 pr-2">+91</span>
          <input
            id="phone-input" type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="9876543210" maxLength={10} disabled={step === 'otp'}
            className="w-full pl-[4.5rem] pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white outline-none transition-all disabled:opacity-50"
          />
        </div>
      </div>
      {step === 'otp' && (
        <div>
          <label htmlFor="otp-input" className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide">Enter OTP</label>
          <input
            id="otp-input" type="text" value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • • • •" maxLength={6}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white outline-none transition-all text-center text-xl tracking-[0.5em] font-mono text-gray-700"
          />
          <button onClick={handleResend} className="mt-1.5 text-xs text-violet-600 hover:text-violet-700 hover:underline transition-colors">Resend OTP</button>
        </div>
      )}
      <button
        onClick={step === 'otp' ? handleVerify : handleSendOtp}
        disabled={sending || verifying || (step === 'phone' ? phone.length !== 10 : otp.length < 4)}
        className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-violet-200"
        aria-busy={sending || verifying}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
        {sending ? "Sending..." : verifying ? "Verifying..." : step === 'otp' ? "Verify OTP" : "Send OTP"}
      </button>
    </div>
  )
}

function SocialButtons() {
  const handleSocial = (provider: string) => {
    window.location.href = `/api/auth/${provider}`
  }

  return (
    <div className="space-y-2">
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center"><span className="px-2 bg-white text-[11px] text-gray-300 font-medium tracking-wide">OR CONTINUE WITH</span></div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => handleSocial('google')} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google
        </button>
        <button onClick={() => handleSocial('apple')} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">
          <Apple className="w-4 h-4" />
          Apple
        </button>
      </div>
    </div>
  )
}

function AuthForm() {
  const [tab, setTab] = useState<'email' | 'password' | 'phone'>('password')

  const tabs = [
    { id: 'password' as const, label: 'Password', icon: Lock },
    { id: 'email' as const, label: 'Magic Link', icon: Mail },
    { id: 'phone' as const, label: 'Phone', icon: Phone },
  ]

  return (
    <div className="w-full max-w-[340px]">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex justify-center mb-3">
          <Image src="/logo_new.png" alt="BillZo" width={40} height={40} className="object-contain" />
        </div>
        <h1 className="text-lg font-bold text-gray-800">Welcome back</h1>
        <p className="text-xs text-gray-400 mt-0.5">Sign in to your BillZo dashboard</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        {/* Tab switcher */}
        <div role="tablist" aria-label="Login method" className="flex gap-0 rounded-lg bg-gray-100 p-0.5 mb-4">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === id ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-500'
              }`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === 'email' && <MagicLinkForm />}
          {tab === 'password' && <PasswordForm />}
          {tab === 'phone' && <PhoneOtpForm />}
        </div>

        <SocialButtons />
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-gray-300 mt-5">
        By signing in, you agree to the{' '}
        <a href="#" className="text-gray-400 hover:text-gray-600 underline">Terms of Service</a>
        {' '}and{' '}
        <a href="#" className="text-gray-400 hover:text-gray-600 underline">Privacy Policy</a>
      </p>
    </div>
  )
}

export default function AuthPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0a0e27]">
      {/* Left: illustration panel */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e27] via-[#111638] to-[#1a1040]" />
        <div className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: "url('/auth_left.png')" }} />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0e27] to-transparent" />
      </div>

      {/* Mobile logo bar */}
      <div className="lg:hidden flex items-center gap-2 p-5 border-b border-white/5">
        <Image src="/logo_new.png" alt="BillZo" width={28} height={28} className="object-contain" />
        <span className="font-bold text-white text-sm">BillZo</span>
      </div>

      {/* Right: login card panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[#0a0e27]">
        <Suspense fallback={<div className="flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-violet-400" /></div>}>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  )
}
