// ============================================================
// Webhook inbox health watch - operator alerts (migration 101)
// ============================================================
// Answers "how do we know something is going wrong?" for the webhook
// pipeline. Runs INDEPENDENTLY of the inbox drain so visibility survives a
// drain-off rollback (WEBHOOK_DRAIN_ENABLED=false) - the queue must stay
// observable exactly when the consumer is switched off.
//
// Alert lifecycle (one ACTIVE row per kind, partial unique index):
//   breach detected  -> insert status='firing'  (fired_at set)
//   still breaching  -> update detail only      (no spam; fired_at preserved)
//   breach clears    -> status='resolved'       (resolved_at set)
// So a healthy queue writes NOTHING; every insert is a real transition.
//
// PII rule: `detail` carries only counts, ages, and opaque row UUIDs. It
// NEVER includes payload, payload_raw, provider_event_id, phone numbers, or
// error text - the full forensic error stays in webhook_inbox.last_error.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createQueueLogger } from '../../../lib/queue-logger'
import { supabaseAdmin } from '../billzo/supabase-admin'

const logger = createQueueLogger('webhook-alerts')

export type WebhookAlertKind = 'dead_rows' | 'retry_storm' | 'queue_stalled' | 'stale_processing'
export type WebhookAlertSeverity = 'info' | 'warning' | 'critical'

export interface InboxHealthMetrics {
  /** webhook_inbox rows stuck in the terminal DLQ */
  deadRows: number
  /** queued rows that have failed >= 3 times (repeated processing failures) */
  queuedAttempting: number
  /** true when the oldest queued row is older than the stall age */
  queuedStalled: boolean
  /** age in seconds of the oldest queued row (0 when none) */
  oldestQueuedAgeSeconds: number
  /** processing rows whose lease expired beyond the grace window (crash loop) */
  staleProcessing: number
  /** opaque row UUIDs only - never provider_event_id/payload/phone */
  staleProcessingSampleIds: string[]
}

export const DEFAULT_WEBHOOK_ALERT_INTERVAL_MS = 60_000
export const RETRY_STORM_MIN_ROWS = 5
export const QUEUE_STALL_MIN_AGE_MS = 30 * 60_000
export const STALE_PROCESSING_GRACE_MS = 10 * 60_000
const STALE_SAMPLE_CAP = 20

export interface WebhookHealthScanOptions {
  retryStormMinRows?: number
  queueStallMinAgeMs?: number
  staleProcessingGraceMs?: number
  now?: number
}

export interface WebhookHealthScanResult {
  metrics: InboxHealthMetrics
  /** set when the schema is not ready (migration 100/101 missing) */
  schemaMissing: boolean
}

type CountResult = { count: number | null; error: { message?: string } | null }

interface KindBreach {
  kind: WebhookAlertKind
  severity: WebhookAlertSeverity
  detail: Record<string, unknown>
}

function schemaMissingError(err: { message?: string } | null): boolean {
  const msg = (err?.message ?? '').toLowerCase()
  return msg.includes('does not exist') || (msg.includes('relation') && msg.includes('not found'))
}

function isEmptyMetrics(): InboxHealthMetrics {
  return {
    deadRows: 0,
    queuedAttempting: 0,
    queuedStalled: false,
    oldestQueuedAgeSeconds: 0,
    staleProcessing: 0,
    staleProcessingSampleIds: [],
  }
}

/**
 * Collect inbox health metrics. Queries are independent so one failure
 * degrades that metric rather than failing the whole scan. A missing
 * webhook_inbox relation (migration 100 not yet applied) is signalled via
 * schemaMissing so the periodic watch can retire itself instead of spamming.
 */
export async function scanWebhookInboxHealth(
  client: SupabaseClient,
  options: WebhookHealthScanOptions = {},
): Promise<WebhookHealthScanResult> {
  const nowMs = options.now ?? Date.now()
  const stallBefore = new Date(nowMs - (options.queueStallMinAgeMs ?? QUEUE_STALL_MIN_AGE_MS)).toISOString()
  const staleBefore = new Date(nowMs - (options.staleProcessingGraceMs ?? STALE_PROCESSING_GRACE_MS)).toISOString()

  const metrics = isEmptyMetrics()
  let schemaMissing = false

  const dead = (await client
    .from('webhook_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'dead')) as CountResult
  if (!dead.error) metrics.deadRows = dead.count ?? 0
  else {
    schemaMissing = schemaMissing || schemaMissingError(dead.error)
    logger.error({ err: dead.error.message }, 'webhook alerts: dead_rows count failed')
  }

  const retry = (await client
    .from('webhook_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .gte('attempts', 3)) as CountResult
  if (!retry.error) metrics.queuedAttempting = retry.count ?? 0
  else {
    schemaMissing = schemaMissing || schemaMissingError(retry.error)
    logger.error({ err: retry.error.message }, 'webhook alerts: retry_storm count failed')
  }

  const oldest = await client
    .from('webhook_inbox')
    .select('available_at')
    .eq('status', 'queued')
    .order('available_at', { ascending: true })
    .limit(1)

  if (!oldest.error) {
    if ((oldest.data as unknown[] | null)?.length) {
      const row = (oldest.data as Array<{ available_at: string }>)[0]
      const oldestAt = new Date(row.available_at).getTime()
      metrics.oldestQueuedAgeSeconds = ageSeconds(oldestAt, nowMs)
      metrics.queuedStalled = oldestAt < nowMs - (options.queueStallMinAgeMs ?? QUEUE_STALL_MIN_AGE_MS)
    }
  } else {
    schemaMissing = schemaMissing || schemaMissingError(oldest.error)
    logger.error({ err: oldest.error.message }, 'webhook alerts: queue_stalled probe failed')
  }

  const stale = (await client
    .from('webhook_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'processing')
    .lt('available_at', staleBefore)) as CountResult
  if (!stale.error) {
    metrics.staleProcessing = stale.count ?? 0
    if (metrics.staleProcessing > 0) {
      const sample = await client
        .from('webhook_inbox')
        .select('id')
        .eq('status', 'processing')
        .lt('available_at', staleBefore)
        .limit(STALE_SAMPLE_CAP)
      if (!sample.error) {
        metrics.staleProcessingSampleIds = (sample.data as Array<{ id: string }> | null)?.map((r) => r.id) ?? []
      }
    }
  } else {
    schemaMissing = schemaMissing || schemaMissingError(stale.error)
    logger.error({ err: stale.error.message }, 'webhook alerts: stale_processing count failed')
  }

  return { metrics, schemaMissing }
}

function ageSeconds(from: number, to: number): number {
  return Math.max(0, Math.round((to - from) / 1000))
}

function buildDetail(metrics: InboxHealthMetrics): Record<string, unknown> {
  return {
    metrics: {
      dead_rows: metrics.deadRows,
      queued_attempting: metrics.queuedAttempting,
      queued_stalled: metrics.queuedStalled,
      oldest_queued_age_s: metrics.oldestQueuedAgeSeconds,
      stale_processing: metrics.staleProcessing,
    },
    sample_row_ids: metrics.staleProcessingSampleIds.slice(0, STALE_SAMPLE_CAP),
  }
}

/**
 * Evaluate health metrics into the set of currently-breached alert kinds.
 * Empty array = healthy. Pure: no DB access.
 */
export function classifyBreaches(metrics: InboxHealthMetrics, options: WebhookHealthScanOptions = {}): KindBreach[] {
  const breaches: KindBreach[] = []

  if (metrics.deadRows > 0) {
    breaches.push({ kind: 'dead_rows', severity: 'critical', detail: buildDetail(metrics) })
  }
  if (metrics.queuedAttempting >= (options.retryStormMinRows ?? RETRY_STORM_MIN_ROWS)) {
    breaches.push({ kind: 'retry_storm', severity: 'warning', detail: buildDetail(metrics) })
  }
  if (metrics.queuedStalled) {
    breaches.push({ kind: 'queue_stalled', severity: 'warning', detail: buildDetail(metrics) })
  }
  if (metrics.staleProcessing > 0) {
    breaches.push({ kind: 'stale_processing', severity: 'warning', detail: buildDetail(metrics) })
  }

  return breaches
}

export interface AlertReconcileSummary {
  fire: WebhookAlertKind[]
  update: WebhookAlertKind[]
  resolve: WebhookAlertKind[]
}

/**
 * Reconcile the current breaches against the DB's active alerts: fire new
 * ones, refresh details of still-firing ones, resolve cleared ones. Returns
 * the per-kind transitions so callers can log at the right level.
 */
export async function reconcileWebhookAlerts(
  client: SupabaseClient,
  breaches: KindBreach[],
  nowMs = Date.now(),
): Promise<AlertReconcileSummary> {
  const summary: AlertReconcileSummary = { fire: [], update: [], resolve: [] }

  const active = await client.from('webhook_inbox_alerts').select('kind').is('resolved_at', null)
  if (active.error) {
    logger.error({ err: active.error.message }, 'webhook alerts: loading active alerts failed')
    return summary
  }

  const activeKinds = new Set((active.data as Array<{ kind: WebhookAlertKind }> | null)?.map((a) => a.kind) ?? [])
  const breachedKinds = new Set(breaches.map((b) => b.kind))

  for (const breach of breaches) {
    const body = {
      kind: breach.kind,
      severity: breach.severity,
      status: 'firing',
      detail: breach.detail,
      updated_at: new Date(nowMs).toISOString(),
    }

    if (activeKinds.has(breach.kind)) {
      const res = await client
        .from('webhook_inbox_alerts')
        .update({ detail: breach.detail, severity: breach.severity, updated_at: body.updated_at })
        .eq('kind', breach.kind)
        .is('resolved_at', null)
      if (res.error) logger.error({ kind: breach.kind, err: res.error.message }, 'webhook alerts: refresh failed')
      else summary.update.push(breach.kind)
    } else {
      const firedAt = new Date(nowMs).toISOString()
      const res = await client.from('webhook_inbox_alerts').insert({
        kind: breach.kind,
        severity: breach.severity,
        status: 'firing',
        detail: breach.detail,
        fired_at: firedAt,
        created_at: firedAt,
        updated_at: firedAt,
      })
      if (res.error) logger.error({ kind: breach.kind, err: res.error.message }, 'webhook alerts: fire insert failed')
      else summary.fire.push(breach.kind)
    }
  }

  for (const kind of activeKinds) {
    if (breachedKinds.has(kind)) continue
    const res = await client
      .from('webhook_inbox_alerts')
      .update({ status: 'resolved', resolved_at: new Date(nowMs).toISOString() })
      .eq('kind', kind)
      .is('resolved_at', null)
    if (!res.error) summary.resolve.push(kind)
  }

  return summary
}

export interface WebhookAlertCheckOptions {
  client: SupabaseClient
  retryStormMinRows?: number
  queueStallMinAgeMs?: number
  staleProcessingGraceMs?: number
  now?: number
}

/**
 * One health-check pass: scan metrics -> classify breaches -> reconcile
 * alert rows -> log transitions. Never throws; schema-missing is surfaced so
 * callers can retire the watch when migration 101 is absent.
 */
export async function runWebhookAlertCheckOnce(options: WebhookAlertCheckOptions): Promise<WebhookHealthScanResult> {
  const { client, ...scanOptions } = options
  const scan = await scanWebhookInboxHealth(client, scanOptions)
  if (scan.schemaMissing) return scan

  const breaches = classifyBreaches(scan.metrics, scanOptions)
  const summary = await reconcileWebhookAlerts(client, breaches, scanOptions.now ?? Date.now())

  for (const kind of summary.fire) {
    logger.error({ kind }, 'webhook inbox alert FIRING')
  }
  for (const kind of summary.update) {
    logger.error({ kind }, 'webhook inbox alert still firing (detail refreshed)')
  }
  for (const kind of summary.resolve) {
    logger.info({ kind }, 'webhook inbox alert resolved')
  }

  if (breaches.length === 0) {
    logger.debug({ metrics: scan.metrics }, 'webhook inbox healthy')
  }
  return scan
}

export interface WebhookAlertWatchHandle {
  stop(): void
}

export interface StartWebhookAlertWatchOptions {
  client?: SupabaseClient
  intervalMs?: number
  retryStormMinRows?: number
  queueStallMinAgeMs?: number
  staleProcessingGraceMs?: number
}

/**
 * Periodic health watch over the webhook inbox. Deliberately independent of
 * the drain: it must keep working while WEBHOOK_DRAIN_ENABLED=false so a
 * rollback stays observable. Retires itself (permanently stops ticking) if
 * the migration-101 relation is missing, so an early merge cannot spam errors.
 */
export function startWebhookInboxHealthWatch(
  options: StartWebhookAlertWatchOptions = {},
): WebhookAlertWatchHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_WEBHOOK_ALERT_INTERVAL_MS
  const client = options.client ?? supabaseAdmin
  const scanOptions = {
    retryStormMinRows: options.retryStormMinRows,
    queueStallMinAgeMs: options.queueStallMinAgeMs,
    staleProcessingGraceMs: options.staleProcessingGraceMs,
  }

  let stopped = false
  let ticking = false

  const tick = async (): Promise<void> => {
    if (stopped || ticking) return
    ticking = true
    try {
      const scan = await runWebhookAlertCheckOnce({ client, ...scanOptions })
      if (scan.schemaMissing && !stopped) {
        stopped = true
        logger.error({}, 'webhook alerts: webhook_inbox schema missing - watch retired (migration 100/101 not applied)')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message }, 'webhook alert tick failed')
    } finally {
      ticking = false
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()

  return {
    stop(): void {
      stopped = true
      clearInterval(timer)
    },
  }
}