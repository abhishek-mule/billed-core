// ============================================================
// Authority Gateway — Immutable Type Definitions
// ============================================================
// Compiler-enforced immutability via Readonly<> and readonly.
// Replay determinism requires that no authority-domain object
// is mutated after creation.
// ============================================================

// --- Enums / Literal Unions ---

export type IntentSource = 'n8n' | 'n8n_prod' | 'frappe' | 'admin' | 'worker' | 'app' | 'internal_worker' | 'provisioning_sidecar'

export type PriorityClass =
  | 'critical_financial'
  | 'regulatory'
  | 'tenant_lifecycle'
  | 'transport'
  | 'analytics'

export type ExecutionPhase = 'forward' | 'compensation' | 'recovery' | 'manual_replay' | 'shadow'

export type DecisionOutcome = 'accepted' | 'rejected'

export type ExecutionOutcome = 'success' | 'failure' | 'pending' | 'compensated'

export type CapabilityClassification =
  | 'transport'
  | 'financial'
  | 'regulatory'
  | 'infrastructure'
  | 'destructive'

export type Reversibility = 'reversible' | 'irreversible'

export type BlastRadius = 'tenant' | 'system' | 'external'

// --- Core Envelope ---

export interface IntentEnvelope {
  readonly intentId: string
  readonly intentType: string
  readonly intentVersion: number
  readonly tenantId: string
  readonly actor: string
  readonly source: IntentSource
  readonly timestamp: string
  readonly causationId: string | null
  readonly correlationId: string | null
  readonly payload: Readonly<Record<string, unknown>>
  readonly nonce: string
  readonly signature: string
}

// --- Policy ---

export interface SovereigntyRule {
  readonly intent: string
  readonly allowedSources: readonly string[]
  readonly allowedPlans?: readonly string[]
  readonly rateLimit?: Readonly<{
    readonly perSecond?: number
    readonly perMinute?: number
    readonly perHour?: number
    readonly perTenantPerDay?: number
  }>
  readonly requiredCapabilities?: readonly string[]
  readonly maxIntentVersion?: number
  readonly minIntentVersion?: number
}

export interface PolicyBundle {
  readonly policyVersion: string
  readonly rules: readonly SovereigntyRule[]
}

// --- Decision Graph ---

export type DecisionNodeType =
  | 'schema_validation'
  | 'signature'
  | 'sovereignty'
  | 'policy'
  | 'replay'
  | 'semantic_dedup'
  | 'capability_resolution'

export interface DecisionNodeResult {
  readonly nodeType: DecisionNodeType
  readonly passed: boolean
  readonly reason: string
  readonly latencyMs: number
}

export interface DeterministicDecision {
  readonly outcome: DecisionOutcome
  readonly decisionGraph: readonly DecisionNodeResult[]
  readonly policySnapshotHash: string
  readonly policyVersion: string
  readonly evaluatedAt: string
}

// --- Execution Plan ---

export interface ExecutionPlanStep {
  readonly capabilityId: string
  readonly order: number
  readonly compensatable: boolean
  readonly requiresApproval: boolean
  readonly priorityClass: PriorityClass
  readonly implementationHash: string
  readonly input: Readonly<Record<string, unknown>>
}

export interface ExecutionPlan {
  readonly intentId: string
  readonly planHash: string
  readonly planCompilerVersion: string
  readonly steps: readonly ExecutionPlanStep[]
  readonly capabilityImplementationHashes: Readonly<Record<string, string>>
  readonly policySnapshotHash: string
  readonly registrySnapshotHash: string
}

// --- Capability System ---

export interface OwnedMutation {
  readonly table: string
  readonly columns?: readonly string[]
}

export interface CapabilityProvider {
  readonly capabilityId: string
  readonly classification: CapabilityClassification
  readonly reversibility: Reversibility
  readonly blastRadius: BlastRadius
  readonly priorityClass: PriorityClass
  readonly estimatedCost: 'negligible' | 'low' | 'medium' | 'high'
  readonly estimatedLatencyMs: number
  readonly externalDependencyCount: number
  readonly requiresApproval: boolean
  readonly compensatable: boolean
  readonly minIntentVersion: number
  readonly maxIntentVersion: number
  readonly ownedMutations: readonly OwnedMutation[]
  readonly execute: (
    intent: IntentEnvelope,
    decision: DeterministicDecision,
  ) => Promise<CapabilityResult>
  readonly compensate?: (
    intent: IntentEnvelope,
    result: CapabilityResult,
  ) => Promise<CompensationResult>
  readonly semanticNormalizer?: (payload: Readonly<Record<string, unknown>>) => Record<string, unknown>
}

export interface CapabilityResult {
  readonly success: boolean
  readonly data?: Readonly<Record<string, unknown>>
  readonly error?: string
  readonly executionLatencyMs: number
}

export interface CompensationResult {
  readonly success: boolean
  readonly error?: string
}

// --- Semantic Dedup ---

export interface SemanticDedupRule {
  readonly capabilityId: string
  readonly windowMinutes: number
  readonly matchFields: readonly ('payload_hash' | 'tenant_id' | 'source' | 'actor')[]
  readonly onMatch: 'reject' | 'require_approval'
}

// --- Gateway Output ---

export interface AuthorityResult {
  readonly accepted: boolean
  readonly intentId: string
  readonly decisionId: string | null
  readonly decision: DeterministicDecision | null
  readonly error?: string
  readonly plan?: ExecutionPlan
}

// --- Sovereignty Evaluation ---

export interface SovereigntyDecision {
  readonly allowed: boolean
  readonly matchedRuleIndex: number
  readonly violations: readonly string[]
}

// --- Rate Limit State ---

export interface RateLimitState {
  readonly currentPerSecond: number
  readonly currentPerMinute: number
  readonly currentPerHour: number
  readonly currentPerTenantPerDay: number
}
