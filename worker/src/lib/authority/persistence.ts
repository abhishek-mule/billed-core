import type postgres from 'postgres'
import { canonicalHash } from './hashing'
import type { IntentEnvelope, DeterministicDecision, ExecutionPlan } from './schemas'
import type { PriorityClass } from './schemas'

function toJsonValue(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value))
}

function derivePriorityClass(intent: IntentEnvelope): PriorityClass {
  if (intent.intentType.startsWith('invoice.mark_paid') || intent.intentType.startsWith('payment.reconcile')) {
    return 'critical_financial'
  }
  if (intent.intentType.startsWith('tenant.') || intent.intentType.startsWith('reconciliation.')) {
    return 'tenant_lifecycle'
  }
  if (intent.intentType.startsWith('gstr.')) {
    return 'regulatory'
  }
  if (intent.intentType.startsWith('reminder.')) {
    return 'transport'
  }
  return 'analytics'
}

export class AuthorityPersistence {
  constructor(private readonly sql: postgres.Sql) {}

  async persistAccepted(
    intent: IntentEnvelope,
    decision: DeterministicDecision,
    plan: ExecutionPlan,
  ): Promise<void> {
    const canonicalPayloadHash = canonicalHash(intent.payload)
    const semanticPayloadHash = canonicalHash({ type: intent.intentType, payload: intent.payload })
    const priorityClass = derivePriorityClass(intent)
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO authority_intents (
          intent_id, intent_type, intent_version, tenant_id, actor, source,
          payload, canonical_payload_hash, semantic_payload_hash,
          causation_id, correlation_id, created_at
        ) VALUES (
          ${intent.intentId}, ${intent.intentType}, ${intent.intentVersion},
          ${intent.tenantId}, ${intent.actor}, ${intent.source},
          ${this.sql.json(toJsonValue(intent.payload) as any)},
          ${canonicalPayloadHash}, ${semanticPayloadHash},
          ${intent.causationId}, ${intent.correlationId},
          ${this.sql`NOW()`}
        )
      `

      await tx`
        INSERT INTO authority_decisions (
          intent_id, outcome, decision_reason, policy_snapshot_hash,
          policy_version, created_at
        ) VALUES (
          ${intent.intentId},
          ${decision.outcome},
          ${this.sql.json(toJsonValue(decision.decisionGraph) as any)},
          ${decision.policySnapshotHash},
          ${decision.policyVersion},
          ${this.sql`NOW()`}
        )
      `

      await tx`
        INSERT INTO authority_plans (
          intent_id, execution_plan, plan_hash, plan_compiler_version,
          capability_implementation_hashes, policy_snapshot_hash,
          registry_snapshot_hash, created_at
        ) VALUES (
          ${intent.intentId},
          ${this.sql.json(toJsonValue(plan) as any)},
          ${plan.planHash},
          ${plan.planCompilerVersion},
          ${this.sql.json(toJsonValue(plan.capabilityImplementationHashes) as any)},
          ${plan.policySnapshotHash},
          ${plan.registrySnapshotHash},
          ${this.sql`NOW()`}
        )
      `

      await tx`
        INSERT INTO authority_queue_outbox (
          intent_id, target_queue, payload, priority_class,
          plan_id, created_at
        ) VALUES (
          ${intent.intentId},
          'authority',
          ${this.sql.json(toJsonValue({ intentId: intent.intentId, planHash: plan.planHash }) as any)},
          ${priorityClass},
          (SELECT plan_id FROM authority_plans WHERE intent_id = ${intent.intentId} LIMIT 1),
          ${this.sql`NOW()`}
        )
      `
    })
  }

  async persistRejected(
    intent: IntentEnvelope,
    decision: DeterministicDecision,
  ): Promise<void> {
    const canonicalPayloadHash = canonicalHash(intent.payload)

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO authority_intents (
          intent_id, intent_type, intent_version, tenant_id, actor, source,
          payload, canonical_payload_hash, semantic_payload_hash,
          causation_id, correlation_id, created_at
        ) VALUES (
          ${intent.intentId}, ${intent.intentType}, ${intent.intentVersion},
          ${intent.tenantId}, ${intent.actor}, ${intent.source},
          ${this.sql.json(toJsonValue(intent.payload) as any)},
          ${canonicalPayloadHash},
          ${canonicalPayloadHash},
          ${intent.causationId}, ${intent.correlationId},
          ${this.sql`NOW()`}
        )
      `

      await tx`
        INSERT INTO authority_decisions (
          intent_id, outcome, decision_reason, policy_snapshot_hash,
          policy_version, created_at
        ) VALUES (
          ${intent.intentId},
          ${decision.outcome},
          ${this.sql.json(toJsonValue(decision.decisionGraph) as any)},
          ${decision.policySnapshotHash},
          ${decision.policyVersion},
          ${this.sql`NOW()`}
        )
      `
    })
  }

  async close(): Promise<void> {
    await this.sql.end()
  }
}
