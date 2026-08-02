'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface DeprecatedRouteProps {
  redirect: string
  message?: string
}

export function DeprecatedRoute({ redirect, message }: DeprecatedRouteProps) {
  const router = useRouter()

  useEffect(() => {
    if (message) console.warn(`[DeprecatedRoute] ${message} → redirecting to ${redirect}`)
    router.replace(redirect)
  }, [router, redirect, message])

  return null
}
