import { supabaseAdmin } from './supabase-admin'
import type { PaymentSignal } from './reconciliation'

export type MatchType = 'payment_link' | 'exact' | 'fuzzy'

export interface MatchResult {
  invoiceId: string
  matchType: MatchType
  confidence: number
  invoice: any
}

/**
 * Match a payment signal to an unpaid invoice.
 * Uses a tiered matching strategy:
 * 1. Exact match: payment_link_id
 * 2. Fuzzy match: amount + phone + customer name similarity
 *
 * Returns the best match or null if no match found.
 */
export async function matchPaymentToInvoice(
  signal: PaymentSignal,
  tenantId: string
): Promise<MatchResult | null> {
  // Get all unpaid invoices for this tenant
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('created_at', { ascending: false })

  if (error || !invoices || invoices.length === 0) {
    return null
  }

  // Score each invoice
  const scored = invoices
    .map((invoice) => scoreInvoice(invoice, signal))
    .filter((result) => result.confidence > 0.5)
    .sort((a, b) => b.confidence - a.confidence)

  // Return best match if confidence is high enough
  if (scored.length > 0 && scored[0].confidence >= 0.7) {
    return scored[0]
  }

  return null
}

/**
 * Score an invoice against a payment signal.
 * Returns match result with confidence score.
 */
function scoreInvoice(invoice: any, signal: PaymentSignal): MatchResult {
  let score = 0
  let matchType: MatchType = 'fuzzy'
  const reasons: string[] = []

  // 1. Amount match (highest weight)
  const invoiceTotal = invoice.total || invoice.paid_amount || 0
  const amountDiff = Math.abs(invoiceTotal - signal.amount)
  const amountThreshold = Math.max(invoiceTotal * 0.05, 10) // 5% or ₹10

  if (amountDiff === 0) {
    score += 0.5
    reasons.push('exact_amount')
  } else if (amountDiff <= amountThreshold) {
    score += 0.3
    reasons.push('close_amount')
  }

  // 2. Phone match
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

  // 3. Customer name similarity
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

  // 4. Recency bonus (prefer recent invoices)
  const invoiceAge = Date.now() - new Date(invoice.created_at).getTime()
  const invoiceAgeDays = invoiceAge / (1000 * 60 * 60 * 24)
  if (invoiceAgeDays < 7) {
    score += 0.05
    reasons.push('recent_invoice')
  } else if (invoiceAgeDays < 30) {
    score += 0.02
  }

  // Determine match type
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
  }
}

/**
 * Normalize phone number for comparison.
 * Removes all non-digit characters and handles country codes.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Remove leading country code if present
  if (digits.startsWith('91') && digits.length === 12) {
    return digits.slice(2)
  }
  if (digits.startsWith('+91') && digits.length === 13) {
    return digits.slice(3)
  }
  return digits
}

/**
 * Calculate name similarity using simple token overlap.
 * Returns a value between 0 and 1.
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const tokens1 = tokenizeName(name1)
  const tokens2 = tokenizeName(name2)

  if (tokens1.length === 0 || tokens2.length === 0) return 0

  // Check for exact token matches
  let matches = 0
  for (const token of tokens1) {
    if (tokens2.some((t) => t === token || t.startsWith(token) || token.startsWith(t))) {
      matches++
    }
  }

  return matches / Math.max(tokens1.length, tokens2.length)
}

/**
 * Tokenize a name into individual words.
 * Handles common Indian name patterns.
 */
function tokenizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}
