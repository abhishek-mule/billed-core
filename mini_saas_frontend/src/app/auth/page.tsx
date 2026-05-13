"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Mail, ArrowRight } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function AuthForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const searchParams = useSearchParams()

  useEffect(() => {
    if (getCookie("bz_tenant") && getCookie("bz_access")) {
      window.location.href = "/onboarding"
    }
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
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center lg:text-left">
          <h2 className="text-2xl font-bold text-slate-900">
            {sent ? "Check your email" : "Welcome to BillZo"}
          </h2>
          <p className="mt-1 text-slate-500">
            {sent
              ? `We sent a magic link to ${email}`
              : "Enter your email to get started instantly"}
          </p>
        </div>

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
                Click the link in your email to sign in. The link expires in 1 hour.
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

        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        }>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  )
}