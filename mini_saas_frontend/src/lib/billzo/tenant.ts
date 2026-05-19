'use client'

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

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    return JSON.parse(atob(parts[0]))
  } catch {
    return null
  }
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEYS.tenantId) || getCookie('bz_tenant')
}

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(SESSION_KEYS.userId)
  if (stored) return stored

  const token = getCookie('bz_access')
  if (token) {
    const payload = decodeJwtPayload(token)
    return payload?.userId || null
  }
  return null
}

export function clearSession() {
  if (typeof window === 'undefined') return
  Object.values(SESSION_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
  localStorage.removeItem('isPaid')
}

export function syncSessionFromCookies(): Session | null {
  if (typeof window === 'undefined') return null

  const tenantId = getCookie('bz_tenant')
  const token = getCookie('bz_access')
  const payload = token ? decodeJwtPayload(token) : null

  if (!tenantId || !payload?.userId) return null

  const session: Session = {
    tenantId,
    userId: payload.userId,
    businessName: getCookie('bz_tenant_name') || 'My Shop',
    phone: localStorage.getItem(SESSION_KEYS.phone) || payload.phone || '',
  }

  localStorage.setItem(SESSION_KEYS.tenantId, tenantId)
  localStorage.setItem(SESSION_KEYS.userId, payload.userId)
  localStorage.setItem(SESSION_KEYS.businessName, session.businessName)
  if (payload.phone) localStorage.setItem(SESSION_KEYS.phone, payload.phone)

  return session
}

export function getActiveSession(): Session | null {
  if (typeof window === 'undefined') return null

  const tenantId = getTenantId()
  const userId = getUserId()
  const businessName = localStorage.getItem(SESSION_KEYS.businessName)

  if (!tenantId || !userId) {
    return syncSessionFromCookies()
  }

  return {
    tenantId,
    userId,
    businessName: businessName || 'My Shop',
    phone: localStorage.getItem(SESSION_KEYS.phone) || '',
  }
}

export function getMockSession() {
  return null
}