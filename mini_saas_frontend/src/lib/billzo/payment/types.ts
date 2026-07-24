export interface PaymentConfig {
  method: 'upi' | 'bank' | 'cash'
  upiId?: string
  bankAccount?: string
  bankIfsc?: string
  bankName?: string
  accountHolderName?: string
  upiVerifiedByMerchant?: boolean
}

export interface PaymentPresentation {
  title: string
  subtitle: string | null
  button: { label: string; url: string | null } | null
  paymentMethod: 'upi' | 'bank' | 'cash'
  metadata: Record<string, string>
}

export interface PaymentInvoice {
  total: number
  invoiceNumber?: string
}
