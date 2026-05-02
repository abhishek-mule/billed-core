'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function RootEntry() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuth = () => {
      // In a real app, this would verify a JWT or session
      const token = localStorage.getItem('billzo_token')
      if (token) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    }
    
    // Add a tiny delay to prevent flash of content
    const timer = setTimeout(() => {
      checkAuth()
    }, 100)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center text-2xl font-bold animate-pulse shadow-glow mb-6">
        B
      </div>
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
}