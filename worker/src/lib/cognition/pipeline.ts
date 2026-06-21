import { supabaseAdmin, getDeviceTokens } from '../billzo/supabase-admin'
import type { AttentionItem, OperationalSituation, CorrelationGroup } from './types'
import { computeAttentionItems } from './scorer'
import { correlate } from './correlation'
import { cluster, setCustomerNameCache } from './clusterer'
import { prioritize } from './prioritizer'
import { synthesize } from './synthesizer'
import { MAX_ACTIVE_SITUATIONS } from './types'
import { sendPushNotification } from '../billzo/notifications'

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
  // Fetch previously active situations to detect new ones for notification routing
  const { data: prevActive } = await supabaseAdmin
    .from('operational_situations')
    .select('situation_fingerprint, priority_score, headline')
    .eq('tenant_id', tenantId)
    .eq('situation_state', 'active')

  const prevFingerprints = new Set((prevActive || []).map(s => s.situation_fingerprint))

  // Upsert situations by fingerprint (batch)
  if (situations.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('operational_situations')
      .upsert(situations.map(sit => ({
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
        updated_at: now,
      })), {
        onConflict: 'situation_fingerprint',
        ignoreDuplicates: false,
      })

    if (error) {
      logger.error({ tenantId, err: error.message }, 'Failed to batch upsert situations')
    }
  }

  // Mark attention items with their situation_id (batch)
  const attentionItemIds = situations.flatMap(s => {
    const matchingItems = items.filter(i => {
      const ck = i.correlationKey
      return ck && s.affectedEntities.customers.some(cid => ck.includes(cid))
    })
    return matchingItems.map(i => i.id)
  })

  if (attentionItemIds.length > 0) {
    await supabaseAdmin
      .from('attention_items')
      .update({ situation_id: situations[0]?.id || null })
      .in('id', attentionItemIds)
  }

  // Mark stale situations as completed (no longer in active set)
  const activeFingerprints = situations.map(s => s.situationFingerprint)
  if (activeFingerprints.length > 0) {
    await supabaseAdmin
      .from('operational_situations')
      .update({ situation_state: 'completed', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('situation_state', 'active')
      .not('situation_fingerprint', 'in', activeFingerprints)
  }

  // Send push notifications for new high-priority situations
  const newHighPriority = situations.filter(
    s => !prevFingerprints.has(s.situationFingerprint) && s.priorityScore >= 25,
  )
  if (newHighPriority.length > 0) {
    const customerIds = newHighPriority
      .map(s => s.affectedEntities?.customers?.[0])
      .filter(Boolean) as string[]
    const customerNameMap = new Map<string, string>()
    if (customerIds.length > 0) {
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id, name')
        .in('id', customerIds)
      if (customers) {
        for (const c of customers) customerNameMap.set(c.id, c.name)
      }
    }
    for (const sit of newHighPriority) {
      const customerId = sit.affectedEntities?.customers?.[0]
      const customerName = customerId ? customerNameMap.get(customerId) : undefined
      const url = buildSituationUrl(sit.situationType, customerName, customerId)
      const title = sit.headline || 'New situation detected'
      const body = customerName ? `${customerName} — ${sit.headline}` : sit.headline

      sendPushNotification({ tenantId, title, body, type: sit.situationType, url }).catch(err =>
        logger.error({ tenantId, fingerprint: sit.situationFingerprint, err: (err as Error).message }, 'Push notification failed'),
      )
    }
  }
}

function buildSituationUrl(type: string, customerName?: string, customerId?: string): string {
  if (customerName || customerId) {
    const q = encodeURIComponent(customerName || customerId || '')
    if (type === 'send_reminder') return `/cashflow?q=${q}`
    if (type === 'cashflow') return `/cashflow?q=${q}`
    if (type === 'call') return `/cashflow?q=${q}`
    if (type === 'review') return `/cashflow?q=${q}`
  }
  if (type === 'payment_anomaly') return '/pulse'
  return '/dashboard'
}

async function resolveAllActiveSituations(tenantId: string): Promise<void> {
  await supabaseAdmin
    .from('operational_situations')
    .update({ situation_state: 'completed', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('situation_state', 'active')
}
