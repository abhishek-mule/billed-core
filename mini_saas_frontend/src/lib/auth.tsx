'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface SessionUser {
  id: string
  tenantId: string
  name: string
  phone: string
  role: string
}

export interface SessionTenant {
  id: string
  companyName: string
  plan?: string
}

interface AuthContextType {
  user: SessionUser | null
  tenant: SessionTenant | null
  isLoading: boolean
  login: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [tenant, setTenant] = useState<SessionTenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkSession()
    const interval = setInterval(refreshSession, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function refreshSession() {
    try {
      await fetch('/api/auth/refresh', { method: 'POST' })
    } catch (e) {
      console.error('Session refresh failed:', e)
    }
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session')
      if (res.ok) {
        const data = await res.json()
        if (data.session) {
          setUser({
            id: data.session.userId,
            tenantId: data.session.tenantId,
            name: data.session.companyName,
            phone: '',
            role: data.session.role,
          })
          setTenant({
            id: data.session.tenantId,
            companyName: data.session.companyName,
            plan: data.session.plan,
          })
        }
      }
    } catch (e) {
      console.error('Session check failed:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (phone: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' }
      }

      setUser({
        id: data.user.id,
        tenantId: data.tenant.id,
        name: data.user.name,
        phone: data.user.phone,
        role: data.user.role,
      })
      setTenant({
        id: data.tenant.id,
        companyName: data.tenant.companyName,
      })

      return { success: true }
    } catch (e) {
      return { success: false, error: 'Network error' }
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      setUser(null)
      setTenant(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function useSession() {
  const { user, tenant, isLoading, isAuthenticated } = useAuth()
  return { user, tenant, isLoading, isAuthenticated }
}