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
