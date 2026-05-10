export interface Session {
  tenantId: string
  userId: string
  businessName: string
  phone: string
}

const SESSION_KEYS = {
  tenantId: 'tenantId',
  userId: 'userId',
  businessName: 'tenantName',
  phone: 'phone',
  refreshToken: 'refreshToken',
  accessToken: 'accessToken',
  tokenExpiry: 'tokenExpiry',
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null

  const tenantId = localStorage.getItem(SESSION_KEYS.tenantId)
  const userId = localStorage.getItem(SESSION_KEYS.userId)
  const businessName = localStorage.getItem(SESSION_KEYS.businessName)

  if (!tenantId || !userId) {
    return null
  }

  return {
    tenantId,
    userId,
    businessName: businessName || 'My Shop',
    phone: localStorage.getItem(SESSION_KEYS.phone) || '',
  }
}

export function getTenantId(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEYS.tenantId) : null
}

export function getUserId(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEYS.userId) : null
}

export function isAuthenticated(): boolean {
  const userId = getUserId()
  const tenantId = getTenantId()
  return !!(userId && tenantId)
}

export function isPaidTenant(): boolean {
  return localStorage.getItem('isPaid') === 'true'
}

export function isTokenExpired(): boolean {
  const expiry = localStorage.getItem(SESSION_KEYS.tokenExpiry)
  if (!expiry) return true
  return Date.now() > parseInt(expiry, 10)
}

export function shouldRefreshToken(): boolean {
  const expiry = localStorage.getItem(SESSION_KEYS.tokenExpiry)
  if (!expiry) return false

  const expiryTime = parseInt(expiry, 10)
  const fiveMinutes = 5 * 60 * 1000
  return Date.now() > expiryTime - fiveMinutes
}

export function storeTokens(accessToken: string, refreshToken: string, expiresIn = 900) {
  const expiry = Date.now() + expiresIn * 1000
  localStorage.setItem(SESSION_KEYS.accessToken, accessToken)
  localStorage.setItem(SESSION_KEYS.refreshToken, refreshToken)
  localStorage.setItem(SESSION_KEYS.tokenExpiry, expiry.toString())
}

export function getAccessToken(): string | null {
  if (isTokenExpired()) return null
  return localStorage.getItem(SESSION_KEYS.accessToken)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(SESSION_KEYS.refreshToken)
}

export function clearSession() {
  Object.values(SESSION_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
}

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      clearSession()
      return false
    }

    const data = await response.json()
    if (data.accessToken) {
      storeTokens(data.accessToken, data.refreshToken || refreshToken)
      return true
    }

    return false
  } catch {
    clearSession()
    return false
  }
}

export const MOCK_TENANT_ID = 'tenant_billzo_demo_india'
export const MOCK_USER_ID = 'merchant_demo_owner'

export function getMockSession() {
  return {
    tenantId: MOCK_TENANT_ID,
    userId: MOCK_USER_ID,
    businessName: 'Billzo Demo Store',
    phone: '+91 98765 43210',
  }
}

export function getActiveSession(): Session {
  if (typeof window === 'undefined') {
    return getMockSession()
  }

  const realSession = getSession()
  if (realSession) {
    return realSession
  }

  return getMockSession()
}