'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function SplashScreen() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Check if we're in a PWA standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) {
      // Show splash for 1.5s in PWA mode
      const timer = setTimeout(() => {
        setVisible(false)
      }, 1500)
      return () => clearTimeout(timer)
    }

    // In browser mode, hide immediately
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center',
        'bg-background dark:bg-background',
        'transition-opacity duration-500 ease-out'
      )}
      role="status"
      aria-label="Loading Billzo"
    >
      <div className="flex flex-col items-center gap-4">
        <img
          src="/icon.svg"
          alt="BillZo"
          className="w-24 h-24 lg:w-28 lg:h-28 object-contain"
          width={96}
          height={96}
        />
        <p className="text-lg font-medium text-foreground/70">Billzo</p>
        <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
      </div>
    </div>
  )
}