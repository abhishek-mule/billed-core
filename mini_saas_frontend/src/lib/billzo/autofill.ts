import { TenantCreateInput } from './auth-utils'

interface GSTInfo {
  legalName: string
  tradeName: string
  gstin: string
  natureOfBusiness: string
  address: {
    buildingName: string
    street: string
    city: string
    district: string
    state: string
    pincode: string
  }
}

interface UPIInfo {
  vpa: string
  phone?: string
  name?: string
}

export async function lookupGSTIN(gstin: string): Promise<GSTInfo | null> {
  const cleanGSTIN = gstin.toUpperCase().replace(/[^A-Z0-9]/g, '')

  if (cleanGSTIN.length !== 15) {
    return null
  }

  try {
    const response = await fetch(
      `https://api.gstin.gov.in/api/v1/entity/${cleanGSTIN}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (data.status !== 'active') {
      return null
    }

    return {
      legalName: data.pradr?.addr?.nm?.replace(/\s+/g, ' ').trim() || data.lgnm || '',
      tradeName: data.tradeNam || data.lgnm || '',
      gstin: cleanGSTIN,
      natureOfBusiness: data.natureOfBusiness || '',
      address: {
        buildingName: data.pradr?.addr?.bno || '',
        street: data.pradr?.addr?.street || '',
        city: data.pradr?.addr?.city || '',
        district: data.pradr?.addr?.dst || '',
        state: data.pradr?.addr?.stcd || '',
        pincode: data.pradr?.addr?.pncd || '',
      },
    }
  } catch {
    return null
  }
}

export function parseVPA(vpa: string): UPIInfo | null {
  const cleanVPA = vpa.toLowerCase().trim()

  const upiRegex = /^[\w.-]+@[\w.-]+$/
  if (!upiRegex.test(cleanVPA)) {
    return null
  }

  const [handle, domain] = cleanVPA.split('@')
  const phoneRegex = /^[6-9]\d{9}$/
  const namePart = handle.length > 4 && !phoneRegex.test(handle) ? handle : undefined

  return {
    vpa: cleanVPA,
    name: namePart,
  } as UPIInfo
}

export async function inferShopNameFromUPI(
  vpa: string
): Promise<{ shopName?: string; phone?: string }> {
  const vpaInfo = parseVPA(vpa)
  if (!vpaInfo) return {}

  if (vpaInfo.name) {
    const name = vpaInfo.name
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    return { shopName: name }
  }

  return {}
}

export async function autofillFromInput(
  input: TenantCreateInput
): Promise<{
  shopName: string
  phone: string
  upiId?: string
  gstin?: string
  inferredFrom?: 'gstin' | 'upi' | 'manual'
}> {
  let shopName = input.shopName.trim()
  let phone = input.phone
  let upiId = input.upiId?.trim()
  let gstin = input.gstin?.trim().toUpperCase()
  let inferredFrom: 'gstin' | 'upi' | 'manual' = 'manual'

  if (gstin && gstin.length === 15) {
    const gstInfo = await lookupGSTIN(gstin)
    if (gstInfo) {
      shopName = gstInfo.tradeName || gstInfo.legalName || shopName
      inferredFrom = 'gstin'
    }
  }

  if (!shopName && upiId) {
    const upiResult = await inferShopNameFromUPI(upiId)
    if (upiResult.shopName) {
      shopName = upiResult.shopName
      inferredFrom = 'upi'
    }
  }

  if (!phone && upiId) {
    const vpaInfo = parseVPA(upiId)
    if (vpaInfo?.phone) {
      phone = vpaInfo.phone
    }
  }

  return {
    shopName: shopName || 'My Shop',
    phone,
    upiId,
    gstin,
    inferredFrom,
  }
}

export function validateGSTIN(gstin: string): { valid: boolean; error?: string } {
  const clean = gstin.toUpperCase().replace(/[^A-Z0-9]/g, '')

  if (clean.length !== 15) {
    return { valid: false, error: 'GSTIN must be 15 characters' }
  }

  const stateCode = parseInt(clean.slice(0, 2), 10)
  if (stateCode < 1 || stateCode > 37) {
    return { valid: false, error: 'Invalid GSTIN state code' }
  }

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/
  if (!panRegex.test(clean.slice(0, 10))) {
    return { valid: false, error: 'Invalid PAN format in GSTIN' }
  }

  return { valid: true }
}

export function validateUPI(vpa: string): { valid: boolean; error?: string } {
  const clean = vpa.toLowerCase().trim()

  if (!clean) {
    return { valid: false, error: 'UPI ID is required' }
  }

  const upiRegex = /^[\w.-]+@[\w.-]+$/
  if (!upiRegex.test(clean)) {
    return { valid: false, error: 'Invalid UPI ID format' }
  }

  const [, domain] = clean.split('@')
  const validDomains = ['upi', 'ybl', 'okicici', 'okhdfcbank', 'okaxis', 'paytm', 'phonepe', 'gpay']
  const isKnownProvider = validDomains.some((d) => domain.includes(d))

  if (!isKnownProvider) {
    return { valid: false, error: 'Please enter a valid UPI ID' }
  }

  return { valid: true }
}
