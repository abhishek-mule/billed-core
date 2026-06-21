import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes } from 'react'

const variants = {
  default:
    'border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring',
  error:
    'border-destructive text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive',
}

const sizes = {
  sm: 'h-9 text-xs rounded-lg px-3 gap-2',
  md: 'h-11 text-sm rounded-xl px-4 gap-2.5',
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  label?: string
  error?: string
  icon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = 'default', size = 'md', label, error, icon, rightIcon, id, type = 'text', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            className={cn(
              'flex w-full border bg-background font-medium text-foreground transition-all',
              'placeholder:font-normal',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
              icon && 'pl-10',
              rightIcon && 'pr-10',
              error && variants.error,
              !error && variants.default,
              sizes[size],
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {rightIcon && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
