'use client'

import { useState, useEffect, createContext, useContext, ReactNode } from 'react'

export interface SessionInfo {
  tenantId: string
  userId: string
  companyName: string
  phone: string
  email: string
  role: string
  plan: string
  erpMode: 'live' | 'mock'
}

interface SessionContextType {
  session: SessionInfo | null
  loading: boolean
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextType | null>(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session')
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      } else {
        setSession(null)
      }
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setSession(null)
      window.location.href = '/start'
    }
  }

  useEffect(() => {
    fetchSession()
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading, refreshSession: fetchSession, logout }}>
      {children}
    </SessionContext.Provider>
  )
}