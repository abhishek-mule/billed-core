'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface MerchantCredentials {
  tenantId: string
  siteName: string
  apiKey: string
  apiSecret: string
  companyName: string
  plan?: string
}

interface AuthContextType {
  merchant: MerchantCredentials | null
  isLoading: boolean
  login: (credentials: MerchantCredentials) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const STORAGE_KEY = 'billzo_merchant'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<MerchantCredentials | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setMerchant(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setIsLoading(false)
  }, [])

  const login = (credentials: MerchantCredentials) => {
    setMerchant(credentials)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
  }

  const logout = () => {
    setMerchant(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider value={{ merchant, isLoading, login, logout, isAuthenticated: !!merchant }}>
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

export function generateAuthToken(credentials: MerchantCredentials): string {
  const payload = {
    tenantId: credentials.tenantId,
    siteName: credentials.siteName,
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret,
    companyName: credentials.companyName,
  }
  return `Bearer ${Buffer.from(JSON.stringify(payload)).toString('base64')}`
}