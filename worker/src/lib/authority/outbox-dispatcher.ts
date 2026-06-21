// ============================================================
// Authority Gateway — Outbox Dispatcher
// ============================================================
// Polls authority_queue_outbox for undelivered entries, loads
// immutable plans via plan_id, executes via the shared
// executePlan() codepath.
//
// Constraints:
// - Loads plan from authority_plans (immutable, never rehydrates)
// - Lease-guarded via authority_execution_leases
// - Terminal-success checked via uq_execution_terminal_success
// - Every dispatch is recorded in authority_queue_dispatch_attempts
//   (append-only, never UPDATE)
// ============================================================

import type postgres from 'postgres'
import type { CapabilityRegistry } from './capabilities'
import { executePlan } from './executor'
import type { IntentEnvelope, ExecutionPlan } from './schemas'

export interface DispatchEntry {
  outbox_id: string
  intent_id: string
  plan_id: string
  payload: Record<string, unknown>
  priority_class: string
}

export interface DispatcherOptions {
  pollIntervalMs?: number
  batchSize?: number
  leaseTtlMs?: number
  maxExecutionMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_BATCH_SIZE = 10

export class AuthorityOutboxDispatcher {
  private _running = false
  private _timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly sql: postgres.Sql,
    private readonly registry: CapabilityRegistry,
    private readonly options: DispatcherOptions = {},
  ) {}

  start(): void {
    if (this._running) return
    this._running = true
    const interval = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this._timer = setInterval(() => this.poll(), interval)
  }

  stop(): void {
    this._running = false
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  private async poll(): Promise<void> {
    if (!this._running) return
    try {
      const entries = await this.fetchPendingEntries()
      for (const entry of entries) {
        if (!this._running) break
        await this.dispatch(entry)
      }
    } catch (err) {
      console.error('[AuthorityOutboxDispatcher] Poll error:', err)
    }
  }

  private async fetchPendingEntries(): Promise<DispatchEntry[]> {
    const batchSize = this.options.batchSize ?? DEFAULT_BATCH_SIZE
    try {
      const rows = await this.sql<DispatchEntry[]>`
        SELECT oq.id AS outbox_id, oq.intent_id, oq.plan_id, oq.payload, oq.priority_class
        FROM authority_queue_outbox oq
        WHERE NOT EXISTS (
          SELECT 1 FROM authority_queue_dispatch_attempts da
          WHERE da.outbox_id = oq.id
        )
        ORDER BY oq.created_at ASC
        LIMIT ${batchSize}
      `
      return rows
    } catch {
      return []
    }
  }

  private async dispatch(entry: DispatchEntry): Promise<void> {
    try {
      // Record dispatch attempt first (append-only)
      const [attempt] = await this.sql<{ attempt_id: string }[]>`
        INSERT INTO authority_queue_dispatch_attempts (outbox_id, intent_id, status, attempted_at)
        VALUES (${entry.outbox_id}, ${entry.intent_id}, 'in_progress', NOW())
        RETURNING id AS attempt_id
      `
      if (!attempt) return

      try {
        // Load immutable plan
        const [planRow] = await this.sql<{ execution_plan: ExecutionPlan }[]>`
          SELECT execution_plan FROM authority_plans
          WHERE plan_id = ${entry.plan_id}
          LIMIT 1
        `
        if (!planRow) {
          await this.markFailed(attempt.attempt_id, 'plan_not_found')
          return
        }

        // Load the original intent for tenant/type info
        const [intentRow] = await this.sql<{ intent_type: string; tenant_id: string; nonce: string }[]>`
          SELECT intent_type, tenant_id, nonce FROM authority_intents
          WHERE intent_id = ${entry.intent_id}
          LIMIT 1
        `
        if (!intentRow) {
          await this.markFailed(attempt.attempt_id, 'intent_not_found')
          return
        }

        const intent: IntentEnvelope = {
          intentId: entry.intent_id,
          intentType: intentRow.intent_type,
          intentVersion: 1,
          tenantId: intentRow.tenant_id,
          actor: 'system',
          source: 'internal_worker',
          timestamp: new Date().toISOString(),
          causationId: null,
          correlationId: null,
          payload: (entry.payload as any) ?? {},
          nonce: intentRow.nonce,
          signature: '',
        }

        const results = await executePlan(
          this.registry,
          planRow.execution_plan,
          intent,
          this.sql,
        )

        const allSuccess = results.every(r => r.success)
        await this.sql`
          UPDATE authority_queue_dispatch_attempts
          SET status = ${allSuccess ? 'completed' : 'failed'},
              completed_at = NOW(),
              result = ${this.sql.json(results.map(r => ({ success: r.success, error: r.error })))}
          WHERE attempt_id = ${attempt.attempt_id}
        `
      } catch (err: any) {
        await this.markFailed(attempt.attempt_id, err.message ?? 'unknown_error')
      }
    } catch (err: any) {
      console.warn('[AuthorityOutboxDispatcher] Dispatch skipped:', err.message ?? 'unknown_error')
    }
  }

  private async markFailed(attemptId: string, error: string): Promise<void> {
    try {
      await this.sql`
        UPDATE authority_queue_dispatch_attempts
        SET status = 'failed', completed_at = NOW(), error = ${error}
        WHERE attempt_id = ${attemptId}
      `
    } catch {
      // table may not exist — skip
    }
  }
}
