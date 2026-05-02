'use client'

import { Toaster as Sonner } from 'sonner'

interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <Sonner
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '2px solid hsl(var(--border))',
            borderRadius: '1.5rem',
            padding: '1rem',
            fontFamily: 'inherit',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: '10px',
            boxShadow: 'var(--shadow-lg)',
          },
          className: 'hyper-toast',
        }}
      />
    </>
  )
}