import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db/client'
import { sendWhatsAppMessage, WHATSAPP_TEMPLATES } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

/**
 * Automated WhatsApp Payment Reminders
 * Runs daily to send payment reminders to customers with overdue invoices
 * 
 * This endpoint should be called by a cron job (e.g., daily at 6 PM IST)
 * 
 * Features:
 * - Groups invoices by customer to avoid spam
 * - Contextual messaging based on overdue days
 * - One-tap UPI payment links
 * - Respects rate limits and sending schedules
 */

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron job call (you should add authentication)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tenantId, dryRun = false } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })
    }

    // Find customers with pending credit invoices overdue by 7+ days
    const overdueInvoices = await query<any>(
      `SELECT 
        i.id as invoice_id,
        i.invoice_number,
        i.customer_id,
        i.total,
        i.created_at,
        c.customer_name,
        c.phone,
        c.gstin,
        EXTRACT(DAY FROM (NOW() - i.created_at)) as days_overdue
       FROM invoices i
       INNER JOIN customers c ON i.customer_id = c.id
       WHERE i.tenant_id = $1
         AND i.payment_mode = 'CREDIT'
         AND i.status NOT IN ('PAID', 'CANCELLED', 'VOIDED')
         AND i.created_at < NOW() - INTERVAL '7 days'
       ORDER BY i.created_at ASC`,
      [tenantId]
    )

    if (overdueInvoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No overdue invoices found',
        remindersSent: 0,
        customersContacted: 0
      })
    }

    // Group invoices by customer to send one reminder per customer
    const customerGroups = new Map<string, any[]>()
    
    for (const invoice of overdueInvoices) {
      if (!customerGroups.has(invoice.customer_id)) {
        customerGroups.set(invoice.customer_id, [])
      }
      customerGroups.get(invoice.customer_id)!.push(invoice)
    }

    let remindersSent = 0
    let customersContacted = 0
    const errors: Array<{ customer: string; error: string }> = []

    // Process each customer
    for (const [customerId, invoices] of customerGroups.entries()) {
      const customer = invoices[0]
      const totalDue = invoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.total), 0)
      const daysOverdue = Math.floor(customer.days_overdue)
      const invoiceCount = invoices.length

      // Determine reminder type based on overdue days
      let reminderType = 'payment_reminder'
      let urgency = 'normal'

      if (daysOverdue > 45) {
        reminderType = 'payment_urgent'
        urgency = 'critical'
      } else if (daysOverdue > 30) {
        reminderType = 'payment_overdue'
        urgency = 'high'
      } else if (daysOverdue > 14) {
        reminderType = 'payment_followup'
        urgency = 'medium'
      }

      // Generate payment link (one-tap UPI)
      const paymentLink = `${process.env.APP_URL}/pay?customer=${customerId}&amount=${Math.round(totalDue)}`

      // Prepare WhatsApp template parameters
      const templateParams = {
        name: customer.customer_name.split(' ')[0], // First name only
        amount: formatINR(totalDue),
        daysOverdue: daysOverdue.toString(),
        invoiceCount: invoiceCount.toString(),
        paymentLink: paymentLink,
        dueDate: new Date(customer.created_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short'
        })
      }

      try {
        if (!dryRun) {
          // Check if we already sent a reminder recently (avoid spam)
          const recentReminder = await queryOne<{ id: string }>(
            `SELECT id FROM payment_reminders 
             WHERE customer_id = $1 
             AND tenant_id = $2
             AND status = 'SENT'
             AND sent_at > NOW() - INTERVAL '7 days'`,
            [customerId, tenantId]
          )

          if (recentReminder) {
            console.log(`Skipping ${customer.customer_name} - reminder sent recently`)
            continue
          }

          // Send WhatsApp message
          const config = {
            provider: (process.env.WHATSAPP_PROVIDER as 'gupshup' | 'twilio') || 'gupshup',
            apiKey: process.env.GUPSHUP_API_KEY || process.env.TWILIO_ACCOUNT_SID || '',
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
            fromPhone: process.env.TWILIO_FROM_NUMBER || '',
            templateName: reminderType,
          }

          const result = await sendWhatsAppMessage(config, {
            to: formatPhoneNumber(customer.phone),
            template: reminderType,
            params: templateParams,
          })

          if (result.success) {
            // Log the reminder
            await query(
              `INSERT INTO payment_reminders (id, tenant_id, customer_id, reminder_type, scheduled_for, status, channel, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'SENT', 'WHATSAPP', NOW())`,
              [tenantId, customerId, reminderType]
            )

            remindersSent++
            customersContacted++
          } else {
            errors.push({
              customer: customer.customer_name,
              error: result.error || 'Failed to send WhatsApp'
            })
          }
        } else {
          // Dry run - just log what would be sent
          console.log(`[DRY RUN] Would send ${reminderType} to ${customer.customer_name}:`, templateParams)
          customersContacted++
        }
      } catch (error: any) {
        console.error(`Failed to send reminder to ${customer.customer_name}:`, error)
        errors.push({
          customer: customer.customer_name,
          error: error.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${customerGroups.size} customers with overdue payments`,
      remindersSent,
      customersContacted,
      errors: errors.length > 0 ? errors : undefined,
      dryRun
    })

  } catch (error: any) {
    console.error('[Payment Reminders] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process payment reminders', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Format phone number for WhatsApp
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '')
  
  // Add India country code if not present
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