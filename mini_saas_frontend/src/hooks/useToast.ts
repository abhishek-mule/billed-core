'use client'

import { toast as sonnerToast } from 'sonner'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastOptions {
  description?: string
  duration?: number
}

function parseError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Something went wrong'
}

export function toast() {
  return {
    success: (message: string, opts?: ToastOptions) => {
      sonnerToast.success(message, {
        description: opts?.description,
        duration: opts?.duration || 3000,
      })
    },
    error: (message: string, opts?: ToastOptions) => {
      sonnerToast.error(message, {
        description: opts?.description,
        duration: opts?.duration || 5000,
      })
    },
    info: (message: string, opts?: ToastOptions) => {
      sonnerToast.info(message, {
        description: opts?.description,
        duration: opts?.duration || 3000,
      })
    },
    warning: (message: string, opts?: ToastOptions) => {
      sonnerToast.warning(message, {
        description: opts?.description,
        duration: opts?.duration || 4000,
      })
    },
    dismiss: () => sonnerToast.dismiss(),
  }
}

export const toastError = (error: unknown, fallbackMsg = 'Error') => {
  const message = parseError(error)
  toast().error(fallbackMsg, { description: message })
}