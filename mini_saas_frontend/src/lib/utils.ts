import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatOverdueDays(days: number): string {
  if (days <= 0) return 'Due today'
  if (days === 1) return '1 day overdue'
  if (days > 30) return `${days} days overdue 🔴`
  return `${days} days overdue`
}
