"use client"

import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"
import { db } from "@/lib/billzo/db"

function getCookie(name: string) {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  const cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  console.log(`[AuthResolve] Setting cookie: ${name}=${value}`)
  document.cookie = cookie
}

function syncSession(userId: string, tenantId: string, tenantName: string) {
  localStorage.setItem("userId", userId)
  localStorage.setItem("tenantId", tenantId)
  localStorage.setItem("tenantName", tenantName)
}

export default function AuthResolvePage() {
  const resolved = useRef(false)

  useEffect(() => {
    if (resolved.current) return
    resolved.current = true

    async function resolve() {
      const userId = getCookie("bz_user_id")
      console.log("[AuthResolve] bz_user_id:", userId || "MISSING")

      if (!userId) {
        console.log("[AuthResolve] No user ID, redirecting to /auth")
        window.location.href = "/auth"
        return
      }

      // Check server-side tenant membership first (source of truth)
      try {
        const res = await fetch('/api/tenants/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopName: '' }),
        })
        const data = await res.json()

        if (data.tenantId && data.alreadyExists) {
          console.log("[AuthResolve] Server membership found, tenant:", data.tenantId)
          setCookie('bz_tenant', data.tenantId)
          setCookie('bz_tenant_name', data.tenantName || 'My Shop')
          syncSession(userId, data.tenantId, data.tenantName || 'My Shop')
          window.location.href = '/dashboard'
          return
        }
      } catch (e) {
        console.log("[AuthResolve] Server membership check failed, falling back:", e)
      }

      // Fallback: check cookie
      const tenantId = getCookie("bz_tenant")
      const tenantName = getCookie("bz_tenant_name") || "My Shop"

      if (tenantId) {
        console.log("[AuthResolve] Has tenant cookie, syncing and going to /dashboard")
        syncSession(userId, tenantId, tenantName)
        window.location.href = "/dashboard"
        return
      }

      // Fallback: check localStorage
      const lsTenantId = localStorage.getItem("tenantId")
      const lsTenantName = localStorage.getItem("tenantName") || "My Shop"
      if (lsTenantId) {
        console.log("[AuthResolve] Found tenant in localStorage, rehydrating cookie")
        setCookie("bz_tenant", lsTenantId)
        setCookie("bz_tenant_name", lsTenantName)
        syncSession(userId, lsTenantId, lsTenantName)
        window.location.href = "/dashboard"
        return
      }

      // Fallback: check IndexedDB (Dexie)
      try {
        const tenant = await db().tenants.orderBy("createdAt").first()
        if (tenant) {
          console.log("[AuthResolve] Found tenant in IndexedDB, syncing and going to /dashboard")
          setCookie("bz_tenant", tenant.id)
          setCookie("bz_tenant_name", tenant.name || "My Shop")
          syncSession(userId, tenant.id, tenant.name || "My Shop")
          window.location.href = "/dashboard"
          return
        }
      } catch (e) {
        console.log("[AuthResolve] IndexedDB error:", e)
      }

      console.log("[AuthResolve] No tenant found anywhere, going to /onboarding")
      localStorage.setItem("userId", userId)
      window.location.href = "/onboarding"
    }

    resolve()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex items-center gap-3 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Finishing sign in...</span>
      </div>
    </div>
  )
}
