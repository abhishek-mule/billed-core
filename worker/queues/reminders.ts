import { Worker, Job, Queue } from 'bullmq'
import { createRedisConnection } from '../lib/redis'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'
import { emitRecoveryReminderSent } from '../src/lib/billzo/events'
import { sendWhatsAppMessage, getEffectiveProvider, type WhatsAppProvider } from '../lib/whatsapp-router'
import { startBaileysSocket, isBaileysConnected } from '../lib/baileys-socket'

const STAGE_ORDER = ['t1_soft', 't2_firm', 't3_urgent', 't4_final']
const STAGE_LABELS: Record<string, string> = {
  t1_soft: 'friendly reminder',
  t2_firm: 'payment follow-up',
  t3_urgent: 'urgent reminder',
  t4_final: 'final notice',
}

function buildMessage(stage: string, customerName: string, amount: number, businessName: string, upiId?: string): string {
  const stageLabel = STAGE_LABELS[stage] || 'reminder'
  const amountText = `₹${amount.toLocaleString('en-IN')}`
  const lines = [
    `Dear ${customerName},`,
    '',
    `This is a ${stageLabel} regarding your pending amount of ${amountText}.`,
    stage === 't4_final'
      ? 'Please arrange payment immediately to avoid any further escalation.'
      : 'Please clear the dues at your earliest convenience.',
    '',
  ]

  if (upiId) {
    lines.push(`Pay via UPI: upi://pay?pa=${encodeURIComponent(upiId)}&am=${amount}&pn=${encodeURIComponent(businessName)}`)
    lines.push('')
  }

  lines.push(`Regards,\n${businessName}`)
  return lines.join('\n')
}

interface ReminderJobData {
  invoiceId: string
  tenantId: string
  stage: string
}

export function createRemindersWorker() {
  const connection = createRedisConnection()

  const worker = new Worker<ReminderJobData>(
    'reminders',
    async (job: Job<ReminderJobData>) => {
      const startTime = Date.now()
      const { invoiceId, tenantId, stage } = job.data

      const lockKey = `reminder:${invoiceId}:${stage}`
      const result = await withLock(lockKey, 60000, async () => {
        console.log(`[RemindersWorker] Sending ${stage} reminder for invoice ${invoiceId}`)

        const [invoiceResult, tenantResult] = await Promise.all([
          supabaseAdmin.from('invoices').select('*, customers!inner(*)').eq('id', invoiceId).single(),
          supabaseAdmin.from('tenants').select('name, upi_id, whatsapp_config').eq('id', tenantId).single(),
        ])

        if (invoiceResult.error || !invoiceResult.data) {
          throw new Error(`Invoice not found: ${invoiceResult.error?.message || invoiceId}`)
        }
        if (tenantResult.error || !tenantResult.data) {
          throw new Error(`Tenant not found: ${tenantResult.error?.message || tenantId}`)
        }

        const invoice = invoiceResult.data
        const customer = invoice.customers as any
        const tenant = tenantResult.data
        const config = (tenant.whatsapp_config || {}) as Record<string, any>

        const phoneNumber = customer?.whatsapp_number || customer?.phone
        if (!phoneNumber) {
          console.log(`[RemindersWorker] No phone for customer ${customer?.id}, skipping`)
          return { skipped: true, reason: 'no_phone', invoiceId, stage }
        }

        const cleanPhone = phoneNumber.replace(/\D/g, '')
        const upiId = tenant.upi_id || config.upiId
        const message = buildMessage(stage, customer?.name || 'Customer', invoice.total || 0, tenant.name || 'BillZo', upiId)

        const effectiveProvider: WhatsAppProvider = config.whatsappProvider === 'baileys' ? 'baileys' : 'gupshup'

        if (effectiveProvider === 'baileys' && !isBaileysConnected(tenantId)) {
          console.log(`[RemindersWorker] Starting Baileys socket for tenant ${tenantId}`)
          startBaileysSocket(tenantId).catch((err) =>
            console.error(`[RemindersWorker] Failed to start Baileys for ${tenantId}:`, err)
          )
        }

        let sendResult: { messageId: string; provider: WhatsAppProvider } | null = null
        let sendError: string | null = null

        try {
          sendResult = await sendWhatsAppMessage(tenantId, cleanPhone, message)
        } catch (err: any) {
          sendError = err.message
          console.error(`[RemindersWorker] Send failed for invoice ${invoiceId}:`, err.message)
        }

        const eventId = sendResult?.messageId || `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const eventStatus = sendResult ? 'queued' : sendError ? 'failed' : 'sent'

        await supabaseAdmin.from('whatsapp_events').insert({
          id: eventId,
          tenant_id: tenantId,
          invoice_id: invoiceId,
          customer_id: customer?.id || null,
          phone: `+${cleanPhone}`,
          status: eventStatus,
          message_type: stage,
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          sync_status: eventStatus === 'failed' ? 'failed' : 'pending',
          provider: sendResult?.provider || effectiveProvider,
          error: sendError,
        })

        const currentStageIndex = STAGE_ORDER.indexOf(stage)
        const nextStage = currentStageIndex >= 0 && currentStageIndex < STAGE_ORDER.length - 1
          ? STAGE_ORDER[currentStageIndex + 1]
          : 't4_final'

        await supabaseAdmin.from('invoices').update({
          last_whatsapp_status: eventStatus,
          last_whatsapp_at: new Date().toISOString(),
          recovery_stage: nextStage,
          next_recovery_at: nextStage !== stage
            ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
            : null,
          sync_status: 'pending',
        }).eq('id', invoiceId)

        if (eventStatus !== 'failed') {
          await emitRecoveryReminderSent({
            invoiceId,
            tenantId,
            customerId: customer?.id || '',
            stage,
            channel: 'whatsapp',
            messageId: eventId,
          })
        }

        if (sendError) {
          throw new Error(sendError)
        }

        console.log(`[RemindersWorker] ${stage} sent for invoice ${invoiceId} to ${cleanPhone} via ${sendResult?.provider || effectiveProvider}`)
        return { sent: true, invoiceId, stage, status: eventStatus, messageId: eventId, provider: sendResult?.provider }
      })

      if (!result) {
        return { skipped: true, reason: 'lock_not_acquired' }
      }

      const duration = Date.now() - startTime
      logWorkerEvent({
        tenant_id: tenantId,
        entity_id: invoiceId,
        queue_name: 'reminders',
        attempt: job.attemptsMade,
        status: 'success',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Reminder sent: ${stage}`,
      })

      return result
    },
    {
      connection,
      concurrency: 10,
    }
  )

  worker.on('completed', (job) => {
    console.log(`[RemindersWorker] Job ${job.id} completed:`, job.returnvalue)
  })

  worker.on('failed', (job, err) => {
    console.error(`[RemindersWorker] Job ${job?.id} failed:`, err.message)
  })

  return worker
}

export function createReminderQueue() {
  const connection = createRedisConnection()
  return new Queue<ReminderJobData>('reminders', { connection })
}

export async function enqueueOverdueReminders(): Promise<number> {
  const now = new Date().toISOString()
  let enqueued = 0

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('id, tenant_id, recovery_stage, next_recovery_at')
    .in('status', ['unpaid', 'overdue'])
    .lte('next_recovery_at', now)
    .limit(200)

  if (error || !invoices) {
    console.error('[RemindersWorker] Failed to fetch overdue invoices:', error?.message)
    return 0
  }

  const queue = createReminderQueue()
  for (const inv of invoices) {
    const stage = inv.recovery_stage || 't1_soft'
    if (!STAGE_ORDER.includes(stage)) continue

    await queue.add(`reminder:${inv.id}:${stage}`, {
      invoiceId: inv.id,
      tenantId: inv.tenant_id,
      stage,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    })
    enqueued++
  }

  await queue.close()
  console.log(`[RemindersWorker] Enqueued ${enqueued} overdue reminder jobs`)
  return enqueued
}
