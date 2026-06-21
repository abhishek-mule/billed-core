// authority:exempt append_only_observability — behavioral analytics materialization
import type { BehavioralObservation, CustomerBehavioralMetrics, ProfileChanged, DomainContext } from '@billzo/shared'
import { EventType, INTERPRETER_VERSION, createDomainContext } from '@billzo/shared'
import { supabaseAdmin } from './supabase-admin'
import { decayedEMA, daysBetween, getHalfLife } from './decay'
import { writeOutboxEvent } from './outbox'
import { executeIdempotent } from './idempotency'

// ============================================================
// BEHAVIORAL MATERIALIZER
// ============================================================
// Consumes behavioral.observation events and updates the two
// behavioral memory tables using targeted accumulator mutations.
//
// Design principles:
//   1. Each observation type touches ONLY its relevant fields
//   2. EMA decay is applied per-metric with configured half-lives
//   3. Confidence is propagated into all weighted accumulators
//   4. After each update, a diff-based profile.changed event is emitted
//   5. All writes are deterministic — replaying the same observations
//      in order produces identical materialized state
// ============================================================

const SCHEMA_VERSION = 1

export async function materializeObservation(
  observation: BehavioralObservation,
  causationEventId?: string,
  ctx?: DomainContext,
): Promise<void> {
  const clock = ctx?.clock ?? createDomainContext().clock
  const idempotencyKey = causationEventId
    ? `behavioral:materialize:${causationEventId}`
    : `behavioral:materialize:${observation.tenantId}:${observation.customerId}:${observation.type}:${observation.occurredAt}`

  await executeIdempotent(idempotencyKey, 'behavioral_materialize', observation.tenantId, async () => {
    switch (observation.type) {
      case 'message_seen':
        await handleMessageSeen(observation, clock)
        break
      case 'attention_absent':
      case 'response_absent':
      case 'resolution_absent':
        await handleAbsence(observation, clock)
        break
      case 'payment_intent':
        await handlePaymentIntent(observation, clock)
        break
      case 'resolution_completed':
        await handleResolutionCompleted(observation, clock)
        break
      case 'channel_failure':
        await handleChannelFailure(observation, clock)
        break
    }
    return null
  })
}

// ============================================================
// HANDLER: message_seen
// ============================================================
// Updates read rate and read counters with confidence weighting.
async function handleMessageSeen(observation: BehavioralObservation, clock: DomainContext['clock']): Promise<void> {
  const { tenantId, customerId, confidence } = observation
  const now = clock.now()

  const current = await getMetrics(tenantId, customerId)
  const deltaDays = current
    ? daysBetween(new Date(current.updatedAt), new Date(clock.now()))
    : 0

  const newReadRate = decayedEMA(
    current?.readRate ?? 0,
    confidence,
    deltaDays,
    getHalfLife('readRate'),
  )

  const updatedFields: string[] = ['readRate', 'totalInterventionsRead', 'lastReadAt', 'observationCount']

  const updates: Record<string, unknown> = {
    read_rate: round(newReadRate),
    total_interventions_read: round((current?.totalInterventionsRead ?? 0) + confidence),
    total_interventions_sent: current?.totalInterventionsSent ?? 0,
    last_read_at: now,
    observation_count: (current?.observationCount ?? 0) + 1,
    updated_at: now,
  }

  if (!current) {
    await supabaseAdmin.from('customer_behavioral_metrics').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      schema_version: SCHEMA_VERSION,
      ...updates,
    })
  } else {
    await supabaseAdmin.from('customer_behavioral_metrics').update(updates).match({
      tenant_id: tenantId,
      customer_id: customerId,
    })
  }

  await emitProfileChanged(tenantId, customerId, updatedFields, current ?? null, updates, clock)
}

// ============================================================
// HANDLER: attention_absent / response_absent / resolution_absent
// ============================================================
// Updates escalation counters and timing.
async function handleAbsence(observation: BehavioralObservation, clock: DomainContext['clock']): Promise<void> {
  const { tenantId, customerId, confidence } = observation
  const now = clock.now()

  const current = await getMetrics(tenantId, customerId)

  const updatedFields: string[] = ['totalEscalationsReceived', 'lastEscalationAt']

  const updates: Record<string, unknown> = {
    total_escalations_received: (current?.totalEscalationsReceived ?? 0) + 1,
    last_escalation_at: now,
    observation_count: (current?.observationCount ?? 0) + 1,
    updated_at: now,
  }

  if (!current) {
    await supabaseAdmin.from('customer_behavioral_metrics').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      schema_version: SCHEMA_VERSION,
      ...updates,
    })
  } else {
    await supabaseAdmin.from('customer_behavioral_metrics').update(updates).match({
      tenant_id: tenantId,
      customer_id: customerId,
    })
  }

  await emitProfileChanged(tenantId, customerId, updatedFields, current ?? null, updates, clock)
}

// ============================================================
// HANDLER: payment_intent
// ============================================================
// Currently a lightweight signal — tracked for future intent-to-payment
// conversion funnel analysis.
async function handlePaymentIntent(observation: BehavioralObservation, clock: DomainContext['clock']): Promise<void> {
  const { tenantId, customerId } = observation

  const current = await getMetrics(tenantId, customerId)
  const now = clock.now()

  const updatedFields: string[] = ['observationCount']

  const updates: Record<string, unknown> = {
    observation_count: (current?.observationCount ?? 0) + 1,
    updated_at: now,
  }

  if (!current) {
    await supabaseAdmin.from('customer_behavioral_metrics').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      schema_version: SCHEMA_VERSION,
      ...updates,
    })
  } else {
    await supabaseAdmin.from('customer_behavioral_metrics').update(updates).match({
      tenant_id: tenantId,
      customer_id: customerId,
    })
  }

  await emitProfileChanged(tenantId, customerId, updatedFields, current ?? null, updates, clock)
}

// ============================================================
// ANTI-CAUSALITY CHECK
// ============================================================
// Detects when a payment signal arrives before or after its
// presumed cause (read receipt). This prevents contamination
// of read→pay latency metrics when the causal order is inverted.
function checkAntiCausality(
  current: CustomerBehavioralMetrics | null,
  resolvedAt: Date,
): { readToPayValid: boolean } {
  if (!current?.lastReadAt) {
    return { readToPayValid: false }
  }

  const readAt = new Date(current.lastReadAt)

  // If read happened after resolution, the read didn't cause the payment
  // This can happen when: phone handoff, shared device, delayed read receipt
  return {
    readToPayValid: readAt < resolvedAt,
  }
}

// ============================================================
// HANDLER: resolution_completed
// ============================================================
// The most impactful observation — updates liquidity windows,
// conversion rate, settlement latency, read-to-pay latency,
// and pressure memory.
async function handleResolutionCompleted(observation: BehavioralObservation, clock: DomainContext['clock']): Promise<void> {
  const { tenantId, customerId, confidence, occurredAt, metadata } = observation
  const now = clock.now()
  const resolvedAt = new Date(occurredAt)

  const current = await getMetrics(tenantId, customerId)
  const deltaDays = current
    ? daysBetween(new Date(current.updatedAt), new Date(clock.now()))
    : 0

  // Anti-causality check: discount read→pay if read happened after payment
  const { readToPayValid } = checkAntiCausality(current, resolvedAt)

  // Update liquidity windows
  await upsertLiquidityWindow(tenantId, customerId, resolvedAt)

  // Compute latencies from metadata if available
  const readToPayHours = (readToPayValid && metadata?.readToPayHours != null)
    ? metadata.readToPayHours as number
    : undefined
  const settlementHours = metadata?.settlementHours as number | undefined

  const newConversionRate = decayedEMA(
    current?.paymentConversionRate ?? 0,
    confidence,
    deltaDays,
    getHalfLife('paymentConversion'),
  )

  const newReadToPayLatency = readToPayHours != null
    ? decayedEMA(
        current?.avgReadToPayHours ?? readToPayHours,
        readToPayHours,
        deltaDays,
        getHalfLife('readToPayLatency'),
      )
    : (current?.avgReadToPayHours ?? 0)

  const newSettlementLatency = settlementHours != null
    ? decayedEMA(
        current?.avgSettlementLatencyHours ?? settlementHours,
        settlementHours,
        deltaDays,
        getHalfLife('settlementLatency'),
      )
    : (current?.avgSettlementLatencyHours ?? 0)

  const interventionsUntilResolution =
    (current?.totalInterventionsSent ?? 0) -
    (current?.totalResolutionsAfterIntervention ?? 0)

  const updatedFields: string[] = [
    'paymentConversionRate',
    'avgReadToPayHours',
    'avgSettlementLatencyHours',
    'totalResolutionsAfterIntervention',
    'interventionsUntilResolution',
    'lastResolutionAt',
    'observationCount',
  ]

  const updates: Record<string, unknown> = {
    payment_conversion_rate: round(newConversionRate),
    avg_read_to_pay_hours: round(newReadToPayLatency),
    avg_settlement_latency_hours: round(newSettlementLatency),
    total_resolutions_after_intervention: (current?.totalResolutionsAfterIntervention ?? 0) + 1,
    interventions_until_resolution: interventionsUntilResolution > 0 ? interventionsUntilResolution : null,
    last_resolution_at: occurredAt,
    observation_count: (current?.observationCount ?? 0) + 1,
    updated_at: now,
  }

  if (!current) {
    await supabaseAdmin.from('customer_behavioral_metrics').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      schema_version: SCHEMA_VERSION,
      ...updates,
    })
  } else {
    await supabaseAdmin.from('customer_behavioral_metrics').update(updates).match({
      tenant_id: tenantId,
      customer_id: customerId,
    })
  }

  await emitProfileChanged(tenantId, customerId, updatedFields, current ?? null, updates, clock)
}

// ============================================================
// HANDLER: channel_failure
// ============================================================
// Decays read rate to reflect channel viability loss.
async function handleChannelFailure(observation: BehavioralObservation, clock: DomainContext['clock']): Promise<void> {
  const { tenantId, customerId, confidence } = observation
  const now = clock.now()

  const current = await getMetrics(tenantId, customerId)
  const deltaDays = current
    ? daysBetween(new Date(current.updatedAt), new Date(clock.now()))
    : 0

  const newReadRate = current
    ? decayedEMA(current.readRate, 0, deltaDays, getHalfLife('channelViability'))
    : 0

  const updatedFields: string[] = current ? ['readRate', 'observationCount'] : ['observationCount']

  const updates: Record<string, unknown> = {
    read_rate: round(newReadRate),
    observation_count: (current?.observationCount ?? 0) + 1,
    updated_at: now,
  }

  if (!current) {
    await supabaseAdmin.from('customer_behavioral_metrics').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      schema_version: SCHEMA_VERSION,
      ...updates,
    })
  } else {
    await supabaseAdmin.from('customer_behavioral_metrics').update(updates).match({
      tenant_id: tenantId,
      customer_id: customerId,
    })
  }

  await emitProfileChanged(tenantId, customerId, updatedFields, current ?? null, updates, clock)
}

// ============================================================
// LIQUIDITY WINDOW UPSERT
// ============================================================
async function upsertLiquidityWindow(
  tenantId: string,
  customerId: string,
  resolvedAt: Date,
): Promise<void> {
  const weekday = resolvedAt.getUTCDay()
  const hourBucket = resolvedAt.getUTCHours()

  const { data: existing } = await supabaseAdmin
    .from('customer_liquidity_windows')
    .select('affinity_score, observation_count')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('window_type', 'weekly')
    .eq('weekday', weekday)
    .eq('hour_bucket', hourBucket)
    .maybeSingle()

  const newCount = (existing?.observation_count ?? 0) + 1
  const newAffinity = (existing?.affinity_score ?? 0) + 1.0

  if (!existing) {
    await supabaseAdmin.from('customer_liquidity_windows').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      schema_version: SCHEMA_VERSION,
      window_type: 'weekly',
      weekday,
      hour_bucket: hourBucket,
      affinity_score: newAffinity,
      observation_count: newCount,
      last_seen_at: resolvedAt.toISOString(),
    })
  } else {
    await supabaseAdmin.from('customer_liquidity_windows').update({
      affinity_score: newAffinity,
      observation_count: newCount,
      last_seen_at: resolvedAt.toISOString(),
    }).match({
      tenant_id: tenantId,
      customer_id: customerId,
      window_type: 'weekly',
      weekday,
      hour_bucket: hourBucket,
    })
  }
}

// ============================================================
// PROFILE CHANGED EMITTER (diff-based)
// ============================================================
async function emitProfileChanged(
  tenantId: string,
  customerId: string,
  changedFields: string[],
  before: CustomerBehavioralMetrics | null,
  after: Record<string, unknown>,
  clock: DomainContext['clock'],
): Promise<void> {
  const beforeConfidence = before ? computeObservationConfidence(before) : 0
  const afterConfidence = computeUpdateConfidence(after)

  const profileChanged: ProfileChanged = {
    tenantId,
    customerId,
    changedFields,
    confidenceBefore: beforeConfidence,
    confidenceAfter: afterConfidence,
    occurredAt: clock.now(),
  }

  await writeOutboxEvent({
    type: EventType.PROFILE_CHANGED,
    version: 1,
    tenantId,
    entityId: customerId,
    payload: profileChanged as unknown as Record<string, unknown>,
    causationId: null,
    correlationId: '',
    idempotencyKey: null,
  })
}

function computeObservationConfidence(metrics: CustomerBehavioralMetrics): number {
  return 1 - Math.exp(-metrics.observationCount / 20)
}

function computeUpdateConfidence(updates: Record<string, unknown>): number {
  const obsCount = (updates.observation_count as number) ?? 0
  return 1 - Math.exp(-obsCount / 20)
}

// ============================================================
// HELPERS
// ============================================================

async function getMetrics(
  tenantId: string,
  customerId: string,
): Promise<CustomerBehavioralMetrics | null> {
  const { data } = await supabaseAdmin
    .from('customer_behavioral_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (!data) return null

  return {
    tenantId: data.tenant_id,
    customerId: data.customer_id,
    schemaVersion: data.schema_version,
    readRate: data.read_rate ?? 0,
    paymentConversionRate: data.payment_conversion_rate ?? 0,
    avgReadToPayHours: data.avg_read_to_pay_hours ?? 0,
    avgReminderResponseHours: data.avg_reminder_response_hours ?? 0,
    avgSettlementLatencyHours: data.avg_settlement_latency_hours ?? 0,
    observationCount: data.observation_count ?? 0,
    totalInterventionsSent: data.total_interventions_sent ?? 0,
    totalInterventionsRead: data.total_interventions_read ?? 0,
    totalResolutionsAfterIntervention: data.total_resolutions_after_intervention ?? 0,
    totalEscalationsReceived: data.total_escalations_received ?? 0,
    lastEscalationAt: data.last_escalation_at,
    interventionsUntilResolution: data.interventions_until_resolution,
    lastResolutionAt: data.last_resolution_at,
    lastReadAt: data.last_read_at,
    lastResponseAt: data.last_response_at,
    lastEventAt: data.last_event_at,
    updatedAt: data.updated_at,
  }
}

function round(value: number, decimals = 4): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
}
