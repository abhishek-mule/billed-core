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

export function getTenantId(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEYS.tenantId) : null
}

export function getUserId(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEYS.userId) : null
}

export function clearSession() {
  if (typeof window === 'undefined') return
  Object.values(SESSION_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
  localStorage.removeItem('isPaid')
}

const MOCK_TENANT_ID = 'tenant_billzo_demo_india'
const MOCK_USER_ID = 'merchant_demo_owner'

export function getActiveSession(): Session {
  if (typeof window === 'undefined') {
    return getMockSession()
  }

  const tenantId = localStorage.getItem(SESSION_KEYS.tenantId)
  const userId = localStorage.getItem(SESSION_KEYS.userId)
  const businessName = localStorage.getItem(SESSION_KEYS.businessName)

  if (tenantId && userId) {
    return {
      tenantId,
      userId,
      businessName: businessName || 'My Shop',
      phone: localStorage.getItem(SESSION_KEYS.phone) || '',
    }
  }

  return getMockSession()
}

export function getMockSession() {
  return {
    tenantId: MOCK_TENANT_ID,
    userId: MOCK_USER_ID,
    businessName: 'Billzo Demo Store',
    phone: '+91 98765 43210',
  }
}