"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

export default function AuthCallbackPage() {
  const [error, setError] = useState("")
  const resolved = useRef(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (resolved.current) return
    resolved.current = true

    async function handleCallback() {
      const tokenHash = searchParams?.get("token_hash")
      const type = searchParams?.get("type")
      const code = searchParams?.get("code")

      // Query param flow (Supabase PKCE or OTP)
      if (tokenHash || code) {
        console.log("[AuthCallback] Query param flow:", { tokenHash: !!tokenHash, type, code: !!code })
        try {
          const res = await fetch("/api/auth/callback-exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenHash, type, code }),
          })
          const data = await res.json()

          if (!res.ok) {
            console.error("[AuthCallback] Exchange failed:", data.error)
            setError(data.error || "Login failed. Please request a new link.")
            return
          }

          console.log("[AuthCallback] Exchange success, redirecting to:", data.redirectTo)
          window.location.href = data.redirectTo || "/onboarding"
          return
        } catch (e) {
          console.error("[AuthCallback] Exchange error:", e)
          setError("Could not finish login. Please try again.")
          return
        }
      }

      // Hash-based flow (Supabase default email template)
      const hash = window.location.hash
      if (hash.includes("access_token=")) {
        console.log("[AuthCallback] Hash-based flow detected")
        const params = new URLSearchParams(hash.slice(1))
        const accessToken = params.get("access_token")

        if (!accessToken) {
          setError("Invalid login link. Please request a new one.")
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
            setError(data.error || "Login failed. Please request a new link.")
            return
          }

          window.location.href = data.redirectTo || "/onboarding"
          return
        } catch {
          setError("Could not finish login. Please try again.")
          return
        }
      }

      // No token found
      setError("No login token found. Please click the link in your email again.")
    }

    handleCallback()
  }, [searchParams])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center p-8">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <a href="/auth" className="text-indigo-600 hover:underline font-medium">
            Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex items-center gap-3 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Finishing sign in...</span>
      </div>
    </div>
  )
}
