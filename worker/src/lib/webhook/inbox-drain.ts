// ============================================================
// Webhook inbox consumer — periodic drain + G2 retry/dead routing
// ============================================================
// Claims webhook_inbox rows (migration 100) and applies the frozen
// webhook pipeline. G2 (DLQ) lifecycle:
//
//   queued
//     ↓ claim_next_webhook_events (lease, 5-min)          [DB]
//   processing
//     ├── success → done
//     └── failure
//           ├── attempts < MAX → queued + attempts+1 + available_at=now+backoff
//           └── attempts ≥ MAX → dead                     (manual review only)
//
// - Retry/dead routing is worker-owned. The DB stays generic: the claim RPC
//   never bumps `attempts` and never sees `dead` (it only claims queued, or
//   processing rows whose lease expired). No second queue, no DLQ table —
//   `webhook_inbox.status = 'dead'` IS the DLQ.
// - A requeued row is claimable only when available_at <= now(), so backoff
//   is honored by the claim RPC itself (no worker sleep).
// - `last_error` is retained (trimmed to a 500-char cap) across requeues so
//   ops sees why a row is looping; a successful retry clears it.
// - `dead` is terminal for the drain: nothing re-claims it. Exiting the DLQ
//   is a deliberate manual action: requeueWebhookEvent().
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimedWebhookInboxRow, NormalizedEvent } from '@billzo/shared/whatsapp'
import { createQueueLogger } from '../../../lib/queue-logger'
import { supabaseAdmin } from '../billzo/supabase-admin'
import { createWebhookEventProcessor } from './process-webhook-event'
import type { WebhookEventProcessor } from './process-webhook-event'

const logger = createQueueLogger('webhook')

export interface DrainStats {
  claimed: number
  done: number
  requeued: number
  dead: number
}

export interface WebhookDrainOptions {
  client?: SupabaseClient
  batchSize?: number
  processEvent?: WebhookEventProcessor
}

export const MAX_WEBHOOK_ATTEMPTS = 6
export const WEBHOOK_BACKOFF_BASE_MS = 60_000
export const DEFAULT_WEBHOOK_BATCH_SIZE = 25
export const DEFAULT_WEBHOOK_INTERVAL_MS = 10_000
const LAST_ERROR_CAP = 500

/**
 * Exponential backoff for a completed attempt (1-based): attempt 1 -> base,
 * attempt 2 -> 2x, attempt 3 -> 4x ... attempt 5 -> 16x base. Attempt 6 is
 * the last and routes to dead instead. Bounded: never below base for attempt
 * 1, never unreasonable because the drain deads at MAX_WEBHOOK_ATTEMPTS.
 */
export function backoffDelayMs(attempt: number, baseMs: number = WEBHOOK_BACKOFF_BASE_MS): number {
  const n = Math.max(1, Math.floor(attempt || 0))
  return baseMs * Math.pow(2, n - 1)
}

function trimLastError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.slice(0, LAST_ERROR_CAP)
}

function claimEmptyStats(): DrainStats {
  return { claimed: 0, done: 0, requeued: 0, dead: 0 }
}

/**
 * Route one failed row per G2: requeue with backoff until the 6th failure,
 * then mark dead. Updates attempt/last_error/available_at atomically against
 * the row the RPC already owns (status='processing'), so it can never race
 * another consumer.
 */
async function applyFailure(
  client: SupabaseClient,
  row: ClaimedWebhookInboxRow,
  err: unknown,
): Promise<'requeued' | 'dead'> {
  const lastError = trimLastError(err)
  const attempts = row.attempts + 1

  if (attempts >= MAX_WEBHOOK_ATTEMPTS) {
    logger.error(
      { rowId: row.id, provider_event_id: row.provider_event_id, attempts, err: lastError },
      'webhook event dead after max attempts',
    )
    await client
      .from('webhook_inbox')
      .update({ status: 'dead', attempts, last_error: lastError })
      .eq('id', row.id)
      .eq('status', 'processing')
    return 'dead'
  }

  const availableAt = new Date(Date.now() + backoffDelayMs(attempts)).toISOString()
  logger.warn(
    { rowId: row.id, provider_event_id: row.provider_event_id, attempts, backoffMs: backoffDelayMs(attempts), err: lastError },
    'webhook event requeued with backoff',
  )
  await client
    .from('webhook_inbox')
    .update({ status: 'queued', attempts, available_at: availableAt, last_error: lastError })
    .eq('id', row.id)
    .eq('status', 'processing')
  return 'requeued'
}

/**
 * Claim and process one batch of webhook_inbox rows. Returns aggregate stats.
 * Never throws: claim errors and per-row failures degrade into counts so the
 * interval tick is always safe to run again.
 */
export async function drainWebhookInboxOnce(options: WebhookDrainOptions = {}): Promise<DrainStats> {
  const client = options.client ?? supabaseAdmin
  const batchSize = options.batchSize ?? DEFAULT_WEBHOOK_BATCH_SIZE
  const processEvent = options.processEvent ?? createWebhookEventProcessor(client)

  const { data, error } = await client.rpc('claim_next_webhook_events', { p_limit: batchSize })

  if (error || !Array.isArray(data)) {
    if (error?.message) logger.error({ err: error.message }, 'claim_next_webhook_events failed')
    return claimEmptyStats()
  }

  const claimed = data as ClaimedWebhookInboxRow[]
  if (claimed.length === 0) return claimEmptyStats()

  let done = 0
  let requeued = 0
  let dead = 0

  for (const row of claimed) {
    try {
      await processEvent(row.payload as unknown as NormalizedEvent, row.payload_raw ?? undefined)
      await client
        .from('webhook_inbox')
        .update({ status: 'done', last_error: null })
        .eq('id', row.id)
        .eq('status', 'processing')
      done++
    } catch (err) {
      const outcome = await applyFailure(client, row, err)
      if (outcome === 'dead') dead++
      else requeued++
    }
  }

  logger.info({ claimed: claimed.length, done, requeued, dead }, 'webhook inbox drain complete')
  return { claimed: claimed.length, done, requeued, dead }
}

export interface WebhookInboxDrainHandle {
  stop(): void
}

export interface StartWebhookInboxDrainOptions {
  client?: SupabaseClient
  intervalMs?: number
  batchSize?: number
  processEvent?: WebhookEventProcessor
}

/**
 * Starts the periodic no-overlap poll. Returns a handle whose stop() clears
 * the timer. Mirrors AuthorityOutboxDispatcher's guard pattern: ticks never
 * overlap, and a slow tick simply delays the next one rather than queueing.
 */
export function startWebhookInboxDrain(
  options: StartWebhookInboxDrainOptions = {},
): WebhookInboxDrainHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_WEBHOOK_INTERVAL_MS
  const client = options.client ?? supabaseAdmin
  const processEvent = options.processEvent ?? createWebhookEventProcessor(client)

  let stopped = false
  let draining = false

  const tick = async (): Promise<void> => {
    if (stopped || draining) return
    draining = true
    try {
      await drainWebhookInboxOnce({ client, batchSize: options.batchSize, processEvent })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message }, 'webhook drain tick failed')
    } finally {
      draining = false
    }
  }

  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()

  return {
    stop(): void {
      stopped = true
      clearInterval(timer)
    },
  }
}

export interface WebhookRequeueOptions {
  client?: SupabaseClient
}

/**
 * Manual DLQ review action: requeue one `dead` row with a fresh lifecycle
 * (attempts reset to 0, immediately claimable). Guarded so it only ever
 * resurrects a `dead` row — a processing/done/queued row is left untouched
 * and the call returns false. `last_error` is preserved until the retry
 * succeeds (then the drain clears it), keeping ops forensic visibility.
 * Returns true when the row was actually requeued.
 */
export async function requeueWebhookEvent(
  rowId: string,
  options: WebhookRequeueOptions = {},
): Promise<boolean> {
  const client = options.client ?? supabaseAdmin
  const { data, error } = await client
    .from('webhook_inbox')
    .update({ status: 'queued', attempts: 0, available_at: new Date().toISOString() })
    .eq('id', rowId)
    .eq('status', 'dead')
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error?.message) logger.error({ rowId, err: error.message }, 'webhook requeue failed')
    return false
  }
  logger.info({ rowId }, 'webhook event manually requeued from dead')
  return true
}