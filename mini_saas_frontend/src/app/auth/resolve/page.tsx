"use client"

import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
}

function syncSession(userId: string, merchantId: string, merchantName: string) {
  localStorage.setItem("userId", userId)
  localStorage.setItem("tenantId", merchantId)
  localStorage.setItem("tenantName", merchantName)
}

export default function AuthResolvePage() {
  const resolved = useRef(false)

  useEffect(() => {
    if (resolved.current) return
    resolved.current = true

    async function resolve() {
      const userId = getCookie("bz_user_id")

      if (!userId) {
        window.location.href = "/auth"
        return
      }

      // Check server-side merchant membership
      try {
        const res = await fetch('/api/merchants/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessName: '_check_only_', phone: '0000000000' }),
        })
        const data = await res.json()

        // If user already has a merchant, the API returns alreadyExists: true
        if (data.merchantId && data.alreadyExists) {
          setCookie('bz_tenant', data.merchantId)
          setCookie('bz_tenant_name', data.merchantName || 'My Shop')
          syncSession(userId, data.merchantId, data.merchantName || 'My Shop')
          window.location.href = '/dashboard'
          return
        }
      } catch {
        // Fall through to cookie/localStorage checks
      }

      // Fallback: check cookie
      const tenantId = getCookie("bz_tenant")
      const tenantName = getCookie("bz_tenant_name") || "My Shop"

      if (tenantId) {
        syncSession(userId, tenantId, tenantName)
        window.location.href = "/dashboard"
        return
      }

      // Fallback: check localStorage
      const lsTenantId = localStorage.getItem("tenantId")
      const lsTenantName = localStorage.getItem("tenantName") || "My Shop"
      if (lsTenantId) {
        setCookie("bz_tenant", lsTenantId)
        setCookie("bz_tenant_name", lsTenantName)
        syncSession(userId, lsTenantId, lsTenantName)
        window.location.href = "/dashboard"
        return
      }

      // No merchant found → onboarding
      localStorage.setItem("userId", userId)
      window.location.href = "/onboarding"
    }

    resolve()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Finishing sign in...</span>
      </div>
    </div>
  )
}
