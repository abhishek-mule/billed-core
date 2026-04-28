function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

const sizeClasses: Record<string, string> = {
  sm: 'w-8 h-8 text-lg',
  md: 'w-10 h-10 text-xl',
  lg: 'w-12 h-12 text-2xl',
  xl: 'w-14 h-14 text-3xl',
}

const svgSizes: Record<string, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
  xl: 'w-8 h-8',
}

export function Logo({ size = 'md', showText = false, className }: LogoProps) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <div
        className={cx(
          'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C81] via-[#1A5A9C] to-[#0D3E66] shadow-lg shadow-[#0F4C81]/25',
          'before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-white/10 before:to-transparent',
          'after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-white/20',
          sizeClasses[size]
        )}
      >
        <svg
          viewBox="0 0 32 32"
          className={cx('text-white drop-shadow-lg', svgSizes[size])}
          fill="none"
        >
          <path
            d="M8 8h6c4.4 0 8 3.6 8 8s-3.6 8-8 8H8V8z"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <path
            d="M16 8h8v6c0 4.4-3.6 8-8 8v-6c2.2 0 4-1.8 4-4v-4h-4z"
            fill="currentColor"
          />
          <path
            d="M8 22c0 0 2.5-2 6-2s6 2 6 2"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {showText && (
        <span className="text-2xl font-bold tracking-tight text-[#0F4C81]">
          BillZo
        </span>
      )}
    </div>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C81] via-[#1A5A9C] to-[#0D3E66] shadow-lg shadow-[#0F4C81]/25',
        'before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-white/10 before:to-transparent',
        'after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-white/20',
        'w-10 h-10',
        className
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className="w-5 h-5 text-white drop-shadow-lg"
        fill="none"
      >
        <path
          d="M8 8h6c4.4 0 8 3.6 8 8s-3.6 8-8 8H8V8z"
          fill="currentColor"
          fillOpacity="0.2"
        />
        <path
          d="M16 8h8v6c0 4.4-3.6 8-8 8v-6c2.2 0 4-1.8 4-4v-4h-4z"
          fill="currentColor"
        />
        <path
          d="M8 22c0 0 2.5-2 6-2s6 2 6 2"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

export function LogoIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      width={size}
      height={size}
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0F4C81" />
          <stop offset="50%" stopColor="#1A5A9C" />
          <stop offset="100%" stopColor="#0D3E66" />
        </linearGradient>
      </defs>
      <path
        d="M8 8h6c4.4 0 8 3.6 8 8s-3.6 8-8 8H8V8z"
        fill="url(#logoGrad)"
        fillOpacity="0.2"
      />
      <path
        d="M16 8h8v6c0 4.4-3.6 8-8 8v-6c2.2 0 4-1.8 4-4v-4h-4z"
        fill="url(#logoGrad)"
      />
      <path
        d="M8 22c0 0 2.5-2 6-2s6 2 6 2"
        stroke="url(#logoGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function MiniLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
    >
      <path
        d="M4 4h5c3.3 0 6 2.7 6 6s-2.7 6-6 6H4V4z"
        fill="#0F4C81"
        fillOpacity="0.2"
      />
      <path
        d="M13 4h7v5c0 3.3-2.7 6-6 6v-5c1.65 0 3-1.35 3-3v-3H13z"
        fill="#0F4C81"
      />
      <path
        d="M4 17c0 0 1.875-1.5 4.5-1.5s4.5 1.5 4.5 1.5"
        stroke="#0F4C81"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}