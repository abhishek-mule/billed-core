'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Style, Avatar as DiceBearAvatar } from '@dicebear/core'
import glyphsDef from '@dicebear/styles/glyphs.json' with { type: 'json' }
import shapesDef from '@dicebear/styles/shapes.json' with { type: 'json' }

const STYLES = {
  glyphs: new Style(glyphsDef),
  shapes: new Style(shapesDef),
} as const

export function getDiceBearAvatarUrl(seed: string, style: 'glyphs' | 'shapes' = 'glyphs'): string {
  const safeSeed = (seed || 'BillZo').trim()
  return new DiceBearAvatar(STYLES[style], { seed: safeSeed }).toDataUri()
}

export function BrandAvatar({
  name = 'BillZo',
  logo,
  className,
  size = 40,
}: {
  name?: string
  logo?: string | null
  className?: string
  size?: number
}) {
  const [logoError, setLogoError] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const initial = ((name || 'B').trim()[0] || 'B').toUpperCase()

  if (logo && !logoError) {
    return (
      <img
        src={logo}
        alt={name || 'logo'}
        width={size}
        height={size}
        onError={() => setLogoError(true)}
        className={cn('rounded-full object-cover shrink-0 bg-muted/20', className)}
        style={{ width: size, height: size }}
      />
    )
  }

  if (!avatarError) {
    return (
      <img
        src={getDiceBearAvatarUrl(name || 'BillZo', 'glyphs')}
        alt={name || 'avatar'}
        width={size}
        height={size}
        onError={() => setAvatarError(true)}
        className={cn('rounded-full object-cover shrink-0 bg-muted/20', className)}
        style={{ width: size, height: size }}
      />
    )
  }

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
  style = 'glyphs',
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