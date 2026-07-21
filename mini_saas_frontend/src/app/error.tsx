'use client'

import Image from 'next/image'
import { RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 bg-white">
      <Image
        src="/error_page.png"
        alt="Error"
        width={320}
        height={320}
        className="w-64 h-64 object-contain mb-6"
        priority
      />
      <h1 className="text-xl font-black text-foreground">Something went wrong</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground text-center max-w-xs">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  )
}
