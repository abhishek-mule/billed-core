'use client'

import { useEffect, useState } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 80)
    const t2 = setTimeout(() => setPhase('exit'), 1600)
    const t3 = setTimeout(() => onComplete(), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-300"
      style={{ opacity: phase === 'exit' ? 0 : 1 }}
    >
      <div
        className="w-48 h-48 md:w-56 md:h-56"
        style={{
          opacity: phase === 'enter' ? 0 : 1,
          transform: `scale(${phase === 'enter' ? 0.9 : 1})`,
          transition: 'opacity 0.35s ease-out, transform 0.35s ease-out',
        }}
      >
        <img
          src="/animated_splash.svg"
          alt="BillZo"
          className="w-full h-full"
        />
      </div>

      <h1
        className="mt-2 text-xl font-black tracking-tight text-foreground"
        style={{
          opacity: phase === 'enter' ? 0 : 1,
          transition: 'opacity 0.3s ease-out 0.1s',
        }}
      >
        BillZo
      </h1>

      <p
        className="mt-1 text-xs font-medium text-muted-foreground"
        style={{
          opacity: phase === 'enter' ? 0 : 1,
          transition: 'opacity 0.3s ease-out 0.15s',
        }}
      >
        Your business, anywhere
      </p>
    </div>
  )
}
