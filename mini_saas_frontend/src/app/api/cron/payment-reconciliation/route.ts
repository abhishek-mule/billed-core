import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db/client'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

/**
 * Payment Reconciliation Automation
 * Automatically reconciles payments and updates customer credit profiles
 * 
 * This endpoint should be called by a cron job (e.g., every hour)
 * 
 * Features:
 * - Checks payment gateways for completed transactions
 * - Updates invoice status to PAID
 * - Auto-updates customer credit profiles
 * - Sends thank-you WhatsApp messages
 * - Maintains audit trail
 */

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron job call
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tenantId, dryRun = false } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })
    }

    let invoicesUpdated = 0
    let customersUpdated = 0
    let messagesSent = 0
    const errors: Array<{ invoice: string; error: string }> = []

    // Step 1: Check Razorpay for completed payments
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        const razorpayUpdates = await reconcileRazorpayPayments(tenantId, dryRun)
        invoicesUpdated += razorpayUpdates.invoicesUpdated
        customersUpdated += razorpayUpdates.customersUpdated
        messagesSent += razorpayUpdates.messagesSent
        errors.push(...razorpayUpdates.errors)
      } catch (error: any) {
        console.error('Razorpay reconciliation failed:', error)
        errors.push({
          invoice: 'Razorpay',
          error: error.message
        })
      }
    }

    // Step 2: Check for manual payments marked as received
    try {
      const manualUpdates = await reconcileManualPayments(tenantId, dryRun)
      invoicesUpdated += manualUpdates.invoicesUpdated
      customersUpdated += manualUpdates.customersUpdated
      messagesSent += manualUpdates.messagesSent
      errors.push(...manualUpdates.errors)
    } catch (error: any) {
      console.error('Manual payment reconciliation failed:', error)
      errors.push({
        invoice: 'Manual',
        error: error.message
      })
    }

    // Step 3: Update customer credit profiles
    if (!dryRun && customersUpdated > 0) {
      await updateCustomerCreditProfiles(tenantId)
    }

    return NextResponse.json({
      success: true,
      message: `Payment reconciliation completed`,
      invoicesUpdated,
      customersUpdated,
      messagesSent,
      errors: errors.length > 0 ? errors : undefined,
      dryRun
    })

  } catch (error: any) {
    console.error('[Payment Reconciliation] Error:', error)
    return NextResponse.json(
      { error: 'Failed to reconcile payments', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Reconcile Razorpay payments
 */
async function reconcileRazorpayPayments(tenantId: string, dryRun: boolean) {
  let invoicesUpdated = 0
  let customersUpdated = 0
  let messagesSent = 0
  const errors: Array<{ invoice: string; error: string }> = []

  try {
    // Find pending invoices with Razorpay payment IDs
    const pendingInvoices = await query<any>(
      `SELECT 
        i.id,
        i.invoice_number,
        i.customer_id,
        i.total,
        i.razorpay_payment_id,
        c.customer_name,
        c.phone,
        c.pending_amount,
        c.credit_limit
       FROM invoices i
       INNER JOIN customers c ON i.customer_id = c.id
       WHERE i.tenant_id = $1
         AND i.payment_mode IN ('UPI', 'CARD', 'BANK_TRANSFER')
         AND i.status NOT IN ('PAID', 'CANCELLED', 'VOIDED')
         AND i.razorpay_payment_id IS NOT NULL`,
      [tenantId]
    )

    for (const invoice of pendingInvoices) {
      try {
        // Check payment status with Razorpay
        const paymentStatus = await checkRazorpayPaymentStatus(invoice.razorpay_payment_id)

        if (paymentStatus === 'captured' || paymentStatus === 'authorized') {
          if (!dryRun) {
            // Update invoice status
            await query(
              `UPDATE invoices 
               SET status = 'PAID', 
                   paid_at = NOW(),
                   updated_at = NOW()
               WHERE id = $1`,
              [invoice.id]
            )

            // Update customer pending amount
            const newPendingAmount = Math.max(0, (parseFloat(invoice.pending_amount) || 0) - parseFloat(invoice.total))
            await query(
              `UPDATE customers 
               SET pending_amount = $1,
                   last_payment_date = NOW(),
                   updated_at = NOW()
               WHERE id = $2`,
              [newPendingAmount, invoice.customer_id]
            )

            // Send thank-you WhatsApp
            await sendThankYouMessage(invoice, newPendingAmount)

            invoicesUpdated++
            customersUpdated++
            messagesSent++
          } else {
            console.log(`[DRY RUN] Would mark invoice ${invoice.invoice_number} as PAID`)
            invoicesUpdated++
            customersUpdated++
          }
        }
      } catch (error: any) {
        console.error(`Failed to reconcile invoice ${invoice.invoice_number}:`, error)
        errors.push({
          invoice: invoice.invoice_number,
          error: error.message
        })
      }
    }
  } catch (error: any) {
    console.error('Razorpay reconciliation error:', error)
    throw error
  }

  return { invoicesUpdated, customersUpdated, messagesSent, errors }
}

/**
 * Reconcile manual payments
 */
async function reconcileManualPayments(tenantId: string, dryRun: boolean) {
  let invoicesUpdated = 0
  let customersUpdated = 0
  let messagesSent = 0
  const errors: Array<{ invoice: string; error: string }> = []

  try {
    // Find invoices with manual payments marked as received but not yet reconciled
    const pendingPayments = await query<any>(
      `SELECT 
        p.id as payment_id,
        p.invoice_id,
        p.amount,
        p.received_at,
        i.invoice_number,
        i.customer_id,
        i.total,
        c.customer_name,
        c.phone,
        c.pending_amount
       FROM payments p
       INNER JOIN invoices i ON p.invoice_id = i.id
       INNER JOIN customers c ON i.customer_id = c.id
       WHERE i.tenant_id = $1
         AND i.status NOT IN ('PAID', 'CANCELLED', 'VOIDED')
         AND p.status = 'RECEIVED'
         AND p.reconciled = false`,
      [tenantId]
    )

    for (const payment of pendingPayments) {
      try {
        if (!dryRun) {
          // Check if payment covers full invoice amount
          const invoiceTotal = parseFloat(payment.total)
          const paymentAmount = parseFloat(payment.amount)

          if (paymentAmount >= invoiceTotal) {
            // Full payment - mark invoice as PAID
            await query(
              `UPDATE invoices 
               SET status = 'PAID', 
                   paid_at = $1,
                   updated_at = NOW()
               WHERE id = $2`,
              [payment.received_at, payment.invoice_id]
            )
          } else {
            // Partial payment - update as PARTIAL
            await query(
              `UPDATE invoices 
               SET status = 'PARTIAL',
                   updated_at = NOW()
               WHERE id = $1`,
              [payment.invoice_id]
            )
          }

          // Update customer pending amount
          const newPendingAmount = Math.max(0, (parseFloat(payment.pending_amount) || 0) - paymentAmount)
          await query(
            `UPDATE customers 
             SET pending_amount = $1,
                 last_payment_date = NOW(),
                 updated_at = NOW()
             WHERE id = $2`,
            [newPendingAmount, payment.customer_id]
          )

          // Mark payment as reconciled
          await query(
            `UPDATE payments 
             SET reconciled = true,
                 reconciled_at = NOW()
             WHERE id = $1`,
            [payment.id]
          )

          // Send thank-you WhatsApp for full payments
          if (paymentAmount >= invoiceTotal) {
            await sendThankYouMessage(payment, newPendingAmount)
            messagesSent++
          }

          invoicesUpdated++
          customersUpdated++
        } else {
          console.log(`[DRY RUN] Would reconcile payment for invoice ${payment.invoice_number}`)
          invoicesUpdated++
          customersUpdated++
        }
      } catch (error: any) {
        console.error(`Failed to reconcile payment for invoice ${payment.invoice_number}:`, error)
        errors.push({
          invoice: payment.invoice_number,
          error: error.message
        })
      }
    }
  } catch (error: any) {
    console.error('Manual payment reconciliation error:', error)
    throw error
  }

  return { invoicesUpdated, customersUpdated, messagesSent, errors }
}

/**
 * Check Razorpay payment status
 */
async function checkRazorpayPaymentStatus(paymentId: string): Promise<string | null> {
  try {
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64')

    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error(`Razorpay API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data.status || null
  } catch (error) {
    console.error('Failed to check Razorpay payment status:', error)
    return null
  }
}

/**
 * Send thank-you WhatsApp message
 */
async function sendThankYouMessage(invoice: any, newPendingAmount: number) {
  try {
    if (!invoice.phone) return

    const config = {
      provider: (process.env.WHATSAPP_PROVIDER as 'gupshup' | 'twilio') || 'gupshup',
      apiKey: process.env.GUPSHUP_API_KEY || process.env.TWILIO_ACCOUNT_SID || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      fromPhone: process.env.TWILIO_FROM_NUMBER || '',
      templateName: 'payment_received',
    }

    const params = {
      name: invoice.customer_name.split(' ')[0],
      amount: formatINR(parseFloat(invoice.total)),
      newBalance: formatINR(newPendingAmount),
      invoiceNumber: invoice.invoice_number
    }

    await sendWhatsAppMessage(config, {
      to: formatPhoneNumber(invoice.phone),
      template: 'payment_received',
      params,
    })
  } catch (error) {
    console.error('Failed to send thank-you message:', error)
  }
}

/**
 * Update customer credit profiles
 */
async function updateCustomerCreditProfiles(tenantId: string) {
  // Recalculate credit scores based on payment history
  await query(
    `UPDATE customers c
     SET credit_score = LEAST(1.0, GREATEST(0.1,
       1.0 - (COALESCE(c.pending_amount, 0) / NULLIF(c.credit_limit, 1)) * 0.5
       - CASE 
         WHEN c.last_payment_date < NOW() - INTERVAL '30 days' THEN 0.3
         WHEN c.last_payment_date < NOW() - INTERVAL '14 days' THEN 0.1
         ELSE 0
        END
     )),
     days_overdue = EXTRACT(DAY FROM (NOW() - c.last_payment_date))
     WHERE c.tenant_id = $1
       AND c.last_payment_date IS NOT NULL`,
    [tenantId]
  )
}

/**
 * Format phone number for WhatsApp
 */
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `91${cleaned}`
  }
  return cleaned
}

/**
 * Format amount in Indian Rupees
 */
function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}