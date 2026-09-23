"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

function syncSessionToLocalStorage(userId: string, tenantId?: string | null, tenantName?: string | null) {
  // Prefer API-returned tenant (already in data) over cookie read — cookie may not be flushed to document.cookie yet
  const cookieTenantId = getCookie("bz_tenant")
  const cookieTenantName = getCookie("bz_tenant_name")
  const finalTenantId = tenantId || cookieTenantId
  const finalTenantName = tenantName || cookieTenantName
  if (userId) localStorage.setItem("userId", userId)
  if (finalTenantId) localStorage.setItem("tenantId", finalTenantId)
  if (finalTenantName) localStorage.setItem("tenantName", finalTenantName)
}

function CallbackContent() {
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

      if (tokenHash || code) {
        console.log("[AuthCallback] Query param flow:", { tokenHash: !!tokenHash, type, code: !!code })
        try {
          const res = await fetch("/api/auth/callback-exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ tokenHash, type, code }),
          })
          const data = await res.json()

          if (!res.ok) {
            console.error("[AuthCallback] Exchange failed:", data.error)
            setError(data.error || "Login failed. Please request a new link.")
            return
          }

          console.log("[AuthCallback] Exchange success, userId:", data.userId)
          syncSessionToLocalStorage(data.userId, data.merchantId || data.tenantId, data.merchantName || data.tenantName)
          // Small delay ensures Set-Cookie from fetch is flushed before next navigation's middleware check
          await new Promise((r) => setTimeout(r, 150))
          window.location.replace(data.redirectTo || "/onboarding")
          return
        } catch (e) {
          console.error("[AuthCallback] Exchange error:", e)
          setError("Could not finish login. Please try again.")
          return
        }
      }

      const hash = window.location.hash
      if (hash.includes("error=")) {
        const errParams = new URLSearchParams(hash.slice(1))
        const errDesc = errParams.get("error_description") || errParams.get("error") || ""
        const decoded = errDesc ? decodeURIComponent(errDesc.replaceAll("+", " ")) : ""
        setError(decoded || "This login link is invalid or expired. Please request a new one.")
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
        return
      }
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
            credentials: "include",
            body: JSON.stringify({ accessToken }),
          })
          const data = await res.json()

          if (!res.ok) {
            setError(data.error || "Login failed. Please request a new link.")
            return
          }

          syncSessionToLocalStorage(data.userId, data.tenantId, data.tenantName)
          await new Promise((r) => setTimeout(r, 150))
          window.location.replace(data.redirectTo || "/onboarding")
          return
        } catch {
          setError("Could not finish login. Please try again.")
          return
        }
      }

      // Also handle Supabase error in query ?error=...&error_description=... (PKCE failure)
      const err = searchParams?.get("error")
      if (err) {
        const desc = searchParams?.get("error_description") || ""
        const decoded = desc ? decodeURIComponent(desc.replaceAll("+", " ")) : ""
        setError(decoded || `Login failed: ${err}`)
        return
      }

      setError("No login token found. Please click the link in your email again.")
    }

    handleCallback()
  }, [searchParams])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center p-8">
          <p className="text-danger font-medium mb-4">{error}</p>
          <a href="/auth" className="text-info hover:underline font-medium">
            Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex items-center gap-3 text-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Finishing sign in...</span>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex items-center gap-3 text-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
