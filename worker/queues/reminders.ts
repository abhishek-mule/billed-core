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

function buildMessage(stage: ReminderStage, customerName: string, amount: number, businessName: string, upiId?: string, tenantId?: string, invoiceId?: string): string {
  const stageLabel = STAGE_LABELS[stage]
  const amountText = `₹${amount.toLocaleString('en-IN')}`
  const lines = [
    `Dear ${customerName},`,
    '',
    `This is a ${stageLabel} regarding your pending amount of ${amountText}.`,
    stage === 't5_warning'
      ? 'Please arrange payment immediately to avoid any further escalation.'
      : 'Please clear the dues at your earliest convenience.',
    '',
  ]

  if (upiId && tenantId && invoiceId) {
    const token = signUpiToken({
      invoiceId,
      tenantId,
      amount,
      upiId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
    lines.push(`Pay here: ${appUrl}/pay/r/${token}`)
    lines.push('')
  } else if (upiId) {
    lines.push(`Pay via UPI: upi://pay?pa=${encodeURIComponent(upiId)}&am=${amount}&pn=${encodeURIComponent(businessName)}`)
    lines.push('')
  }

  lines.push(`Regards,\n${businessName}`)
  return lines.join('\n')
}

const BAILEYS_HOURLY_LIMIT = 50
const GUPSHUP_HOURLY_LIMIT = 100
const BAILEYS_DAILY_WARMUP = 10
const WARMUP_DAYS = 3

async function checkRateLimit(tenantId: string, provider: WhatsAppProvider): Promise<boolean> {
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
          },
          customer: {
            id: customer?.id || '',
            phone: customer?.phone || null,
            customerTier: customer?.customer_tier || 'regular',
            automationMode,
            phoneVerification: customer?.phone_verification || 'unknown',
            reputationScore: customer?.reputation_score ?? 50,
          },
          activePromiseDate: activePromise?.promise_date || null,
        })

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

        const message = buildMessage(stage as ReminderStage, customer?.customer_name || 'Customer', invoice.total || 0, tenant.company_name || 'BillZo', upiId, tenantId, invoiceId)

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
            messageType: stage,
            providerMessageId: sendResult.messageId,
            provider: sendResult.provider,
            error: sendResult.error || null,
          },
          causationId: null,
          correlationId: generateCorrelationId(invoiceId),
          producer: 'worker',
          idempotencyKey: `whatsapp:sent:${identity.billzoMessageId}`,
          retentionDays: 90,
        })

        const nextStage = getNextStage(stage as ReminderStage)

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
              nextRecoveryAt: nextStage !== stage
                ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                : null,
            },
          }, 'trusted_sync')
        } else {
          // authority:fallback reminder.advance_stage
          spineDiagnostics.dualWrite('reminders:advanceStage', 'invoices')
          await supabaseAdmin.from('invoices').update({
            last_whatsapp_status: eventStatus,
            last_whatsapp_at: new Date().toISOString(),
            recovery_stage: nextStage,
            next_recovery_at: nextStage !== stage
              ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
              : null,
            sync_status: 'pending',
          }).eq('id', invoiceId)
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
                    nextRecoveryAt: new Date(Date.now() + nextFollowUpDays * 24 * 60 * 60 * 1000).toISOString(),
                  },
                }, 'trusted_sync')
              } else {
                spineDiagnostics.dualWrite('reminders:updateCadence', 'invoices')
                const cadenceUpdate: Record<string, any> = {
                  next_recovery_at: new Date(Date.now() + nextFollowUpDays * 24 * 60 * 60 * 1000).toISOString(),
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
      concurrency: 10,
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

export async function enqueueOverdueReminders(): Promise<number> {
  const now = new Date().toISOString()
  let enqueued = 0
  let skippedMuted = 0
  let skippedManual = 0

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
    .lte('next_recovery_at', now)
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
      // Don't auto-enqueue; merchant must approve from dashboard
      continue
    }

    await queue.add(`reminder:${inv.id}:${stage}`, {
      invoiceId: inv.id,
      tenantId: inv.tenant_id,
      stage,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      delay: Math.floor(Math.random() * 30000) + 5000,
    })
    enqueued++
  }

  await queue.close()
  logger.info({ enqueued, skippedMuted, skippedManual }, 'Enqueued overdue reminder jobs')
  return enqueued
}
