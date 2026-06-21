// ============================================================
// Spine — Canonical Event Spine Types & Invariants
// ============================================================
// This is the "physics layer" of BillZo.
// Every event in the system MUST satisfy this contract.
// ============================================================

// ----------------------------------------------------------
// UUID v7 generator — time-sortable unique identifiers
// https://www.rfc-editor.org/rfc/rfc9562#name-uuid-version-7
// ----------------------------------------------------------
export function uuidv7(): string {
  const ms = Date.now()
  const tsHex = ms.toString(16).padStart(12, '0')
  const rand1 = Math.floor(Math.random() * 0x1000)
  const rand2 = Math.floor(Math.random() * 0x1000)
  const rand3hi = Math.floor(Math.random() * 0x100000000)
  const rand3lo = Math.floor(Math.random() * 0x10000)
  const rand3 = ((rand3hi >>> 0).toString(16).padStart(8, '0')
    + (rand3lo >>> 0).toString(16).padStart(4, '0'))
  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-7${rand1.toString(16).padStart(3, '0')}-8${rand2.toString(16).padStart(3, '0')}-${rand3}`
}

export function uuidv7Timestamp(uuid: string): number {
  return parseInt(uuid.replace(/-/g, '').slice(0, 12), 16)
}

// ----------------------------------------------------------
// External References — identity propagation contract
// ----------------------------------------------------------
export interface ExternalRefs {
  whatsapp_message_id?: string | null
  razorpay_payment_id?: string | null
  upi_ref?: string | null
  provider_message_id?: string | null
}

// ----------------------------------------------------------
// Source System — producer identity
// ----------------------------------------------------------
export type SpineSourceSystem = 'worker' | 'api' | 'webhook' | 'cron' | 'client' | 'system'

// ----------------------------------------------------------
// Entity Type — the domain entity an event is about
// ----------------------------------------------------------
export type SpineEntityType =
  | 'invoice'
  | 'customer'
  | 'payment'
  | 'recovery_case'
  | 'tenant'
  | 'product'
  | 'whatsapp_message'
  | 'unknown'

// ----------------------------------------------------------
// SpineEvent — the canonical event shape
// ----------------------------------------------------------
// Every field is readonly after creation. No mutation allowed.
// ----------------------------------------------------------
export interface SpineEvent {
  readonly event_id: string              // UUID v7 (time-sortable)
  readonly entity_type: SpineEntityType  // domain entity type
  readonly entity_id: string             // the domain entity this event is about
  readonly causal_id: string | null      // immediate parent event UUID (null for root events)
  readonly correlation_id: string        // groups all events from one root trigger
  readonly sequence_no: number           // per (entity_type, entity_id) — strict monotonic
  readonly occurred_at: string           // ISO 8601, set by producer
  readonly ingested_at: string           // ISO 8601, set by spine writer (NOT producer)
  readonly source_system: SpineSourceSystem
  readonly idempotency_key: string       // unique per logical operation
  readonly tenant_id?: string            // multi-tenant isolation (required for shared-table backends)
  readonly payload: Record<string, unknown>
  readonly external_refs?: ExternalRefs
}

// ----------------------------------------------------------
// SpineEventInput — what producers pass to SpineWriter
// ----------------------------------------------------------
// ingested_at and sequence_no are assigned by the writer.
// ----------------------------------------------------------
export interface SpineEventInput {
  entity_type: SpineEntityType
  entity_id: string
  causal_id?: string | null
  correlation_id?: string
  occurred_at?: string                  // defaults to now
  source_system: SpineSourceSystem
  idempotency_key: string
  tenant_id?: string                    // multi-tenant backend isolation
  payload?: Record<string, unknown>
  external_refs?: ExternalRefs
}

// ----------------------------------------------------------
// SpineWriteResult — what SpineWriter returns
// ----------------------------------------------------------
export interface SpineWriteResult {
  accepted: boolean
  event_id?: string
  sequence_no?: number
  error?: string
  quarantined?: boolean
}

// ----------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------
export const VALID_ENTITY_TYPES: SpineEntityType[] = [
  'invoice', 'customer', 'payment', 'recovery_case', 'tenant', 'product', 'whatsapp_message', 'unknown',
]

export const VALID_SOURCE_SYSTEMS: SpineSourceSystem[] = [
  'worker', 'api', 'webhook', 'cron', 'client', 'system',
]

export interface SpineValidationError {
  field: string
  message: string
}

export function validateSpineEventInput(input: unknown): SpineValidationError[] {
  const errors: SpineValidationError[] = []
  if (!input || typeof input !== 'object') {
    errors.push({ field: 'root', message: 'Input must be an object' })
    return errors
  }
  const obj = input as Record<string, unknown>

  if (!obj.entity_type || !VALID_ENTITY_TYPES.includes(obj.entity_type as SpineEntityType)) {
    errors.push({ field: 'entity_type', message: `Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` })
  }
  if (!obj.entity_id || typeof obj.entity_id !== 'string') {
    errors.push({ field: 'entity_id', message: 'Must be a non-empty string' })
  }
  if (obj.causal_id !== undefined && obj.causal_id !== null && typeof obj.causal_id !== 'string') {
    errors.push({ field: 'causal_id', message: 'Must be a string or null' })
  }
  if (obj.correlation_id !== undefined && obj.correlation_id !== null && typeof obj.correlation_id !== 'string') {
    errors.push({ field: 'correlation_id', message: 'Must be a string' })
  }
  if (!obj.source_system || !VALID_SOURCE_SYSTEMS.includes(obj.source_system as SpineSourceSystem)) {
    errors.push({ field: 'source_system', message: `Must be one of: ${VALID_SOURCE_SYSTEMS.join(', ')}` })
  }
  if (!obj.idempotency_key || typeof obj.idempotency_key !== 'string') {
    errors.push({ field: 'idempotency_key', message: 'Must be a non-empty string' })
  }
  if (obj.payload !== undefined && obj.payload !== null && typeof obj.payload !== 'object') {
    errors.push({ field: 'payload', message: 'Must be an object or null' })
  }
  if (obj.external_refs !== undefined && obj.external_refs !== null && typeof obj.external_refs !== 'object') {
    errors.push({ field: 'external_refs', message: 'Must be an object or null/undefined' })
  }

  return errors
}

// ----------------------------------------------------------
// Entity type inference from event type string
// ----------------------------------------------------------
export function inferEntityType(eventType: string): SpineEntityType {
  if (eventType.startsWith('invoice.')) return 'invoice'
  if (eventType.startsWith('payment.')) return 'payment'
  if (eventType.startsWith('recovery.')) return 'recovery_case'
  if (eventType.startsWith('customer.')) return 'customer'
  if (eventType.startsWith('tenant.')) return 'tenant'
  if (eventType.startsWith('product.') || eventType.startsWith('inventory.')) return 'product'
  if (eventType.startsWith('whatsapp.')) return 'whatsapp_message'
  return 'unknown'
}

// ----------------------------------------------------------
// DomainContext — injectable execution boundary
// ----------------------------------------------------------
// Every domain function should accept ctx as its first parameter
// to eliminate non-deterministic calls (Date.now(), Math.random()).
// ----------------------------------------------------------
export interface DomainContext {
  clock: {
    now(): string   // ISO 8601 timestamp
  }
}

export const realClock: DomainContext['clock'] = {
  now: () => new Date().toISOString(),
}

export function createDomainContext(): DomainContext {
  return { clock: realClock }
}
