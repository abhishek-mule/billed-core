import { supabaseAdmin } from './supabase-admin'

export type OutboxStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter'

export interface OutboxEvent {
  id: string
  causationId: string | null
  correlationId: string
  type: string
  version: number
  tenantId: string
  entityId: string | null
  payload: Record<string, unknown> | null
  idempotencyKey: string | null
  status: OutboxStatus
  createdAt: string
  nextAttemptAt: string
  attempts: number
}

export interface OutboxWriteOptions {
  type: string
  tenantId: string
  entityId?: string | null
  payload?: Record<string, unknown> | null
  causationId?: string | null
  correlationId?: string
  idempotencyKey?: string | null
  version?: number
}

/**
 * Write an event to the outbox table.
 * Should be called within the same transaction as the business state write.
 * Returns the outbox event ID.
 */
export async function writeOutboxEvent(options: OutboxWriteOptions): Promise<string> {
  const {
    type,
    tenantId,
    entityId = null,
    payload = null,
    causationId = null,
    correlationId = crypto.randomUUID(),
    idempotencyKey = null,
    version = 1,
  } = options

  const { data, error } = await supabaseAdmin
    .from('outbox')
    .insert({
      type,
      tenant_id: tenantId,
      entity_id: entityId,
      payload,
      causation_id: causationId,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
      version,
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      attempts: 0,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Outbox] Failed to write event:', error)
    throw new Error(`Outbox write failed: ${error.message}`)
  }

  return data.id
}

/**
 * Poll pending outbox events for processing.
 * Returns events that are ready for processing (status = 'pending' AND next_attempt_at <= now).
 */
export async function pollOutboxEvents(limit: number = 50): Promise<OutboxEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[Outbox] Failed to poll events:', error)
    return []
  }

  return (data || []).map(mapOutboxRow)
}

/**
 * Mark an outbox event as processing.
 */
export async function markEventProcessing(eventId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('outbox')
    .update({
      status: 'processing',
      next_attempt_at: new Date().toISOString(),
    })
    .eq('id', eventId)

  if (error) {
    console.error('[Outbox] Failed to mark event processing:', error)
    return false
  }

  return true
}

/**
 * Mark an outbox event as completed.
 */
export async function markEventCompleted(eventId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('outbox')
    .select('attempts')
    .eq('id', eventId)
    .single()

  if (error) {
    console.error('[Outbox] Failed to fetch event for completion:', error)
    return false
  }

  const { error: updateError } = await supabaseAdmin
    .from('outbox')
    .update({
      status: 'completed',
      attempts: (data?.attempts || 0) + 1,
    })
    .eq('id', eventId)

  if (updateError) {
    console.error('[Outbox] Failed to mark event completed:', updateError)
    return false
  }

  return true
}

/**
 * Mark an outbox event as failed with retry scheduling.
 */
export async function markEventFailed(
  eventId: string,
  attempt: number,
  maxAttempts: number = 5
): Promise<{ status: 'retry' | 'dead_letter'; nextAttemptAt: string }> {
  if (attempt >= maxAttempts) {
    // Move to dead letter
    const { error } = await supabaseAdmin
      .from('outbox')
      .update({
        status: 'dead_letter',
        attempts: attempt,
      })
      .eq('id', eventId)

    if (error) {
      console.error('[Outbox] Failed to mark event dead_letter:', error)
    }

    return { status: 'dead_letter', nextAttemptAt: '' }
  }

  // Schedule retry with exponential backoff
  const delayMs = Math.min(5000 * Math.pow(2, attempt), 600000) // Max 10 minutes
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString()

  const { error } = await supabaseAdmin
    .from('outbox')
    .update({
      status: 'pending',
      attempts: attempt,
      next_attempt_at: nextAttemptAt,
    })
    .eq('id', eventId)

  if (error) {
    console.error('[Outbox] Failed to schedule retry:', error)
    return { status: 'dead_letter', nextAttemptAt: '' }
  }

  return { status: 'retry', nextAttemptAt }
}

/**
 * Get outbox event by ID.
 */
export async function getOutboxEvent(eventId: string): Promise<OutboxEvent | null> {
  const { data, error } = await supabaseAdmin
    .from('outbox')
    .select('*')
    .eq('id', eventId)
    .single()

  if (error || !data) return null

  return mapOutboxRow(data)
}

/**
 * Get outbox events by correlation ID (for tracing a recovery lifecycle).
 */
export async function getOutboxEventsByCorrelation(correlationId: string): Promise<OutboxEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('outbox')
    .select('*')
    .eq('correlation_id', correlationId)
    .order('created_at', { ascending: true })

  if (error || !data) return []

  return data.map(mapOutboxRow)
}

/**
 * Clean up completed events older than specified hours.
 */
export async function cleanupCompletedEvents(olderThanHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()

  const { count, error } = await supabaseAdmin
    .from('outbox')
    .delete()
    .eq('status', 'completed')
    .lt('created_at', cutoff)
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('[Outbox] Failed to cleanup events:', error)
    return 0
  }

  return count || 0
}

function mapOutboxRow(row: any): OutboxEvent {
  return {
    id: row.id,
    causationId: row.causation_id,
    correlationId: row.correlation_id,
    type: row.type,
    version: row.version,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    createdAt: row.created_at,
    nextAttemptAt: row.next_attempt_at,
    attempts: row.attempts,
  }
}
