import { supabaseAdmin } from '../billzo/supabase-admin'
import type { CustomerTier, CustomerBehavioralMetrics } from '@billzo/shared'

// ============================================================
// REPUTATION SCORE — 0-100 derived from behavioral metrics
// ============================================================
// Read rate:       0-25 points
// Payment conversion: 0-25 points
// Settlement speed:   0-15 points (faster = higher)
// Observation count:  0-10 points (more data = higher confidence)
// Escalation rate:    0-10 points (fewer escalations = better)
// Intervention efficiency: 0-5 points (fewer interventions to resolve)
// Base: 10 points
// Total: 100
// ============================================================

export function computeReputationScore(metrics: CustomerBehavioralMetrics): number {
  const readRateScore = clamp(metrics.readRate, 0, 1) * 25
  const paymentConversionScore = clamp(metrics.paymentConversionRate, 0, 1) * 25

  const settlementLatency = metrics.avgSettlementLatencyHours || 720
  const settlementScore = clamp(1 - settlementLatency / 720, 0, 1) * 15

  const obsCount = metrics.observationCount || 0
  const observationScore = clamp(obsCount / 100, 0, 1) * 10

  const escalations = metrics.totalEscalationsReceived || 0
  const resolutions = metrics.totalResolutionsAfterIntervention || 1
  const escalationRate = clamp(escalations / resolutions, 0, 1)
  const escalationScore = (1 - escalationRate) * 10

  const interventionsUntilRes = metrics.interventionsUntilResolution
  let efficiencyScore = 0
  if (interventionsUntilRes === null || interventionsUntilRes === undefined) {
    efficiencyScore = 5
  } else if (interventionsUntilRes <= 1) {
    efficiencyScore = 5
  } else if (interventionsUntilRes <= 3) {
    efficiencyScore = 3
  } else {
    efficiencyScore = 1
  }

  const base = 10

  const total = Math.round(
    readRateScore +
    paymentConversionScore +
    settlementScore +
    observationScore +
    escalationScore +
    efficiencyScore +
    base,
  )

  return clamp(total, 0, 100)
}

export function autoAssignTier(reputation: number, metrics: CustomerBehavioralMetrics): CustomerTier {
  const escalations = metrics.totalEscalationsReceived || 0
  const resolutions = metrics.totalResolutionsAfterIntervention || 1
  const escalationRate = escalations / resolutions
  const conversionRate = metrics.paymentConversionRate || 0
  const obsCount = metrics.observationCount || 0

  if (reputation < 20 || (escalations > 3 && escalationRate > 0.8)) {
    return 'blacklisted'
  }

  if (reputation >= 80 && conversionRate >= 0.7 && obsCount >= 10) {
    return 'vip'
  }

  if (reputation < 40 || conversionRate < 0.3) {
    return 'risky'
  }

  return 'regular'
}

// ============================================================
// PERSISTENCE — Read metrics, compute reputation, write to DB
// ============================================================

export async function computeCustomerReputation(
  tenantId: string,
  customerId: string,
): Promise<{ reputation: number; tier: CustomerTier } | null> {
  const { data: metrics, error } = await supabaseAdmin
    .from('customer_behavioral_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error || !metrics) return null

  const m: CustomerBehavioralMetrics = {
    tenantId: metrics.tenant_id,
    customerId: metrics.customer_id,
    schemaVersion: metrics.schema_version,
    readRate: metrics.read_rate || 0,
    paymentConversionRate: metrics.payment_conversion_rate || 0,
    avgReadToPayHours: metrics.avg_read_to_pay_hours || 0,
    avgReminderResponseHours: metrics.avg_reminder_response_hours || 0,
    avgSettlementLatencyHours: metrics.avg_settlement_latency_hours || 0,
    observationCount: metrics.observation_count || 0,
    totalInterventionsSent: metrics.total_interventions_sent || 0,
    totalInterventionsRead: metrics.total_interventions_read || 0,
    totalResolutionsAfterIntervention: metrics.total_resolutions_after_intervention || 0,
    totalEscalationsReceived: metrics.total_escalations_received || 0,
    lastEscalationAt: metrics.last_escalation_at || null,
    interventionsUntilResolution: metrics.interventions_until_resolution || null,
    lastResolutionAt: metrics.last_resolution_at || null,
    lastReadAt: metrics.last_read_at || null,
    lastResponseAt: metrics.last_response_at || null,
    lastEventAt: metrics.last_event_at || null,
    updatedAt: metrics.updated_at,
  }

  const reputation = computeReputationScore(m)
  const tier = autoAssignTier(reputation, m)

  // authority:governed customer.update_reputation — computed from behavioral metrics
  await supabaseAdmin
    .from('customers')
    .update({
      reputation_score: reputation,
      customer_tier: tier,
    })
    .eq('id', customerId)

  return { reputation, tier }
}

export async function computeAllCustomerReputations(): Promise<number> {
  const { data: tenants } = await supabaseAdmin.from('tenants').select('id').limit(500)
  if (!tenants) return 0

  let total = 0

  // Process tenants with bounded concurrency (pool of 5) to avoid overwhelming the DB
  const TENANT_CONCURRENCY = 5
  const tenantChunks: typeof tenants[] = []
  for (let i = 0; i < tenants.length; i += TENANT_CONCURRENCY) {
    tenantChunks.push(tenants.slice(i, i + TENANT_CONCURRENCY))
  }

  for (const tenantBatch of tenantChunks) {
    const batchResults = await Promise.all(tenantBatch.map(t => processOneTenant(t.id)))
    total += batchResults.reduce((s, n) => s + n, 0)
  }

  return total
}

/**
 * Compute and persist reputation for all customers in a single tenant.
 * Fetches all behavioral metrics in ONE query, then runs computations in
 * parallel batches of 100 to avoid per-customer roundtrip overhead.
 */
async function processOneTenant(tenantId: string): Promise<number> {
  // Fetch all metrics in one query (single roundtrip per tenant)
  const { data: allMetrics } = await supabaseAdmin
    .from('customer_behavioral_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(2000)

  if (!allMetrics || allMetrics.length === 0) return 0

  const CUSTOMER_BATCH_SIZE = 100
  let processed = 0

  for (let i = 0; i < allMetrics.length; i += CUSTOMER_BATCH_SIZE) {
    const chunk = allMetrics.slice(i, i + CUSTOMER_BATCH_SIZE)

    // Compute reputation for all in this chunk (pure CPU, no DB)
    const updates = chunk.map((metrics: any) => {
      const m: CustomerBehavioralMetrics = {
        tenantId: metrics.tenant_id,
        customerId: metrics.customer_id,
        schemaVersion: metrics.schema_version,
        readRate: metrics.read_rate || 0,
        paymentConversionRate: metrics.payment_conversion_rate || 0,
        avgReadToPayHours: metrics.avg_read_to_pay_hours || 0,
        avgReminderResponseHours: metrics.avg_reminder_response_hours || 0,
        avgSettlementLatencyHours: metrics.avg_settlement_latency_hours || 0,
        observationCount: metrics.observation_count || 0,
        totalInterventionsSent: metrics.total_interventions_sent || 0,
        totalInterventionsRead: metrics.total_interventions_read || 0,
        totalResolutionsAfterIntervention: metrics.total_resolutions_after_intervention || 0,
        totalEscalationsReceived: metrics.total_escalations_received || 0,
        lastEscalationAt: metrics.last_escalation_at || null,
        interventionsUntilResolution: metrics.interventions_until_resolution || null,
        lastResolutionAt: metrics.last_resolution_at || null,
        lastReadAt: metrics.last_read_at || null,
        lastResponseAt: metrics.last_response_at || null,
        lastEventAt: metrics.last_event_at || null,
        updatedAt: metrics.updated_at,
      }
      const reputation = computeReputationScore(m)
      const tier = autoAssignTier(reputation, m)
      return { id: metrics.customer_id, reputation, tier }
    })

    // Bulk-update this chunk in parallel (one update per customer, but all in-flight at once)
    const results = await Promise.allSettled(
      updates.map(u =>
        supabaseAdmin
          .from('customers')
          .update({ reputation_score: u.reputation, customer_tier: u.tier })
          .eq('id', u.id),
      ),
    )
    processed += results.filter(r => r.status === 'fulfilled').length
  }

  return processed
}

// ============================================================
// HELPERS
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
