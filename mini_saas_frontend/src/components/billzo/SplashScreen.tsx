'use client'

import { useEffect, useState, useRef } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [exit, setExit] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    // Let the SVG animation play through (~2s), then dismiss
    const t = setTimeout(() => {
      if (mounted.current) {
        setExit(true)
        setTimeout(() => { if (mounted.current) onComplete() }, 350)
      }
    }, 2100)
    return () => { mounted.current = false; clearTimeout(t) }
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-300"
      style={{ opacity: exit ? 0 : 1 }}
    >
      <div className="w-48 h-48 md:w-56 md:h-56">
        <img src="/animated_splash.svg" alt="BillZo" className="w-full h-full" />
      </div>

      <h1 className="mt-2 text-xl font-black tracking-tight text-foreground">BillZo</h1>

      <p className="mt-1 text-xs font-medium text-muted-foreground">Your business, anywhere</p>
    </div>
  )
}
