export type OwnershipDomain =
  | 'financial_state'
  | 'recovery_state'
  | 'annotation_state'
  | 'communication_state'
  | 'entity_state'
  | 'regulatory_state'

export interface MutationRequest {
  idempotencyKey: string
  intentType: string
  tenantId: string
  entityType?: string
  entityId?: string
  clientVersion?: number
  payload: Record<string, unknown>
  mode: 'sync' | 'async'
}

export interface HandlerResult {
  outcome: 'success' | 'failure' | 'stale' | 'contention'
  error?: string
  touchedRows: Array<{
    table: string
    id: string
    changedFields: string[]
  }>
  transitionTraces: Array<{
    entity: string
    entityId: string
    field: string
    from: string | null
    to: string
    sequence: number
  }>
}

export interface Handler {
  domain: OwnershipDomain
  execute: (payload: Record<string, unknown>, tenantId: string) => Promise<HandlerResult>
  transitionGraph?: Record<string, string[]>
}
