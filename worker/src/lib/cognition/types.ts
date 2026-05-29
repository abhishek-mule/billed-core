export interface AttentionItem {
  id: string
  tenantId: string
  situationId: string | null
  intentType: string
  entityType: string
  entityId: string
  priorityScore: number
  urgency: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  signalData: Record<string, unknown>
  correlationKey: string | null
  createdAt: string
}

export interface SituationCandidate {
  situationType: string
  correlationKey: string
  headline: string
  narrativeSeed: NarrativeSeed
  affectedEntities: { invoices: string[]; customers: string[]; payments: string[] }
  attentionIds: string[]
  priorityScore: number
}

export interface NarrativeSeed {
  entityCount: number
  totalAmount: number
  customerName: string | null
  maxUrgency: string
  windowInfo: { bestStart: string; bestEnd: string } | null
  stageLabel: string | null
  customerBehavior: { readRate: number | null; delayLikelihood: number | null }
}

export interface RecommendedAction {
  type: 'call' | 'send_reminder' | 'wait' | 'review' | 'escalate' | 'monitor'
  reason: string
  expectedOutcome: string | null
}

export interface ResolutionCondition {
  field: string
  table: string
  value: string
}

export interface OperationalSituation {
  id: string
  tenantId: string
  situationType: string
  situationFingerprint: string
  priorityScore: number
  urgency: 'critical' | 'high' | 'medium' | 'low'
  headline: string
  narrative: string
  affectedEntities: { invoices: string[]; customers: string[]; payments: string[] }
  recommendedAction: RecommendedAction
  decisionWindowStart: string | null
  decisionWindowEnd: string | null
  resolutionCondition: ResolutionCondition | null
  autoExecutable: boolean
  requiresApproval: boolean
  situationState: 'active' | 'snoozed' | 'dismissed' | 'completed'
  maxDisplayOrder: number
  expiresAt: string | null
  lastSeenAt: string | null
  dismissalCount: number
  pipelineVersion: number
  createdAt: string
  updatedAt: string
}

export interface CorrelationGroup {
  key: string
  situationType: string
  attentionIds: string[]
  entities: { invoices: Set<string>; customers: Set<string>; payments: Set<string> }
  signals: {
    totalAmount: number
    maxUrgency: 'critical' | 'high' | 'medium' | 'low'
    avgConfidence: number
    maxDismissalCount: number
    stageLevels: number[]
    customerIds: Set<string>
    readRate: number | null
    delayLikelihood: number | null
  }
}

export type SituationType =
  | 'cashflow_cluster'
  | 'payment_anomaly'
  | 'inventory_risk'
  | 'compliance_risk'
  | 'communication_failure'
  | 'customer_behavior_shift'

export const MAX_ACTIVE_SITUATIONS = 7
export const PIPELINE_VERSION = 1
