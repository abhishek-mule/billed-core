/**
 * GSTIN Lookup Utility
 * In production, this would integrate with a provider like Zoop, Karza, or Razorpay Identity.
 */

export interface BusinessDetails {
  name: string
  address: string
  gstin: string
  state: string
  pincode: string
  registrationType: 'Regular' | 'Composition'
}

export async function lookupGSTIN(gstin: string): Promise<BusinessDetails | null> {
  // 1. Validate GSTIN format
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i
  if (!gstinRegex.test(gstin)) {
    throw new Error('INVALID_GSTIN_FORMAT')
  }

  // 2. Mock API Call
  // In reality: await fetch(`https://api.provider.com/v1/gstin/${gstin}`)
  await new Promise(resolve => setTimeout(resolve, 1500))

  // 3. Return Mock Data for Demo
  return {
    name: 'Sharma Electronics & Solutions',
    address: '123, MG Road, Indiranagar, Bengaluru',
    gstin: gstin.toUpperCase(),
    state: 'Karnataka (29)',
    pincode: '560038',
    registrationType: 'Regular'
  }
}
