import { supabaseAdmin } from './supabase-admin'

export const MATCHING_ALGORITHM_VERSION = 1

export type MatchType = 'payment_link' | 'exact' | 'fuzzy'

export interface MatchResult {
  invoiceId: string
  matchType: MatchType
  confidence: number
  invoice: any
  reasons: string[]
}

export interface PaymentSignal {
  amount: number
  currency: string
  phone: string | null
  upiReference: string | null
  customerName: string | null
  provider: string
  providerPaymentId: string
  paymentLinkId: string | null
  timestamp: string
  rawPayload: Record<string, unknown>
}

export async function matchPaymentToInvoice(
  signal: PaymentSignal,
  tenantId: string,
): Promise<MatchResult | null> {
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('created_at', { ascending: false })

  if (error || !invoices || invoices.length === 0) {
    return null
  }

  const scored = invoices
    .map((invoice) => scoreInvoice(invoice, signal))
    .filter((result) => result.confidence > 0.5)
    .sort((a, b) => b.confidence - a.confidence)

  if (scored.length > 0 && scored[0].confidence >= 0.7) {
    return scored[0]
  }

  return null
}

function scoreInvoice(invoice: any, signal: PaymentSignal): MatchResult {
  let score = 0
  let matchType: MatchType = 'fuzzy'
  const reasons: string[] = []

  const invoiceTotal = invoice.total || invoice.paid_amount || 0
  const amountDiff = Math.abs(invoiceTotal - signal.amount)
  const amountThreshold = Math.max(invoiceTotal * 0.05, 10)

  if (amountDiff === 0) {
    score += 0.5
    reasons.push('exact_amount')
  } else if (amountDiff <= amountThreshold) {
    score += 0.3
    reasons.push('close_amount')
  }

  if (signal.phone && invoice.customer_phone) {
    const normalizedSignalPhone = normalizePhone(signal.phone)
    const normalizedInvoicePhone = normalizePhone(invoice.customer_phone)

    if (normalizedSignalPhone === normalizedInvoicePhone) {
      score += 0.3
      reasons.push('phone_match')
    } else if (normalizedSignalPhone.endsWith(normalizedInvoicePhone.slice(-10))) {
      score += 0.2
      reasons.push('phone_partial_match')
    }
  }

  if (signal.customerName && invoice.customer_name) {
    const similarity = calculateNameSimilarity(signal.customerName, invoice.customer_name)
    if (similarity > 0.8) {
      score += 0.15
      reasons.push('name_match')
    } else if (similarity > 0.6) {
      score += 0.05
      reasons.push('name_partial_match')
    }
  }

  const invoiceAge = Date.now() - new Date(invoice.created_at).getTime()
  const invoiceAgeDays = invoiceAge / (1000 * 60 * 60 * 24)
  if (invoiceAgeDays < 7) {
    score += 0.05
    reasons.push('recent_invoice')
  } else if (invoiceAgeDays < 30) {
    score += 0.02
  }

  if (score >= 0.8) {
    matchType = 'exact'
  } else if (score >= 0.7) {
    matchType = 'fuzzy'
  }

  return {
    invoiceId: invoice.id,
    matchType,
    confidence: score,
    invoice,
    reasons,
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) {
    return digits.slice(2)
  }
  if (digits.startsWith('+91') && digits.length === 13) {
    return digits.slice(3)
  }
  return digits
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const tokens1 = tokenizeName(name1)
  const tokens2 = tokenizeName(name2)
  if (tokens1.length === 0 || tokens2.length === 0) return 0

  let matches = 0
  for (const token of tokens1) {
    if (tokens2.some((t) => t === token || t.startsWith(token) || token.startsWith(t))) {
      matches++
    }
  }
  return matches / Math.max(tokens1.length, tokens2.length)
}

function tokenizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}
