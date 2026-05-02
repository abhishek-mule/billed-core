/**
 * UPI QR Generator
 * Generates UPI links and QR codes for instant settlement.
 */

interface UPIData {
  vpa: string          // Virtual Payment Address (e.g. sharma@okicici)
  name: string         // Merchant Name
  amount?: string      // Amount in INR
  transactionId?: string
  note?: string
}

export function generateUPILink({ vpa, name, amount, transactionId, note }: UPIData): string {
  // Standard UPI deep link format:
  // upi://pay?pa=address@bank&pn=MerchantName&am=100.00&tr=TXNID&tn=Note
  
  const url = new URL('upi://pay')
  url.searchParams.append('pa', vpa)
  url.searchParams.append('pn', name)
  if (amount) url.searchParams.append('am', amount)
  if (transactionId) url.searchParams.append('tr', transactionId)
  if (note) url.searchParams.append('tn', note)
  url.searchParams.append('cu', 'INR')

  return url.toString()
}

/**
 * Returns a Google Charts QR Code URL for the UPI link.
 * Note: In production, use a local library like qrcode.react for better offline support.
 */
export function generateUPIQRCode(upiLink: string): string {
  const encodedLink = encodeURIComponent(upiLink)
  return `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodedLink}&choe=UTF-8`
}
