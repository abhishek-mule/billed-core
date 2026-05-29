import { supabaseAdmin } from '../billzo/supabase-admin'
import type { AttentionItem, OperationalSituation, CorrelationGroup } from './types'
import { computeAttentionItems } from './scorer'
import { correlate } from './correlation'
import { cluster, setCustomerNameCache } from './clusterer'
import { prioritize } from './prioritizer'
import { synthesize } from './synthesizer'
import { MAX_ACTIVE_SITUATIONS } from './types'

const logger = {
  info: (ctx: Record<string, any>, msg: string) => console.log(`[cognition] ${msg}`, ctx),
  warn: (ctx: Record<string, any>, msg: string) => console.warn(`[cognition] ${msg}`, ctx),
  error: (ctx: Record<string, any>, msg: string) => console.error(`[cognition] ${msg}`, ctx),
}

export async function runCognitionPipeline(tenantId: string): Promise<{
  itemsComputed: number
  situationsGenerated: number
}> {
  // Step 1: Compute raw signals (attention_items)
  const attentionItems = await computeAttentionItems(tenantId)
  logger.info({ tenantId, count: attentionItems.length }, 'Attention items computed')

  if (attentionItems.length === 0) {
    // No signals — resolve all active situations for this tenant
    await resolveAllActiveSituations(tenantId)
    return { itemsComputed: 0, situationsGenerated: 0 }
  }

  // Pre-populate customer name cache
  const customerIds = new Set<string>()
  for (const item of attentionItems) {
    const cid = item.signalData?.customer_id as string | undefined
    if (cid) customerIds.add(cid)
  }
  if (customerIds.size > 0) {
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .in('id', Array.from(customerIds))
    if (customers) {
      const nameMap: Record<string, string> = {}
      for (const c of customers) nameMap[c.id] = c.name
      setCustomerNameCache(nameMap)
    }
  }

  // Step 2: Correlate signals
  const groups = correlate(attentionItems)

  // Step 3: Cluster into situation candidates
  const candidates = cluster(groups)

  // Step 4: Prioritize (timing-aware, max 7)
  const prioritized = prioritize(candidates)

  // Step 5: Synthesize narratives
  const situations = synthesize(prioritized, tenantId)

  // Step 6: Persist to operational_situations
  await persistSituations(tenantId, situations, attentionItems)

  logger.info({ tenantId, situationsGenerated: situations.length }, 'Situations persisted')
  return { itemsComputed: attentionItems.length, situationsGenerated: situations.length }
}

async function persistSituations(tenantId: string, situations: OperationalSituation[], items: AttentionItem[]): Promise<void> {
  // Upsert situations by fingerprint
  for (const sit of situations) {
    const { error } = await supabaseAdmin
      .from('operational_situations')
      .upsert({
        tenant_id: sit.tenantId,
        situation_type: sit.situationType,
        situation_fingerprint: sit.situationFingerprint,
        priority_score: sit.priorityScore,
        urgency: sit.urgency,
        headline: sit.headline,
        narrative: sit.narrative,
        affected_entities: sit.affectedEntities,
        recommended_action: sit.recommendedAction,
        decision_window_start: sit.decisionWindowStart,
        decision_window_end: sit.decisionWindowEnd,
        resolution_condition: sit.resolutionCondition,
        auto_executable: sit.autoExecutable,
        requires_approval: sit.requiresApproval,
        situation_state: 'active',
        max_display_order: sit.maxDisplayOrder,
        expires_at: sit.expiresAt,
        pipeline_version: sit.pipelineVersion,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'situation_fingerprint',
        ignoreDuplicates: false,
      })

    if (error) {
      logger.error({ tenantId, fingerprint: sit.situationFingerprint, err: error.message }, 'Failed to upsert situation')
    }
  }

  // Mark attention items with their situation_id
  const attentionItemIds = situations.flatMap(s => {
    const matchingItems = items.filter(i => {
      const ck = i.correlationKey
      return ck && s.affectedEntities.customers.some(cid => ck.includes(cid))
    })
    return matchingItems.map(i => i.id)
  })

  for (const itemId of attentionItemIds) {
    await supabaseAdmin
      .from('attention_items')
      .update({ situation_id: situations[0]?.id || null })
      .eq('id', itemId)
  }

  // Mark stale situations as completed (no longer in active set)
  const activeFingerprints = situations.map(s => s.situationFingerprint)
  if (activeFingerprints.length > 0) {
    await supabaseAdmin
      .from('operational_situations')
      .update({ situation_state: 'completed', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('situation_state', 'active')
      .not('situation_fingerprint', 'in', `(${activeFingerprints.map(f => `'${f}'`).join(',')})`)
  }
}

async function resolveAllActiveSituations(tenantId: string): Promise<void> {
  await supabaseAdmin
    .from('operational_situations')
    .update({ situation_state: 'completed', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('situation_state', 'active')
}
