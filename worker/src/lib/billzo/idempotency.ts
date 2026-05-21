import { supabaseAdmin } from './supabase-admin'

export interface IdempotencyResult {
  isDuplicate: boolean
  previousResult?: Record<string, unknown> | null
}

/**
 * Idempotency key patterns per domain.
 * Format: {domain}:{entityId}:{context}
 */
export const IdempotencyPatterns = {
  // Payment reconciliation
  paymentReconcile: (invoiceId: string, provider: string, providerPaymentId: string) =>
    `payment:reconcile:${invoiceId}:${provider}:${providerPaymentId}`,

  // Reminder sending
  reminderSent: (invoiceId: string, stage: string, dayBucket: string) =>
    `reminder:sent:${invoiceId}:${stage}:${dayBucket}`,

  // WhatsApp message
  whatsappSent: (invoiceId: string, template: string, phone: string) =>
    `whatsapp:sent:${invoiceId}:${template}:${phone}`,

  // Invoice creation
  invoiceCreated: (tenantId: string, customerId: string, timestamp: string) =>
    `invoice:created:${tenantId}:${customerId}:${timestamp}`,

  // Payment link generation
  paymentLinkGenerated: (invoiceId: string) =>
    `payment:link:${invoiceId}`,

  // Recovery attribution
  recoveryAttribution: (invoiceId: string, paymentId: string) =>
    `recovery:attribution:${invoiceId}:${paymentId}`,

  // Experiment assignment
  experimentAssigned: (invoiceId: string, experimentType: string) =>
    `experiment:assigned:${invoiceId}:${experimentType}`,
} as const

/**
 * Check if a job has already been processed (idempotency check).
 * Returns { isDuplicate: true, previousResult } if already processed.
 */
export async function checkIdempotency(idempotencyKey: string): Promise<IdempotencyResult> {
  const { data, error } = await supabaseAdmin
    .from('processed_jobs')
    .select('status, result')
    .eq('idempotency_key', idempotencyKey)
    .single()

  if (error || !data) {
    return { isDuplicate: false }
  }

  return {
    isDuplicate: true,
    previousResult: data.result,
  }
}

/**
 * Record a job as processed.
 * Should be called AFTER successful job execution.
 */
export async function recordProcessedJob(
  idempotencyKey: string,
  jobType: string,
  tenantId: string,
  status: string,
  result?: Record<string, unknown> | null
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('processed_jobs')
    .upsert({
      idempotency_key: idempotencyKey,
      job_type: jobType,
      tenant_id: tenantId,
      status,
      result: result || null,
      created_at: new Date().toISOString(),
    }, { onConflict: 'idempotency_key' })

  if (error) {
    console.error('[Idempotency] Failed to record processed job:', error)
    return false
  }

  return true
}

/**
 * Execute a job with idempotency guard.
 * If the job was already processed, returns the previous result.
 * Otherwise, executes the job and records the result.
 */
export async function executeIdempotent<T>(
  idempotencyKey: string,
  jobType: string,
  tenantId: string,
  executor: () => Promise<T>
): Promise<T> {
  // Check if already processed
  const { isDuplicate, previousResult } = await checkIdempotency(idempotencyKey)

  if (isDuplicate) {
    console.log('[Idempotency] Duplicate job detected, returning previous result:', idempotencyKey)
    return previousResult as T
  }

  // Execute the job
  const result = await executor()

  // Record as processed
  await recordProcessedJob(
    idempotencyKey,
    jobType,
    tenantId,
    'completed',
    result as Record<string, unknown>
  )

  return result
}

/**
 * Generate a correlation ID for a recovery lifecycle.
 * All events in the same recovery journey share this ID.
 */
export function generateCorrelationId(invoiceId: string): string {
  return `recovery:${invoiceId}`
}

/**
 * Generate a correlation ID for a sync operation.
 */
export function generateSyncCorrelationId(tenantId: string, entityType: string, entityId: string): string {
  return `sync:${tenantId}:${entityType}:${entityId}`
}
