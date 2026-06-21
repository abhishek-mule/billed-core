import { Worker, Job, Queue } from 'bullmq'
import { createRedisConnection, getRedis } from '../lib/redis'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'
import { createQueueLogger } from '../lib/queue-logger'
import { EventType, DEFAULT_OPERATING_HOURS } from '@billzo/shared'
import { emitEvent, emitRecoveryReminderSent } from '../src/lib/billzo/events'
import type { InternalAuthorityClient } from '../src/lib/authority/internal-authority'
import { generateCorrelationId } from '../src/lib/billzo/idempotency'
import { sendWhatsAppMessage, getEffectiveProvider } from '../lib/whatsapp-router'
import { startBaileysSocket, isBaileysConnected } from '../lib/baileys-socket'
import { signUpiToken } from '../lib/crypto'
import { buildRecommendation, buildRecommendationFull } from '../src/lib/billzo/orchestrator'
import { emitOrchestrationSnapshot } from '../src/lib/billzo/orchestration-snapshot'
import { spineDiagnostics } from '../src/lib/spine-diagnostics'
import {
  REMINDER_STAGES,
  STAGE_LABELS,
  normalizeStage,
  getNextStage,
  type ReminderStage,
  type WhatsAppProvider,
  type BehavioralRecommendationContext,
  type CustomerBehavioralMetrics,
} from '@billzo/shared'
import { canSendReminder } from '../src/lib/recovery/decision-engine'

const logger = createQueueLogger('reminders')

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

// ── Message Variation Library (Rule 12) ──
// 3 variations per stage; cycles through them so customers never see the same text twice.
// 4th param (paidText) used for partial payment acknowledgment.
const MESSAGE_VARIATIONS: Record<ReminderStage, Array<(c: string, a: string, b: string, d: string) => string[]>> = {
  t0_soft: [
    (c, a, b, d) => [
      `Hi ${c} 🙏`,
      `Hope you're doing well. Just a gentle reminder that ${a}${d} is pending from your end.`,
      `Please pay at your earliest convenience:`,
    ],
    (c, a, b, d) => [
      `Dear ${c},`,
      `This is a friendly reminder regarding your outstanding amount of ${a}${d}.`,
      `Kindly clear the dues when possible. Thank you for your business!`,
    ],
    (c, a, b, d) => [
      `Hello ${c} 😊`,
      `Trusting you're having a good week. Just circling back on the pending ${a}${d}.`,
      `No stress — whenever it's convenient for you:`,
    ],
  ],
  t24_nudge: [
    (c, a, b, d) => [
      `Dear ${c},`,
      `This is a follow-up regarding your pending amount of ${a}${d}.`,
      `It's been a few days — please arrange payment at your earliest.`,
    ],
    (c, a, b, d) => [
      `Hi ${c},`,
      `Quick reminder: ${a}${d} is still outstanding on your account.`,
      `Please process the payment when you get a moment.`,
    ],
    (c, a, b, d) => [
      `Dear ${c},`,
      `We noticed that the payment of ${a}${d} is pending.`,
      `Kindly update us if there's any issue we can help with.`,
    ],
  ],
  t72_strong: [
    (c, a, b, d) => [
      `Dear ${c},`,
      `This is an urgent reminder regarding ${a}${d} which is now significantly overdue.`,
      `We request you to clear the amount at the earliest to avoid any escalation.`,
    ],
    (c, a, b, d) => [
      `Hello ${c},`,
      `${a}${d} — this payment is now overdue. We've sent previous reminders but haven't heard back.`,
      `Please arrange payment immediately or reply with an update.`,
    ],
    (c, a, b, d) => [
      `Dear ${c},`,
      `Despite multiple reminders, ${a}${d} remains unpaid.`,
      `We value your relationship and request you to settle this at the earliest.`,
    ],
  ],
  t5_warning: [
    (c, a, b, d) => [
      `Dear ${c},`,
      `This is a final notice regarding ${a}${d}.`,
      `If we do not receive payment within 3 days, we will have to escalate this matter further.`,
      `Please treat this as urgent.`,
    ],
    (c, a, b, d) => [
      `Dear ${c},`,
      `FINAL REMINDER: ${a}${d} is long overdue despite all previous notices.`,
      `Immediate payment is required to avoid any further action.`,
      `Please contact us immediately if there's an issue.`,
    ],
    (c, a, b, d) => [
      `Dear ${c},`,
      `We have attempted to reach you multiple times regarding the overdue amount of ${a}${d}.`,
      `This is your final notice. Kindly clear the dues within 3 working days.`,
    ],
  ],
}

function buildPaymentUrls(upiId?: string, tenantId?: string, invoiceId?: string, amount?: number, businessName?: string): string[] {
  if (!upiId) return []
  if (tenantId && invoiceId && amount) {
    const token = signUpiToken({ invoiceId, tenantId, amount, upiId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
    return [`Pay here: ${appUrl}/pay/r/${token}`]
  }
  return [`Pay via UPI: upi://pay?pa=${encodeURIComponent(upiId)}&am=${amount}&pn=${encodeURIComponent(businessName || '')}`]
}

// Track which variation was last used per (tenantId, invoiceId) so we cycle forward
const variationIndexCache = new Map<string, number>()

function getNextVariationKey(tenantId: string, invoiceId: string): number {
  const key = `${tenantId}:${invoiceId}`
  const current = variationIndexCache.get(key) ?? -1
  const next = (current + 1) % 3
  variationIndexCache.set(key, next)
  return next
}

function buildMessage(
  stage: ReminderStage,
  customerName: string,
  amount: number,
  businessName: string,
  upiId?: string,
  tenantId?: string,
  invoiceId?: string,
  variationIndex?: number,
  total?: number,
): { text: string; variationIndex: number } {
  const amountText = `₹${amount.toLocaleString('en-IN')}`
  const isPartial = total !== undefined && total > amount
  const paidText = isPartial ? ` (₹${(total - amount).toLocaleString('en-IN')} paid)` : ''
  const vars = MESSAGE_VARIATIONS[stage]
  const idx = variationIndex ?? (tenantId && invoiceId ? getNextVariationKey(tenantId, invoiceId) : 0)
  const builder = vars[idx % vars.length]
  const body = builder(customerName, amountText, businessName, paidText)
  const urls = buildPaymentUrls(upiId, tenantId, invoiceId, amount, businessName)
  const lines = [...body, '', ...urls, '', `Regards,\n${businessName}`]
  return { text: lines.join('\n'), variationIndex: idx }
}

const BAILEYS_HOURLY_LIMIT = 50
const GUPSHUP_HOURLY_LIMIT = 100
const BAILEYS_DAILY_WARMUP = 10
const WARMUP_DAYS = 3

async function checkRateLimit(tenantId: string, provider: WhatsAppProvider): Promise<boolean> {
  if (process.env.DISABLE_RATE_LIMIT === 'true') return true
  try {
    const redis = getRedis()
    const hourKey = `rate:${tenantId}:${new Date().toISOString().slice(0, 13).replace(/[^0-9]/g, '')}`
    const count = await redis.incr(hourKey)
    if (count === 1) await redis.expire(hourKey, 3700)

    if (provider === 'baileys') {
      const warmupKey = `warmup:${tenantId}`
      const warmupStart = await redis.get(warmupKey)
      if (warmupStart) {
        const daysSinceWarmup = (Date.now() - parseInt(warmupStart)) / (24 * 60 * 60 * 1000)
        if (daysSinceWarmup < WARMUP_DAYS) {
          const dailyKey = `rate:daily:${tenantId}:${new Date().toISOString().slice(0, 10)}`
          const dailyCount = await redis.incr(dailyKey)
          if (dailyCount === 1) await redis.expire(dailyKey, 90000)
          if (dailyCount > BAILEYS_DAILY_WARMUP) return false
        }
      } else {
        await redis.set(warmupKey, Date.now().toString(), 'EX', 7 * 24 * 3600)
      }

      if (count > BAILEYS_HOURLY_LIMIT) return false
    } else {
      if (count > GUPSHUP_HOURLY_LIMIT) return false
    }

    return true
  } catch {
    return true
  }
}

interface ReminderJobData {
  invoiceId: string
  tenantId: string
  stage: string
}

export function createRemindersWorker(authority?: InternalAuthorityClient) {
  const connection = createRedisConnection()

  const worker = new Worker<ReminderJobData>(
    'reminders',
    async (job: Job<ReminderJobData>) => {
      const startTime = Date.now()
      const { invoiceId, tenantId, stage } = job.data

      // Jitter ±15 min on next reminder time to avoid burst collisions
      const jitter = () => (Math.random() - 0.5) * 30 * 60 * 1000

      const lockKey = `reminder:${invoiceId}:${stage}`
      const result = await withLock(lockKey, 60000, async () => {
        logger.info({ invoiceId, stage }, 'Sending reminder')

        const [invoiceResult, tenantResult] = await Promise.all([
          supabaseAdmin.from('invoices').select('*').eq('id', invoiceId).single(),
          supabaseAdmin.from('tenants').select('company_name, upi_id, whatsapp_config').eq('id', tenantId).single(),
        ])

        if (invoiceResult.error || !invoiceResult.data) {
          throw new Error(`Invoice not found: ${invoiceResult.error?.message || invoiceId}`)
        }
        
        const customerResult = await supabaseAdmin.from('customers').select('*').eq('id', invoiceResult.data.customer_id).single()
        
        if (tenantResult.error || !tenantResult.data) {
          throw new Error(`Tenant not found: ${tenantResult.error?.message || tenantId}`)
        }

        const invoice = invoiceResult.data
        const customer = customerResult.data
        const tenant = tenantResult.data
        const config = (tenant.whatsapp_config || {}) as Record<string, any>

        // Fetch all unpaid invoices for this customer (for consolidated reminder)
        const { data: unpaidInvoices } = await supabaseAdmin
          .from('invoices')
          .select('id, total, outstanding_amount, due_date')
          .eq('tenant_id', tenantId)
          .eq('customer_id', customer.id)
          .in('status', ['unpaid', 'overdue', 'partial'])
          .gt('outstanding_amount', 0)
          .order('due_date', { ascending: true })

        const unpaid = unpaidInvoices || []
        const isConsolidated = unpaid.length > 1

        // ── Decision Engine: Pre-Send Checklist ──
        const automationMode = customer?.automation_mode || 'full_auto'
        if (automationMode === 'muted') {
          logger.info({ customerId: customer?.id, invoiceId }, 'Customer is muted, skipping reminder')
          return { skipped: true, reason: 'muted', invoiceId, stage }
        }

        const { data: activePromise } = await supabaseAdmin
          .from('payment_promises')
          .select('promise_date')
          .eq('invoice_id', invoiceId)
          .eq('status', 'active')
          .gte('promise_date', new Date().toISOString())
          .limit(1)
          .maybeSingle()

        // ── Reminder history for new decision rules ──
        const [reminderEventsResult, customerRemindersResult] = await Promise.all([
          supabaseAdmin
            .from('whatsapp_events')
            .select('status, created_at')
            .eq('invoice_id', invoiceId)
            .eq('tenant_id', tenantId)
            .eq('direction', 'outbound')
            .order('created_at', { ascending: false }),
          supabaseAdmin
            .from('whatsapp_events')
            .select('created_at')
            .eq('customer_id', customer?.id || '')
            .eq('tenant_id', tenantId)
            .eq('direction', 'outbound')
            .in('status', ['sent', 'delivered', 'read'])
            .order('created_at', { ascending: false })
            .limit(1),
        ])

        const reminderEvents = reminderEventsResult.data
        const customerReminders = customerRemindersResult.data

        const totalSent = reminderEvents?.length ?? 0
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        const sentThisMonth = reminderEvents?.filter(
          (e: any) => new Date(e.created_at) >= monthStart,
        ).length ?? 0
        // Consecutive ignores: most recent outbound events that were not read
        let consecutiveIgnores = 0
        if (reminderEvents) {
          for (const e of reminderEvents) {
            if (e.status === 'read') break
            if (e.status === 'sent' || e.status === 'queued') consecutiveIgnores++
          }
        }
        const lastReminderAt = reminderEvents?.[0]?.created_at || null
        const lastCustomerReminderAt = customerReminders?.[0]?.created_at || null
        const hoursSinceLastCustomerReminder = lastCustomerReminderAt
          ? (Date.now() - new Date(lastCustomerReminderAt).getTime()) / 3600000
          : 99

        logger.info({ invoiceId, stage }, 'Running decision engine')
        const decisionResult = canSendReminder({
          invoice: {
            id: invoiceId,
            total: invoice.total || 0,
            outstanding: invoice.outstanding_amount ?? invoice.total ?? 0,
            recoveryStage: invoice.recovery_stage || 't0_soft',
            nextRecoveryAt: invoice.next_recovery_at || null,
            isSnoozed: invoice.is_snoozed || false,
            snoozeUntil: invoice.snooze_until || null,
            isDisputed: invoice.is_disputed || false,
            manualInteractionAt: invoice.manual_interaction_at || null,
            overrideSend: invoice.override_send || false,
            overrideAt: invoice.override_at || null,
            overrideReason: invoice.override_reason || null,
            lastReminderAt,
            reminderCount: totalSent,
          },
          customer: {
            id: customer?.id || '',
            phone: customer?.phone || null,
            customerTier: customer?.customer_tier || 'regular',
            automationMode,
            phoneVerification: customer?.phone_verification || 'unknown',
            reputationScore: customer?.reputation_score ?? 50,
            engagementState: customer?.engagement_state || 'unseen',
          },
          activePromiseDate: activePromise?.promise_date || null,
          timezone: 'Asia/Kolkata',
          reminderHistory: {
            totalSent,
            sentThisMonth,
            consecutiveIgnores,
            lastReminderAt,
            lastReadAt: null,
            linkClicked: false,
            hoursSinceLastCustomerReminder,
          },
        })

        logger.info({
          invoiceId,
          customerId: customer?.id,
          stage,
          decision: decisionResult.decision,
          allowed: decisionResult.allowed,
          checksPassed: decisionResult.checksPassed,
          totalChecks: decisionResult.totalChecks,
          confidence: decisionResult.confidence,
          blockedBy: decisionResult.rules.find(r => !r.passed)?.rule || null,
          hoursSinceLastCustomerReminder,
        }, 'recovery_decision')

        // Log decision to audit table
        // authority:exempt append_only_observability — recovery_decisions is append-only audit log, not business state
        await supabaseAdmin.from('recovery_decisions').insert({
          invoice_id: invoiceId,
          tenant_id: tenantId,
          customer_id: customer?.id || '',
          decision: decisionResult.decision,
          reason: decisionResult.reason,
          confidence: decisionResult.confidence,
          rules_checked: decisionResult.rules,
          rules_snapshot: decisionResult.rulesSnapshot,
          context_snapshot: { stage, recoveryStage: invoice.recovery_stage },
          next_review_at: decisionResult.nextReviewAt,
        }).maybeSingle()

        // Emit RECOVERY_RECOMMENDATION event — machine suggests, merchant decides
        const blockedBy = decisionResult.rules.find(r => !r.passed)
        await emitEvent({
          type: EventType.RECOVERY_RECOMMENDATION,
          tenantId,
          entityId: invoiceId,
          payload: {
            allowed: decisionResult.allowed,
            decision: decisionResult.decision,
            reason: decisionResult.reason,
            checksPassed: decisionResult.checksPassed,
            totalChecks: decisionResult.totalChecks,
            confidence: decisionResult.confidence,
            nextReviewAt: decisionResult.nextReviewAt,
            blockedBy: blockedBy?.rule || null,
            rules: decisionResult.rules.map(r => ({ rule: r.rule, passed: r.passed })),
          },
          causationId: null,
          correlationId: `reminder:${invoiceId}`,
          producer: 'worker',
          idempotencyKey: null,
          retentionDays: 90,
        })

        if (!decisionResult.allowed) {
          logger.warn({ invoiceId, reason: decisionResult.reason }, 'Decision engine blocked reminder')
          await emitEvent({
            type: EventType.DECISION_ENGINE_BLOCKED,
            tenantId,
            entityId: invoiceId,
            payload: {
              reason: decisionResult.reason,
              decision: decisionResult.decision,
              rules: decisionResult.rules,
              stage,
            },
            causationId: null,
            correlationId: `reminder:${invoiceId}`,
            producer: 'worker',
            idempotencyKey: null,
            retentionDays: 30,
          })
          return { skipped: true, reason: `decision_engine:${decisionResult.reason}`, invoiceId, stage }
        }

        const phoneNumber = customer?.whatsapp_number || customer?.phone
        const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : ''
        if (cleanPhone.length < 10) {
          logger.warn({ invoiceId, customerId: customer?.id, phone: phoneNumber }, 'Skipping — invalid phone number')
          return { skipped: true, reason: `invalid_phone: "${phoneNumber}"`, invoiceId, stage }
        }
        const upiId = tenant.upi_id || config.upiId
        const effectiveProvider: WhatsAppProvider = config.whatsappProvider === 'baileys' ? 'baileys' : 'gupshup'

        // Rate limit check
        const withinLimit = await checkRateLimit(tenantId, effectiveProvider)
        if (!withinLimit) {
          logger.warn({ tenantId, stage, invoiceId }, 'Rate limit hit, requeueing')
          const queue = new Queue<ReminderJobData>('reminders', { connection })
          await queue.add(`reminder:${invoiceId}:${stage}`, { invoiceId, tenantId, stage }, {
            delay: 60000 + Math.floor(Math.random() * 120000),
            attempts: 5,
            backoff: { type: 'exponential', delay: 120000 },
          })
          await queue.close()
          return { skipped: true, reason: 'rate_limited', invoiceId, stage }
        }

        let message: string
        let msgVariation = 0
        let messageType = stage
        let invoiceCount = 1

        if (isConsolidated) {
          const totalDue = unpaid.reduce((sum, inv) => sum + (Number(inv.outstanding_amount) || Number(inv.total) || 0), 0)
          const paymentUrls = buildPaymentUrls(upiId, tenantId, unpaid[0].id, unpaid[0].total, tenant.company_name)
          const paymentLink = paymentUrls[0] || `upi://pay?pa=${encodeURIComponent(upiId)}&am=${totalDue}&pn=${encodeURIComponent(tenant.company_name || '')}`

          message = `Hi ${customer.customer_name || 'Customer'},\n\nYour outstanding balance is ₹${totalDue.toLocaleString('en-IN')}.\n\nThis amount is spread across ${unpaid.length} pending invoices.\n\nPlease clear the pending amount:\n\n${paymentLink}\n\nReply if payment has already been made.`
          messageType = 'consolidated_v1'
          invoiceCount = unpaid.length
        } else {
          const { text, variationIndex } = buildMessage(
            stage as ReminderStage,
            customer?.customer_name || 'Customer',
            invoice.outstanding_amount ?? invoice.total ?? 0,
            tenant.company_name || 'BillZo',
            upiId, tenantId, invoiceId,
            undefined,
            invoice.total,
          )
          message = text
          msgVariation = variationIndex
        }

        // ── Send-time guard: idempotency check ──
        // Has this invoice+stage already been sent in the last 24 hours?
        const { data: existingSend } = await supabaseAdmin
          .from('whatsapp_events')
          .select('id')
          .eq('invoice_id', invoiceId)
          .eq('tenant_id', tenantId)
          .eq('direction', 'outbound')
          .eq('message_type', stage)
          .gte('occurred_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle()
        if (existingSend) {
          logger.warn({ invoiceId, stage }, 'Duplicate send blocked — invoice+stage already sent in last 24h')
          return { skipped: true, reason: 'duplicate_stage_today', invoiceId, stage }
        }

        // ── Send-time guard: payment check ──
        // Is the invoice still unpaid?
        const { data: freshInvoice } = await supabaseAdmin
          .from('invoices')
          .select('status, outstanding_amount')
          .eq('id', invoiceId)
          .single()
        if (!freshInvoice || freshInvoice.status === 'paid' || (freshInvoice.outstanding_amount ?? 0) <= 0) {
          logger.warn({ invoiceId, status: freshInvoice?.status }, 'Send skipped — invoice no longer outstanding')
          return { skipped: true, reason: 'invoice_paid_or_zero', invoiceId, stage }
        }

        if (effectiveProvider === 'baileys' && !isBaileysConnected(tenantId)) {
          logger.info({ tenantId }, 'Starting Baileys socket')
          startBaileysSocket(tenantId).catch((err) =>
            logger.error({ tenantId, err }, 'Failed to start Baileys')
          )
        }

        const sendResult = await sendWhatsAppMessage(tenantId, cleanPhone, message, {
          invoiceId,
          customerId: customer?.id || undefined,
          reminderStage: stage,
          attemptNumber: 1,
          amount: invoice.total || 0,
        })

        if (sendResult.error) {
          logger.error({ invoiceId, err: sendResult.error }, 'Send failed')
        }

        const { identity } = sendResult
        const eventStatus = sendResult.error ? 'failed' : 'queued'

        // Emit transport event via outbox (transport projector will record to whatsapp_events)
        await emitEvent({
          type: EventType.WHATSAPP_SENT,
          tenantId,
          entityId: invoiceId,
          payload: {
            billzoMessageId: identity.billzoMessageId,
            conversationId: identity.conversationId,
            messageOrigin: identity.messageOrigin,
            eventSequence: identity.eventSequence,
            transportMessageHash: identity.transportMessageHash,
            parentBillzoMessageId: identity.parentBillzoMessageId,
            attemptNumber: identity.attemptNumber,
            reminderStage: identity.reminderStage,
            customerId: customer?.id || null,
            phone: `+${cleanPhone}`,
            status: eventStatus,
            messageType,
            messageVariation: msgVariation,
            messagePreview: message.slice(0, 120),
            providerMessageId: sendResult.messageId,
            provider: sendResult.provider,
            error: sendResult.error || null,
            metadata: {
              messageType,
              invoiceCount,
            },
          },
          causationId: null,
          correlationId: generateCorrelationId(invoiceId),
          producer: 'worker',
          idempotencyKey: `whatsapp:sent:${identity.billzoMessageId}`,
          retentionDays: 90,
        })

        const nextStage = getNextStage(stage as ReminderStage)
        const maxStageReached = nextStage === stage

        // Recovery orchestration fields update (governed by authority if available)
        // Phase 0 probe: Date.now() used for nextRecoveryAt calculation
        spineDiagnostics.dateNowInDomain('reminders:advanceStage-nextRecoveryAt')
        if (authority) {
          await authority.submit({
            intentType: 'reminder.advance_stage',
            tenantId,
            actor: 'reminder-worker',
            payload: {
              invoiceId,
              lastWhatsappStatus: eventStatus,
              lastWhatsappAt: new Date().toISOString(),
              recoveryStage: nextStage,
              nextRecoveryAt: maxStageReached
                ? null
                : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + jitter()).toISOString(),
            },
          }, 'trusted_sync')
        } else {
          // authority:fallback reminder.advance_stage
          spineDiagnostics.dualWrite('reminders:advanceStage', 'invoices')
          await supabaseAdmin.from('invoices').update({
            last_whatsapp_status: eventStatus,
            last_whatsapp_at: new Date().toISOString(),
            recovery_stage: nextStage,
            next_recovery_at: maxStageReached
              ? null
              : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + jitter()).toISOString(),
            sync_status: 'pending',
          }).eq('id', invoiceId)
        }

        // Terminal state: max stage reached → escalate to merchant for review
        if (maxStageReached && customer?.id) {
          // authority:fallback recovery_cases.update_terminal
          await supabaseAdmin.from('recovery_cases').update({
            recovery_state_v2: 'overdue',
            next_action_type: 'merchant_review',
            next_action_due_at: new Date().toISOString(),
          }).eq('tenant_id', tenantId).eq('customer_id', customer.id)
        }

        if (eventStatus !== 'failed') {
          await emitRecoveryReminderSent({
            invoiceId,
            tenantId,
            customerId: customer?.id || '',
            stage,
            channel: 'whatsapp',
            messageId: identity.billzoMessageId,
          })

          logger.info('recovery_send', {
            invoiceId,
            customerId: customer?.id,
            stage,
            provider: sendResult.provider,
          })
        }

        // Orchestrator-driven escalation and cadence
        if (eventStatus !== 'failed') {
          try {
            const { data: recentEvents } = await supabaseAdmin
              .from('whatsapp_events')
              .select('status, created_at')
              .eq('invoice_id', invoiceId)
              .eq('tenant_id', tenantId)
              .eq('direction', 'outbound')
              .order('created_at', { ascending: false })
              .limit(5)

            // Build ignore count from recent events
            const ignoreCount = recentEvents
              ? recentEvents.filter((e: any) => e.status === 'sent' || e.status === 'queued').length
              : 0

            const { data: avgInvoice } = await supabaseAdmin
              .from('invoices')
              .select('total')
              .eq('tenant_id', tenantId)
              .order('created_at', { ascending: false })
              .limit(20)

            const invoices = avgInvoice || []
            const avgAmount = invoices.length > 0
              ? invoices.reduce((sum: number, i: any) => sum + (i.total || 0), 0) / invoices.length
              : 1
            const amountRatio = (invoice.total || 0) / Math.max(avgAmount, 1)

            // Fetch behavioral metrics for orchestrator context
            const { data: behMetrics } = await supabaseAdmin
              .from('customer_behavioral_metrics')
              .select('*')
              .eq('tenant_id', tenantId)
              .eq('customer_id', customer?.id)
              .maybeSingle()

            let recommendEscalation = ignoreCount >= 3 && amountRatio > 2.5
            let nextFollowUpDays = 3

            if (behMetrics) {
              const context: BehavioralRecommendationContext = {
                tenantId,
                customerId: customer?.id || '',
                traits: {
                  temporalRegularity: { value: 0, priorSource: 'none', evidenceWeight: 0 },
                  constraintAffinity: {
                    value: behMetrics.totalInterventionsSent > 0
                      ? Math.min((behMetrics.totalInterventionsSent - behMetrics.totalResolutionsAfterIntervention) / behMetrics.totalInterventionsSent, 1)
                      : 0,
                    priorSource: 'customer',
                    evidenceWeight: behMetrics.observationCount,
                  },
                  strategicDelayLikelihood: {
                    value: behMetrics.avgReadToPayHours > 72 ? 0.7 : behMetrics.avgReadToPayHours > 48 ? 0.4 : 0.2,
                    priorSource: 'customer',
                    evidenceWeight: behMetrics.observationCount,
                  },
                  disputeRisk: {
                    value: behMetrics.totalResolutionsAfterIntervention > 0
                      ? Math.min(behMetrics.totalEscalationsReceived / behMetrics.totalResolutionsAfterIntervention, 1)
                      : 0,
                    priorSource: 'customer',
                    evidenceWeight: behMetrics.observationCount,
                  },
                  channelViability: {
                    value: behMetrics.readRate,
                    priorSource: 'customer',
                    evidenceWeight: behMetrics.observationCount,
                  },
                },
                readRate: behMetrics.readRate,
                channelViability: behMetrics.readRate,
                entropy: 0.3,
                priorSource: behMetrics.observationCount > 0 ? 'customer' : 'none',
                observationCount: behMetrics.observationCount,
                updatedAt: behMetrics.updatedAt,
              }

              // Compute transport confidence from recent receipt telemetry
              const receiptStatuses: string[] = ['delivered', 'read', 'server_ack', 'received']
              const receiptEvents = (recentEvents || []).filter((e: any) => receiptStatuses.includes(e.status))
              const transportConfidence = recentEvents && recentEvents.length > 0
                ? receiptEvents.length / recentEvents.length
                : 0.5

              const invoiceOrchInput = {
                id: invoiceId,
                total: invoice.total || 0,
                daysOverdue: Math.floor((Date.now() - new Date(invoice.created_at || Date.now()).getTime()) / (24 * 60 * 60 * 1000)),
                currentStage: stage as ReminderStage,
                ignoreCount,
                amountRatio,
              }

              const orchInput = {
                context,
                invoice: invoiceOrchInput,
                operatingHours: (config.operatingHours || DEFAULT_OPERATING_HOURS),
                transportConfidence,
                customerTier: customer?.customer_tier || 'regular',
                reputationScore: customer?.reputation_score ?? 50,
              }

              const { recommendation, confidence } = buildRecommendationFull(orchInput)

              recommendEscalation = recommendation.escalation.shouldEscalate
              nextFollowUpDays = recommendation.cadence.nextFollowUpDays

              logger.info({ invoiceId, recommendation: { shouldSend: recommendation.shouldSend, tone: recommendation.content.tone, escalate: recommendation.escalation.shouldEscalate, cadenceDays: nextFollowUpDays, confidence } }, 'Orchestrator recommendation')

              // Emit orchestration snapshot for forensic replay
              await emitOrchestrationSnapshot(orchInput, { triggeredBy: 'reminders-worker' }).catch((err: any) =>
                logger.error({ invoiceId, err }, 'Failed to emit orchestration snapshot')
              )
            }

            if (recommendEscalation) {
              const emitReason = `Invoice ${amountRatio.toFixed(1)}x avg, ignored ${ignoreCount}x`
              logger.info({ invoiceId, amountRatio, ignoreCount }, `Escalation suggested: ${emitReason}`)
              await emitEvent({
                type: EventType.RECOVERY_ESCALATION_SUGGESTED,
                tenantId,
                entityId: invoiceId,
                payload: { amount: invoice.total, customerName: customer?.customer_name, ignoreCount, amountRatio },
                causationId: null,
                correlationId: generateCorrelationId(invoiceId),
                producer: 'worker',
                idempotencyKey: `escalation:${invoiceId}:${new Date().toISOString().slice(0, 10)}`,
                retentionDays: 90,
              })
            }

                // Phase 0 probe: Date.now() in domain logic
                spineDiagnostics.dateNowInDomain('reminders:cadenceUpdate')
                // Use orchestrator's cadence for next follow-up timing
            if (nextFollowUpDays !== 3) {
              if (authority) {
                await authority.submit({
                  intentType: 'reminder.update_cadence',
                  tenantId,
                  actor: 'reminder-worker',
                  payload: {
                    invoiceId,
                    nextRecoveryAt: new Date(Date.now() + nextFollowUpDays * 24 * 60 * 60 * 1000 + jitter()).toISOString(),
                  },
                }, 'trusted_sync')
              } else {
                spineDiagnostics.dualWrite('reminders:updateCadence', 'invoices')
                const cadenceUpdate: Record<string, any> = {
                  next_recovery_at: new Date(Date.now() + nextFollowUpDays * 24 * 60 * 60 * 1000 + jitter()).toISOString(),
                }
                // authority:fallback reminder.update_cadence
                await supabaseAdmin.from('invoices').update(cadenceUpdate).eq('id', invoiceId)
              }
            }
          } catch (err) {
            logger.error({ invoiceId, err }, 'Orchestrator error')
          }
        }

        if (sendResult.error) {
          throw new Error(sendResult.error)
        }

        logger.info({ invoiceId, stage, cleanPhone, provider: sendResult.provider }, 'Reminder sent')

        // Clear merchant override after successful send
        if (invoice.override_send) {
          const { clearOverride } = await import('../src/lib/recovery/override-handler')
          await clearOverride(invoiceId).catch(() => {})
        }

        return { sent: true, invoiceId, stage, status: eventStatus, messageId: identity.billzoMessageId, provider: sendResult.provider }
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
        status: result.skipped ? 'skipped' : 'success',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        level: result.skipped ? 'warn' : 'info',
        message: result.skipped ? `Reminder skipped: ${result.reason}` : `Reminder sent: ${stage}`,
      })

      return result
    },
    {
      connection,
      concurrency: 2,
    }
  )

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, result: job.returnvalue }, 'Job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed')
  })

  return worker
}

export function createReminderQueue() {
  const connection = createRedisConnection()
  return new Queue<ReminderJobData>('reminders', { connection })
}

function createEnqueueLock(): { redis: ReturnType<typeof getRedis>; ttl: number } {
  return { redis: getRedis(), ttl: 600 }
}

export async function enqueueOverdueReminders(): Promise<number> {
  const now = new Date().toISOString()
  let enqueued = 0
  let skippedMuted = 0
  let skippedManual = 0
  let skippedLocked = 0

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select(`
      id,
      tenant_id,
      recovery_stage,
      next_recovery_at,
      customer_id
    `)
    .in('status', ['unpaid', 'overdue'])
    .or(`next_recovery_at.lte.${now},next_recovery_at.is.null`)
    .limit(200)

  if (error || !invoices) {
    logger.error({ err: error?.message }, 'Failed to fetch overdue invoices')
    return 0
  }

  // Collect unique customer IDs and fetch their automation modes
  const customerIds = [...new Set(invoices.map(i => i.customer_id).filter(Boolean))]
  const customerModeMap = new Map<string, string>()
  if (customerIds.length > 0) {
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, automation_mode')
      .in('id', customerIds)
    if (customers) {
      for (const c of customers) {
        customerModeMap.set(c.id, c.automation_mode || 'full_auto')
      }
    }
  }

  const queue = createReminderQueue()
  const lock = createEnqueueLock()
  for (const inv of invoices) {
    const stage = normalizeStage(inv.recovery_stage)
    if (!REMINDER_STAGES.includes(stage)) continue

    const mode = customerModeMap.get(inv.customer_id) || 'full_auto'
    if (mode === 'muted') {
      skippedMuted++
      continue
    }
    if (mode === 'manual') {
      skippedManual++
      continue
    }

    logger.info('recovery_scan_candidate', {
      invoiceId: inv.id,
      customerId: inv.customer_id,
      stage,
      nextRecoveryAt: inv.next_recovery_at,
    })

    // Distributed lock: prevent duplicate enqueue if this invoice+stage
    // was already enqueued within the TTL window (e.g. after crash/restart)
    const lockKey = `enqueue_lock:reminder:${inv.id}:${stage}`
    const acquired = await lock.redis.set(lockKey, '1', 'EX', lock.ttl, 'NX')
    if (!acquired) {
      skippedLocked++
      continue
    }

    await queue.add(`reminder:${inv.id}:${stage}`, {
      invoiceId: inv.id,
      tenantId: inv.tenant_id,
      stage,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      delay: Math.floor(Math.random() * 120000) + 30000,
    })
    enqueued++
  }

  await queue.close()
  logger.info({ enqueued, skippedMuted, skippedManual, skippedLocked }, 'Enqueued overdue reminder jobs')
  return enqueued
}
