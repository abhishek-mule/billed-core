"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from '@/components/billzo/AppShell'

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [pathname])

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return <AppShell>{children}</AppShell>
}
