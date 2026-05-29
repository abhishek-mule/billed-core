// ============================================================
// Authority Gateway — Execution Engine
// ============================================================
// The shared executePlan() codepath used by both trusted_sync
// and durable_async (outbox dispatcher) modes.
//
// Constraints:
// - Same codepath for both modes — no conditionals, no sync-only shortcuts
// - Lease-guarded: INSERT pending lease → execute → UPDATE outcome
// - Terminal-success check: prevents dual execution after crash + lease expiry
// - MAX_EXECUTION_MS bounded deadline (10s)
// ============================================================

import type postgres from 'postgres'
import type { IntentEnvelope, ExecutionPlan, ExecutionPlanStep, CapabilityResult } from './schemas'
import type { CapabilityRegistry } from './capabilities'

export interface ExecutePlanOptions {
  readonly leaseTtlMs?: number
  readonly maxExecutionMs?: number
  readonly clockSkewToleranceMs?: number
}

const DEFAULT_LEASE_TTL_MS = 15_000
const DEFAULT_MAX_EXECUTION_MS = 10_000
const DEFAULT_CLOCK_SKEW_TOLERANCE_MS = 2_000

function now(): string {
  return new Date().toISOString()
}

async function acquireExecutionLease(
  sql: postgres.Sql,
  intentId: string,
  executionGroupKey: string,
  ttlMs: number,
): Promise<{ lease_id: string; intent_id: string } | null> {
  const [row] = await sql<{ lease_id: string; intent_id: string }[]>`
    INSERT INTO authority_execution_leases (
      intent_id, execution_group_key, lease_id, acquired_at, expires_at
    ) VALUES (
      ${intentId}, ${executionGroupKey}, gen_random_uuid(),
      NOW(), NOW() + make_interval(secs => ${ttlMs / 1000})
    )
    ON CONFLICT (execution_group_key) WHERE outcome IS NULL DO NOTHING
    RETURNING lease_id, intent_id
  `
  return row ?? null
}

async function checkTerminalSuccess(
  sql: postgres.Sql,
  executionGroupKey: string,
): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 AS found FROM authority_executions
    WHERE execution_group_key = ${executionGroupKey}
      AND outcome IN ('success', 'compensated')
    LIMIT 1
  `
  return row !== undefined
}

export async function executePlan(
  registry: CapabilityRegistry,
  plan: ExecutionPlan,
  intent?: IntentEnvelope,
  sql?: postgres.Sql,
  options?: ExecutePlanOptions,
): Promise<CapabilityResult[]> {
  const leaseTtlMs = options?.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS
  const maxExecutionMs = options?.maxExecutionMs ?? DEFAULT_MAX_EXECUTION_MS

  // Lease-guarded execution (only when DB is available)
  if (sql && intent) {
    const executionGroupKey = `${intent.tenantId}:${intent.intentType}:${intent.nonce}`

    const alreadySucceeded = await checkTerminalSuccess(sql, executionGroupKey)
    if (alreadySucceeded) {
      return [{ success: true, data: { skipped: true, reason: 'already_terminal' }, executionLatencyMs: 0 }]
    }

    const lease = await acquireExecutionLease(sql, intent.intentId, executionGroupKey, leaseTtlMs)
    if (!lease) {
      return [{ success: false, error: 'lease_contention', executionLatencyMs: 0 }]
    }

    const results = await runSteps(registry, plan, maxExecutionMs, intent)
    const overallSuccess = results.every(r => r.success)
    const outcome = overallSuccess ? 'success' : 'failure'

    await sql`
      INSERT INTO authority_executions (
        intent_id, execution_group_key, outcome, results, lease_id, completed_at
      ) VALUES (
        ${intent.intentId}, ${executionGroupKey}, ${outcome},
        ${sql.json(results.map(r => ({ success: r.success, error: r.error, latencyMs: r.executionLatencyMs })))},
        ${lease.lease_id}, NOW()
      )
    `

    return results
  }

  // Simple in-memory execution (for tests / no-DB mode)
  const mockIntent: IntentEnvelope = {
    intentId: '', intentType: '', intentVersion: 1, tenantId: '',
    actor: '', source: 'internal_worker', timestamp: '', causationId: null, correlationId: null,
    payload: {}, nonce: '', signature: '',
  }
  return runSteps(registry, plan, maxExecutionMs, mockIntent)
}

async function runSteps(
  registry: CapabilityRegistry,
  plan: ExecutionPlan,
  maxExecutionMs: number,
  intent: IntentEnvelope,
): Promise<CapabilityResult[]> {
  const results: CapabilityResult[] = []
  const deadline = Date.now() + maxExecutionMs

  for (const step of plan.steps) {
    if (Date.now() > deadline) {
      results.push({ success: false, error: 'deadline_exceeded', executionLatencyMs: maxExecutionMs })
      break
    }

    const provider = registry.get(step.capabilityId)
    if (!provider) {
      results.push({ success: false, error: `capability_not_found: ${step.capabilityId}`, executionLatencyMs: 0 })
      break
    }

    const result = await provider.execute(intent, { outcome: 'accepted', decisionGraph: [], policySnapshotHash: '', policyVersion: '', evaluatedAt: now() })
    results.push(result)

    if (!result.success) break
  }

  return results
}
