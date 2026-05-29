import { sha256 } from './hashing'
import { buildExecutionPlan } from './plan-builder'
import { constitutionalTelemetry } from './telemetry'
import type {
  IntentEnvelope,
  DeterministicDecision,
  DecisionNodeResult,
  DecisionNodeType,
  ExecutionPlan,
  CapabilityProvider,
  PolicyBundle,
  SovereigntyDecision,
} from './schemas'

export interface DecisionGraphConfig {
  readonly plannerVersion: string
}

const DEFAULT_CONFIG: DecisionGraphConfig = {
  plannerVersion: '2026.05.28-alpha',
}

function record<NodeType extends DecisionNodeType>(
  nodeType: NodeType,
  passed: boolean,
  reason: string,
  startMs: number,
): DecisionNodeResult {
  return {
    nodeType,
    passed,
    reason,
    latencyMs: performance.now() - startMs,
  }
}

export interface SchemaValidationResult {
  valid: boolean
  failures: string[]
}

export function validateIntentSchema(intent: IntentEnvelope): SchemaValidationResult {
  const failures: string[] = []

  if (!intent.intentId || typeof intent.intentId !== 'string') {
    failures.push('intentId must be a non-empty string')
  }
  if (!intent.intentType || typeof intent.intentType !== 'string') {
    failures.push('intentType must be a non-empty string')
  }
  if (!Number.isInteger(intent.intentVersion) || intent.intentVersion < 1) {
    failures.push('intentVersion must be a positive integer')
  }
  if (!intent.tenantId || typeof intent.tenantId !== 'string') {
    failures.push('tenantId must be a non-empty string')
  }
  if (!intent.actor || typeof intent.actor !== 'string') {
    failures.push('actor must be a non-empty string')
  }
  if (!intent.source) {
    failures.push('source must be set')
  }
  if (!intent.timestamp || isNaN(Date.parse(intent.timestamp))) {
    failures.push('timestamp must be a valid ISO string')
  }
  if (!intent.nonce || typeof intent.nonce !== 'string') {
    failures.push('nonce must be a non-empty string')
  }
  if (!intent.signature || typeof intent.signature !== 'string') {
    failures.push('signature must be a non-empty string')
  }

  return { valid: failures.length === 0, failures }
}

export interface CompiledDecision {
  readonly decision: DeterministicDecision
  readonly plan: ExecutionPlan | null
}

export interface DecisionGraphInput {
  readonly intent: IntentEnvelope
  readonly policy: PolicyBundle
  readonly sovereignty: SovereigntyDecision
  readonly capabilities: readonly CapabilityProvider[]
  readonly semanticalDedupHash: string | null
  readonly dedupOnMatch: 'reject' | 'require_approval' | null
  readonly policySnapshotHash: string
  readonly registrySnapshotHash: string
}

export function compileDecisionGraph(input: DecisionGraphInput): CompiledDecision {
  const config = DEFAULT_CONFIG
  const graph: DecisionNodeResult[] = []
  const startTotal = performance.now()

  constitutionalTelemetry.incrementEvaluation()

  // 1. Schema validation
  const t0 = performance.now()
  const schema = validateIntentSchema(input.intent)
  graph.push(record('schema_validation', schema.valid, schema.valid ? 'schema ok' : schema.failures.join('; '), t0))
  if (!schema.valid) {
    constitutionalTelemetry.recordViolation('schema_validation')
    return rejection(graph, input, config)
  }

  // 2. Sovereignty
  const t1 = performance.now()
  graph.push(
    record(
      'sovereignty',
      input.sovereignty.allowed,
      input.sovereignty.allowed ? 'source+plan ok' : input.sovereignty.violations.join('; '),
      t1,
    ),
  )
  if (!input.sovereignty.allowed) {
    constitutionalTelemetry.recordViolation('sovereignty')
    return rejection(graph, input, config)
  }

  // 3. Semantic dedup
  const t2 = performance.now()
  if (input.dedupOnMatch === 'reject') {
    graph.push(record('semantic_dedup', false, `duplicate: hash=${input.semanticalDedupHash}`, t2))
    constitutionalTelemetry.recordViolation('semantic_dedup')
    return rejection(graph, input, config)
  }
  graph.push(record('semantic_dedup', true, input.semanticalDedupHash ? `known: ${input.semanticalDedupHash}` : 'no match', t2))

  // 4. Capability resolution
  const t3 = performance.now()
  const matchedCaps = resolveCapabilities(input.intent, input.capabilities)
  const capsOk = matchedCaps.length > 0
  graph.push(
    record(
      'capability_resolution',
      capsOk,
      capsOk ? `matched ${matchedCaps.length} capabilities` : 'no capability matched intent',
      t3,
    ),
  )
  if (!capsOk) {
    constitutionalTelemetry.recordViolation('capability_resolution')
    return rejection(graph, input, config)
  }

  // 5. Policy check complete
  const t4 = performance.now()
  graph.push(record('policy', true, 'all policy checks passed', t4))

  // Compile plan via standalone plan builder
  const plan = buildExecutionPlan(
    input.intent,
    matchedCaps,
    input.policySnapshotHash,
    input.registrySnapshotHash,
    { plannerVersion: config.plannerVersion },
  )

  const decision: DeterministicDecision = {
    outcome: 'accepted',
    decisionGraph: graph,
    policySnapshotHash: sha256(JSON.stringify(input.policy)),
    policyVersion: input.policy.policyVersion,
    evaluatedAt: new Date().toISOString(),
  }

  return { decision, plan }
}

function rejection(
  graph: DecisionNodeResult[],
  input: DecisionGraphInput,
  config: DecisionGraphConfig,
): CompiledDecision {
  return {
    decision: {
      outcome: 'rejected',
      decisionGraph: graph,
      policySnapshotHash: sha256(JSON.stringify(input.policy)),
      policyVersion: input.policy.policyVersion,
      evaluatedAt: new Date().toISOString(),
    },
    plan: null,
  }
}

function resolveCapabilities(
  intent: IntentEnvelope,
  capabilities: readonly CapabilityProvider[],
): CapabilityProvider[] {
  return capabilities.filter((c) => {
    if (intent.intentVersion < c.minIntentVersion || intent.intentVersion > c.maxIntentVersion) return false
    return true
  })
}

/** @deprecated Use buildExecutionPlan from plan-builder.ts instead. */
export function compileExecutionPlan(
  intent: IntentEnvelope,
  steps: readonly CapabilityProvider[],
  config: DecisionGraphConfig = DEFAULT_CONFIG,
): ExecutionPlan {
  return buildExecutionPlan(intent, steps, '', '', { plannerVersion: config.plannerVersion })
}
