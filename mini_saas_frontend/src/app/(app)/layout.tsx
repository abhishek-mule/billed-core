"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from '@/components/billzo/AppShell'

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const tenantId = getCookie('bz_tenant')
    if (!tenantId) {
      router.push("/login")
    }
  }, [router])

  const tenantId = typeof window !== 'undefined' ? getCookie('bz_tenant') : null

  if (!tenantId) {
    return null
  }

  return <AppShell>{children}</AppShell>
}