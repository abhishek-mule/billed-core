'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export function getDiceBearAvatarUrl(seed: string, style: 'glyphs' | 'shapes' = 'shapes'): string {
  const safeSeed = encodeURIComponent(seed.trim() || 'BillZo')
  return `https://api.dicebear.com/10.x/${style}/svg?seed=${safeSeed}`
}

interface AvatarProps {
  seed?: string
  alt?: string
  style?: 'glyphs' | 'shapes'
  className?: string
  size?: number
}

export function Avatar({
  seed = 'BillZo',
  alt = 'avatar',
  style = 'shapes',
  className,
  size = 40,
}: AvatarProps) {
  const [error, setError] = useState(false)
  const url = getDiceBearAvatarUrl(seed, style)
  const initial = (seed.trim()[0] || 'B').toUpperCase()

  if (error) {
    return (
      <div
        className={cn(
          'rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center border border-primary/20 shrink-0 select-none',
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initial}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={alt || seed}
      width={size}
      height={size}
      onError={() => setError(true)}
      className={cn('rounded-full object-cover shrink-0 bg-muted/20', className)}
      style={{ width: size, height: size }}
    />
  )
}
