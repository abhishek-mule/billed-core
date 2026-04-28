function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

interface LogoProps {
  showText?: boolean
  className?: string
  variant?: 'full' | 'mark' | 'text'
}

const ROYAL_BLUE = '#4F46E5'
const EMERALD_GREEN = '#10B981'

export function Logo({ showText = true, className, variant = 'full' }: LogoProps) {
  if (variant === 'mark') {
    return <LogoMark className={className} />
  }

  if (variant === 'text') {
    return <LogoWordmark className={className} />
  }

  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <LogoMark />
      {showText && <LogoWordmark />}
    </div>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
        <defs>
          <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={ROYAL_BLUE} />
            <stop offset="100%" stopColor="#3730A3" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#blueGrad)" />
        <path d="M26 8L14 26H22L18 40L34 18H24L28 8H26Z" fill="white" />
      </svg>
      <div className="absolute -bottom-0.5 -right-0.5">
        <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none">
          <circle cx="10" cy="10" r="10" fill={EMERALD_GREEN} />
          <path d="M6 10L9 13L14 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
    </div>
  )
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cx('font-bold tracking-tight', className)}>
      <span className="text-slate-900">Bill</span>
      <span className="text-indigo-600">Zo</span>
    </span>
  )
}

export function LogoIcon({ className, size = 48 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" width={size} height={size}>
      <defs>
        <linearGradient id="blueGradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ROYAL_BLUE} />
          <stop offset="100%" stopColor="#3730A3" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#blueGradIcon)" />
      <path d="M26 8L14 26H22L18 40L34 18H24L28 8H26Z" fill="white" />
      <circle cx="36" cy="36" r="12" fill={EMERALD_GREEN} />
      <path d="M32 36L35 39L40 33" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function MiniLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill={ROYAL_BLUE} />
      <path d="M13 4L7 13H11L9 20L17 9H11L13 4H13Z" fill="white" />
      <circle cx="18" cy="18" r="6" fill={EMERALD_GREEN} />
      <path d="M16 18L17.5 19.5L20 16.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}