import type { ProjectionDelta, BehavioralObservation, ExperimentAssignment } from '@billzo/shared'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { materializeObservation } from '../src/lib/billzo/behavioral-materializer'
import { interpretProjectionDelta } from '../src/lib/billzo/observation-interpreter'

// ============================================================
// REPLAY ENGINE — Behavioral Profile Replay
// ============================================================
// Rebuilds a customer's behavioral profile deterministically.
//
// Three modes:
//   materialize      — replay existing behavioral.observation events
//                      (for decay bug fixes, accumulator fixes, profile rebuilds)
//   reinterpret      — replay raw projection.delta events through CURRENT
//                      interpreter rules, then materialize
//                      (for confidence heuristic changes, new observation types)
//   counterfactual   — replay with experiment context for offline policy evaluation
//                      (pass-through for now; no production logic yet)
//
// Invariants:
//   - Same mode + same events → identical materialized state
//   - No orchestration decisions depend on a non-replayable signal
//   - schema_version increments when semantic interpretation changes
// ============================================================

type ReplayMode = 'materialize' | 'reinterpret' | 'counterfactual'

interface ReplayContext {
  experimentAssignments?: ExperimentAssignment[]
  evaluationMode?: 'materialize' | 'reinterpret' | 'counterfactual'
}

interface ReplayOptions {
  tenantId: string
  customerId: string
  fromTimestamp: Date
  mode: ReplayMode
  context?: ReplayContext
}

const SCHEMA_VERSION = 1

async function replayBehavioralProfile(options: ReplayOptions): Promise<{
  observationsReplayed: number
  mode: ReplayMode
  success: boolean
}> {
  const { tenantId, customerId, fromTimestamp, mode, context } = options

  // Phase 1: Wipe existing materialized state
  await clearProfile(tenantId, customerId)

  let observations: BehavioralObservation[] = []

  if (mode === 'counterfactual') {
    // Counterfactual mode is a pass-through for now.
    // The context.experimentAssignments hook exists for future offline
    // policy evaluation and shadow orchestration.
    // Currently falls through to materialize mode.
    console.log(`[Replay] Counterfactual mode requested for ${customerId}`)
    if (context?.experimentAssignments?.length) {
      console.log(`[Replay]   with ${context.experimentAssignments.length} experiment assignments`)
    }
  }

  if (mode === 'materialize' || mode === 'counterfactual') {
    // Replay existing observations
    observations = await loadExistingObservations(tenantId, customerId, fromTimestamp)
  } else if (mode === 'reinterpret') {
    // Replay raw projection deltas through current interpreter
    const deltas = await loadProjectionDeltas(tenantId, customerId, fromTimestamp)
    observations = deltas
      .map(d => interpretProjectionDelta(d))
      .filter((o): o is BehavioralObservation => o !== null)
  }

  // Phase 2: Replay observations in chronological order
  observations.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

  for (const observation of observations) {
    await materializeObservation(observation)
  }

  return {
    observationsReplayed: observations.length,
    mode,
    success: true,
  }
}

async function clearProfile(tenantId: string, customerId: string): Promise<void> {
  await supabaseAdmin
    .from('customer_behavioral_metrics')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)

  await supabaseAdmin
    .from('customer_liquidity_windows')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
}

async function loadExistingObservations(
  tenantId: string,
  customerId: string,
  fromTimestamp: Date,
): Promise<BehavioralObservation[]> {
  const { data } = await supabaseAdmin
    .from('outbox')
    .select('payload')
    .eq('type', 'behavioral.observation')
    .eq('tenant_id', tenantId)
    .gte('created_at', fromTimestamp.toISOString())
    .order('created_at', { ascending: true })

  if (!data) return []

  return data
    .map((row) => row.payload as BehavioralObservation)
    .filter((o) => o.customerId === customerId)
}

async function loadProjectionDeltas(
  tenantId: string,
  customerId: string,
  fromTimestamp: Date,
): Promise<ProjectionDelta[]> {
  const { data } = await supabaseAdmin
    .from('projection_delta_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .gte('occurred_at', fromTimestamp.toISOString())
    .order('occurred_at', { ascending: true })

  if (!data) return []

  return data.map((row) => ({
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id,
    billzoMessageId: row.billzo_message_id,
    transportState: row.transport_state,
    deliveryHealth: row.delivery_health,
    prevTransportState: row.prev_transport_state,
    prevDeliveryHealth: row.prev_delivery_health,
    occurredAt: row.occurred_at,
    prevOccurredAt: null,
  }))
}

// ============================================================
// CLI ENTRY POINT
// ============================================================
// Usage:
//   npx ts-node scripts/replay-behavioral-profile.ts \
//     --tenantId=<uuid> --customerId=<uuid> --mode=materialize
//
// For production, call via:
//   pnpm replay-profile --tenantId=xxx --customerId=xxx --mode=materialize

async function main(): Promise<void> {
  const args = process.argv.slice(2).reduce<Record<string, string>>((acc, arg) => {
    const [key, val] = arg.replace('--', '').split('=')
    acc[key] = val
    return acc
  }, {})

  const tenantId = args.tenantId
  const customerId = args.customerId
  const mode = (args.mode as ReplayMode) || 'materialize'
  const fromDays = parseInt(args.fromDays || '30', 10)

  if (!tenantId || !customerId) {
    console.error('Usage: --tenantId=<uuid> --customerId=<uuid> [--mode=materialize|reinterpret] [--fromDays=30]')
    process.exit(1)
  }

  const fromTimestamp = new Date(Date.now() - fromDays * 24 * 60 * 60 * 1000)

  console.log(`[Replay] Starting ${mode} replay for customer ${customerId} (${fromDays}d back)`)
  console.log(`[Replay] Wiping existing profile data...`)

  const result = await replayBehavioralProfile({
    tenantId,
    customerId,
    fromTimestamp,
    mode,
  })

  console.log(`[Replay] Complete: ${result.observationsReplayed} observations replayed in ${result.mode} mode`)
  console.log(`[Replay] Profile can now be inspected with inspect-behavioral-profile.ts`)
}

// Allow running as script or importing as module
if (require.main === module) {
  main().catch(console.error)
}

export { replayBehavioralProfile, type ReplayOptions, type ReplayMode, type ReplayContext }
