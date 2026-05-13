"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
    const payload = JSON.parse(atob(token.split('.')[0]))
    return payload.userId || null
  } catch { return null }
}

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isMounted, setIsMounted] = useState(false)
  const [isAllowed, setIsAllowed] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    setIsAllowed(false)

    const accessToken = getCookie('bz_access')
    const tenantId = getCookie('bz_tenant')

    if (!accessToken) {
      window.location.href = "/auth"
      return
    }

    const userId = getUserIdFromCookie()
    if (!userId) {
      window.location.href = "/auth"
      return
    }

    if (!tenantId && pathname !== '/onboarding') {
      window.location.href = "/onboarding"
      return
    }

    setIsAllowed(true)
  }, [pathname, router])

  if (!isMounted || !isAllowed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return <AppShell>{children}</AppShell>
}
