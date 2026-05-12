"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from '@/components/billzo/AppShell'

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function getUserIdFromCookie() {
  const token = getCookie('bz_access')
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.userId || null
  } catch { return null }
}

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const accessToken = getCookie('bz_access')
    const tenantId = getCookie('bz_tenant')

    if (!accessToken || !tenantId) {
      window.location.href = "/login"
      return
    }

    const userId = getUserIdFromCookie()
    if (!userId) {
      window.location.href = "/login"
      return
    }
  }, [router])

  const accessToken = typeof window !== 'undefined' ? getCookie('bz_access') : null
  const tenantId = typeof window !== 'undefined' ? getCookie('bz_tenant') : null

  if (!accessToken || !tenantId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return <AppShell>{children}</AppShell>
}