"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Mail, ArrowRight, Phone, MessageSquare } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

declare global {
  interface Window {
    initSendOTP?: (config: MSG91Config) => void
    sendOtp?: (identifier: string, onSuccess?: (data: any) => void, onFailure?: (err: any) => void) => void
    retryOtp?: (onSuccess?: (data: any) => void, onFailure?: (err: any) => void) => void
    verifyOtp?: (otp: string, onSuccess?: (data: any) => void, onFailure?: (err: any) => void) => void
  }
}

interface MSG91Config {
  widgetId: string
  tokenAuth?: string
  exposeMethods?: boolean
  success: (data: { response?: string; hash?: string; mobile?: string }) => void
  failure: (error: { message?: string }) => void
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

  return (
    <div className="space-y-4">
      {hasError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          {hasError === "invalid"
            ? "This link is invalid or expired. Please request a new one."
            : "Something went wrong. Please try again."}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {sent ? (
        <div className="space-y-4">
          <div className="p-6 bg-indigo-50 rounded-xl text-center">
            <Mail className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
            <p className="text-sm text-indigo-700">
              Click the link in your email to sign in.
            </p>
          </div>
          <button
            onClick={() => { setSent(false); setEmail("") }}
            className="w-full py-3.5 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {loading ? "Sending link..." : "Continue with Email"}
          </button>
        </form>
      )}
    </div>
  )
}

function PhoneOtpForm() {
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [widgetError, setWidgetError] = useState("")
  const [status, setStatus] = useState("")
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const widgetLoaded = useRef<boolean | 'ready'>(false)
  const reqIdRef = useRef<string>("")
  const otpTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (widgetLoaded.current) return
    widgetLoaded.current = true

    const widgetId = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID
    const tokenAuth = process.env.NEXT_PUBLIC_MSG91_AUTH_TOKEN
    if (!widgetId || widgetId.startsWith('<')) {
      setWidgetError("MSG91 Widget ID not configured. Please use email login.")
      return
    }
    if (!tokenAuth || tokenAuth.startsWith('<')) {
      setWidgetError("MSG91 Auth Token not configured. Please use email login.")
      return
    }
    setStatus("Loading OTP service...")

    const cfg: MSG91Config = {
      widgetId,
      tokenAuth,
      exposeMethods: true,
      success: (data) => {
        setStatus("")
        if (data.hash) {
          handleVerify(data.hash)
        } else {
          setError("Verification failed: no token received")
        }
      },
      failure: (err) => {
        setError(err?.message || "OTP verification failed")
        setStatus("")
      },
    }

    window.initSendOTP?.(cfg)
    setTimeout(() => {
      if (status === "Loading OTP service...") {
        setStatus("")
        if (typeof window.initSendOTP !== 'function') {
          setWidgetError("Could not load OTP service. Please use email login.")
        }
      }
    }, 10000)
  }, [])

  const handleSendOtp = () => {
    if (otpTimeout.current) clearTimeout(otpTimeout.current)
    setError("")
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length !== 10) {
      setError("Please enter a valid 10-digit mobile number")
      return
    }
    if (typeof window.sendOtp !== 'function') {
      setError("OTP service not ready. Please wait a moment and try again.")
      return
    }
    setStatus("Sending OTP...")
    reqIdRef.current = ""
    setOtp("")

    window.sendOtp(
      `91${cleaned}`,
      (data: any) => {
        setStatus("")
        if (data?.message && typeof data.message === 'string') {
          reqIdRef.current = data.message
          setStep('otp')
        } else if (data?.hash) {
          handleVerify(data.hash)
        }
      },
      (err: any) => {
        setError(err?.message || "Failed to send OTP. Please try again.")
        setStatus("")
      }
    )
  }

  const handleVerify = async (hash?: string) => {
    if (!hash) return
    setStatus("Verifying...")
    try {
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: hash }),
      })
      const verifyData = await verifyRes.json()
      if (verifyRes.ok && verifyData.success) {
        setCookie('bz_tenant', verifyData.tenantId || '')
        setCookie('bz_tenant_name', verifyData.shopName || 'My Shop')
        window.location.href = verifyData.redirectTo || "/onboarding"
      } else {
        setError(verifyData.error || "Verification failed")
        setStatus("")
        setStep('otp')
      }
    } catch {
      setError("Could not verify OTP. Please try again.")
      setStatus("")
    }
  }

  const handleVerifyOtp = () => {
    setError("")
    if (otp.replace(/\D/g, '').length !== 6) {
      setError("Please enter a valid 6-digit OTP")
      return
    }
    if (typeof window.verifyOtp !== 'function') {
      setError("OTP service not ready. Please try again.")
      return
    }
    setStatus("Verifying OTP...")
    otpTimeout.current = setTimeout(() => {
      setError("OTP verification timed out. Please try again.")
      setStatus("")
    }, 30000)

    window.verifyOtp(
      otp,
      (data: any) => {
        if (otpTimeout.current) clearTimeout(otpTimeout.current)
        if (data?.hash) {
          handleVerify(data.hash)
        } else {
          setError("Verification failed")
          setStatus("")
        }
      },
      (err: any) => {
        if (otpTimeout.current) clearTimeout(otpTimeout.current)
        setError(err?.message || "Invalid OTP. Please try again.")
        setStatus("")
      }
    )
  }

  const handleResend = () => {
    setOtp("")
    setStep('phone')
    if (typeof window.retryOtp === 'function') {
      setStatus("Resending OTP...")
      window.retryOtp(
        (data: any) => {
          setStatus("")
          if (data?.message) {
            reqIdRef.current = data.message
            setStep('otp')
          }
        },
        (err: any) => {
          setError(err?.message || "Failed to resend OTP")
          setStatus("")
        }
      )
    } else {
      handleSendOtp()
    }
  }

  return (
    <div className="space-y-4">
      {widgetError && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-sm">
          {widgetError}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Mobile Number
        </label>
        <div className="relative">
          <Phone className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <span className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-500 text-base font-medium">+91</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="9876543210"
            maxLength={10}
            disabled={step === 'otp'}
            className="w-full pl-20 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all disabled:opacity-50"
          />
        </div>
      </div>

      {step === 'otp' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Enter OTP
          </label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="------"
            maxLength={6}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-center text-2xl tracking-widest font-mono"
          />
          <button onClick={handleResend} className="mt-2 text-xs text-indigo-600 hover:underline">
            Resend OTP
          </button>
        </div>
      )}

      <button
        onClick={step === 'otp' ? handleVerifyOtp : handleSendOtp}
        disabled={status !== "" || (step === 'phone' ? phone.length !== 10 : otp.length !== 6)}
        className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
      >
        {status ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquare className="h-5 w-5" />}
        {status || (step === 'otp' ? 'Verify OTP' : 'Send OTP')}
      </button>
    </div>
  )
}

function AuthForm() {
  const [tab, setTab] = useState<'email' | 'phone'>('email')

  useEffect(() => {
    if (!getCookie("bz_access")) return

    if (getCookie("bz_tenant")) {
      window.location.href = "/dashboard"
    } else {
      window.location.href = "/onboarding"
    }
  }, [])

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center lg:text-left">
        <h2 className="text-2xl font-bold text-slate-900">Welcome to BillZo</h2>
        <p className="mt-1 text-slate-500">Sign in with email or phone</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setTab('email')}
          className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
        >
          <Mail className="h-4 w-4" /> Email
        </button>
        <button
          onClick={() => setTab('phone')}
          className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'phone' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
        >
          <Phone className="h-4 w-4" /> Phone
        </button>
      </div>

      {tab === 'email' ? <MagicLinkForm /> : <PhoneOtpForm />}
    </div>
  )
}

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        </div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <img src="/logo_new.png" alt="BillZo" className="w-12 h-12 object-contain" />
            <span className="text-2xl font-bold text-white">BillZo</span>
          </div>
        </div>
        <div className="relative space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              Get paid faster with<br />
              <span className="text-indigo-400">automated reminders</span>
            </h1>
            <p className="mt-4 text-slate-400 text-lg max-w-md">
              Send professional invoices and follow up automatically.
              Never lose track of pending payments again.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="lg:hidden flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <img src="/logo_new.png" alt="BillZo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-slate-900">BillZo</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          }>
            <AuthForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}