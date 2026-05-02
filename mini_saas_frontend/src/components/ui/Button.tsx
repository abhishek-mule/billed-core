import { ButtonHTMLAttributes, forwardRef } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  fullWidth?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-glow hover:shadow-[0_0_20px_rgba(30,58,138,0.3)]',
  secondary: 'bg-secondary text-secondary-foreground border-border/50 hover:bg-muted/80',
  outline: 'bg-transparent border-2 border-border text-foreground hover:bg-muted/50 hover:border-primary/50',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:bg-destructive/90',
  success: 'bg-success text-success-foreground shadow-lg shadow-success/20 hover:bg-success/90',
  warning: 'bg-warning text-warning-foreground shadow-lg shadow-warning/20 hover:bg-warning/90',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[10px]',
  md: 'px-5 py-2.5 text-xs',
  lg: 'px-8 py-3.5 text-sm',
  xl: 'px-10 py-4.5 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', loading, icon, children, disabled, fullWidth, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.96 }}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2.5 rounded-2xl font-black uppercase tracking-widest transition-all duration-200 border border-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale active:scale-95",
          fullWidth && "w-full",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        <span className="leading-none">{children}</span>
      </motion.button>
    )
  }
)

Button.displayName = 'Button'