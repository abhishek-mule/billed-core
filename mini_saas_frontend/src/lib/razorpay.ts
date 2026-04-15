export const loadRazorpay = () => {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if ((window as any).Razorpay) return resolve(true)
    
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXX'

export const PLANS_PRICES: Record<string, number> = {
  free: 0,
  starter: 49900,
  pro: 99900,
}

export const PLANS_INR: Record<string, string> = {
  free: '₹0',
  starter: '₹499',
  pro: '₹999',
}

export interface RazorpayOrderResponse {
  id: string
  amount: number
  currency: string
  status: string
}
