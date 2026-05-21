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
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
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

      const tenantId = getCookie("bz_tenant")
      if (tenantId) {
        console.log("[AuthResolve] Has tenant cookie, going to /dashboard")
        window.location.href = "/dashboard"
        return
      }

      try {
        const tenant = await db().tenants.orderBy("createdAt").first()
        if (tenant) {
          console.log("[AuthResolve] Found tenant in DB, going to /dashboard")
          setCookie("bz_tenant", tenant.id)
          setCookie("bz_tenant_name", tenant.name || "My Shop")
          window.location.href = "/dashboard"
          return
        }
      } catch (e) {
        console.log("[AuthResolve] DB error:", e)
      }

      console.log("[AuthResolve] No tenant, going to /onboarding")
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
