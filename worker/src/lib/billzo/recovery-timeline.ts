// ============================================================
// RECOVERY TIMELINE — Causal graph reconstruction engine
// ============================================================
// Reconstructs a causally-ordered event graph for any entity
// (invoice, customer, message, recovery case) across 5 data sources:
//
//   1. whatsapp_events       — transport event stream
//   2. outbox                — business event stream
//   3. projection_delta_log  — projection state transitions
//   4. customer_behavioral_metrics — behavioral state snapshots
//   5. recovery_attributions — payment attribution records
//
// The engine builds a causal DAG, detects and quarantines cycles,
// then topologically sorts with partial ordering fallback.
//
// This is NOT a timeline debugger. It is a forensic causality engine.
// The visual timeline is merely one rendering of the graph.
//
// RISK: Behavioral memory contamination by transport incompleteness
// The materializer treats "no read receipt" as "customer did not read."
// This conflates transport failure with behavioral signal.
// Future work: observationCompleteness, transportReliability, providerConfidence.
// For now, this engine surfaces transport events alongside behavioral
// observations so operators can distinguish "no signal" from "negative signal."
// ============================================================

import { supabaseAdmin } from './supabase-admin'
import type { CustomerBehavioralMetrics } from '@billzo/shared'

// ============================================================
// TYPES
// ============================================================

export type TimelineSource = 'transport' | 'behavior' | 'attribution' | 'orchestration' | 'system'

export interface TimelineNode {
  id: string
  type: string
  timestamp: string
  correlationId: string
  causationId: string | null
  source: TimelineSource
  payload: Record<string, unknown>
  eventSequence?: number
  delta?: { field: string; before: unknown; after: unknown }[]
  topologyOrder: number
}

export interface CausalEdge {
  from: string
  to: string
  type: 'causation' | 'correlation' | 'sequence'
}

export interface CausalGraph {
  nodes: TimelineNode[]
  edges: CausalEdge[]
  hasCycle: boolean
  quarantinedEdges: CausalEdge[]
}

export interface TimelineQuery {
  invoiceId?: string
  customerId?: string
  billzoMessageId?: string
  recoveryCaseId?: string
  from?: string
  to?: string
  limit?: number
}

// ============================================================
// SOURCE FETCHERS
// ============================================================

async function fetchWhatsAppEvents(entityId: string, customerId?: string): Promise<TimelineNode[]> {
  let query = supabaseAdmin
    .from('whatsapp_events')
    .select('*')
    .order('event_sequence', { ascending: true })

  if (customerId) {
    void query.eq('customer_id', customerId)
  } else {
    void query.eq('invoice_id', entityId)
  }

  const { data, error } = await query.limit(500)
  if (error || !data) return []

  return data.map((row: any) => ({
    id: row.billzo_message_id || row.id,
    type: `transport.${row.status || 'unknown'}`,
    timestamp: row.occurred_at || row.created_at,
    correlationId: row.conversation_id || '',
    causationId: null,
    source: 'transport' as TimelineSource,
    payload: row as Record<string, unknown>,
    eventSequence: row.event_sequence ? Number(row.event_sequence) : undefined,
    topologyOrder: 0,
  }))
}

async function fetchOutboxEvents(entityId: string, customerId?: string): Promise<TimelineNode[]> {
  let query = supabaseAdmin
    .from('outbox')
    .select('*')
    .order('created_at', { ascending: true })

  if (customerId) {
    void query.eq('entity_id', customerId)
  } else {
    void query.eq('entity_id', entityId)
  }

  const { data, error } = await query.limit(500)
  if (error || !data) return []

  return data.map((row: any) => ({
    id: row.id,
    type: row.type,
    timestamp: row.created_at,
    correlationId: row.correlation_id || '',
    causationId: row.causation_id || null,
    source: (row.type?.startsWith('orchestration.') ? 'orchestration' : 'system') as TimelineSource,
    payload: row.payload || {},
    topologyOrder: 0,
  }))
}

async function fetchProjectionDeltas(entityId: string, customerId?: string): Promise<TimelineNode[]> {
  let query = supabaseAdmin
    .from('projection_delta_log')
    .select('*')
    .order('occurred_at', { ascending: true })

  if (customerId) {
    void query.eq('customer_id', customerId)
  } else {
    void query.eq('invoice_id', entityId)
  }

  const { data, error } = await query.limit(500)
  if (error || !data) return []

  return data.map((row: any) => ({
    id: `proj_delta_${row.id}`,
    type: 'projection.delta',
    timestamp: row.occurred_at,
    correlationId: row.billzo_message_id || '',
    causationId: null,
    source: 'system' as TimelineSource,
    payload: row as Record<string, unknown>,
    delta: [
      { field: 'transport_state', before: row.prev_transport_state, after: row.transport_state },
      { field: 'delivery_health', before: row.prev_delivery_health, after: row.delivery_health },
    ].filter(d => d.before !== null || d.after !== null),
    topologyOrder: 0,
  }))
}

async function fetchBehavioralMetrics(customerId: string): Promise<TimelineNode[]> {
  const { data, error } = await supabaseAdmin
    .from('customer_behavioral_metrics')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error || !data) return []

  const metrics = data as unknown as CustomerBehavioralMetrics

  return [{
    id: `behavioral_${metrics.customerId}_${metrics.updatedAt}`,
    type: 'behavioral.snapshot',
    timestamp: metrics.updatedAt,
    correlationId: '',
    causationId: null,
    source: 'behavior' as TimelineSource,
    payload: {
      customerId: metrics.customerId,
      readRate: metrics.readRate,
      paymentConversionRate: metrics.paymentConversionRate,
      avgReadToPayHours: metrics.avgReadToPayHours,
      observationCount: metrics.observationCount,
      totalInterventionsSent: metrics.totalInterventionsSent,
      totalInterventionsRead: metrics.totalInterventionsRead,
      totalResolutionsAfterIntervention: metrics.totalResolutionsAfterIntervention,
      lastReadAt: metrics.lastReadAt,
      lastResolutionAt: metrics.lastResolutionAt,
    } as unknown as Record<string, unknown>,
    topologyOrder: 0,
  }]
}

async function fetchAttributions(entityId: string): Promise<TimelineNode[]> {
  const { data, error } = await supabaseAdmin
    .from('recovery_attributions')
    .select('*')
    .eq('invoice_id', entityId)
    .order('created_at', { ascending: true })

  if (error || !data) return []

  return data.map((row: any) => ({
    id: `attr_${row.id}`,
    type: 'attribution.assigned',
    timestamp: row.created_at,
    correlationId: row.reminder_event_id || '',
    causationId: row.reminder_event_id || null,
    source: 'attribution' as TimelineSource,
    payload: row as Record<string, unknown>,
    topologyOrder: 0,
  }))
}

// ============================================================
// CYCLE DETECTION — Kahn's algorithm
// ============================================================

export function detectCycles(nodes: TimelineNode[], edges: CausalEdge[]): {
  hasCycle: boolean
  cycles: string[][]
  quarantinedEdges: CausalEdge[]
  sorted: TimelineNode[]
} {
  const nodeIds = new Set(nodes.map(n => n.id))
  const adj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const edgeMap = new Map<string, CausalEdge[]>()

  for (const id of nodeIds) {
    adj.set(id, [])
    inDegree.set(id, 0)
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    adj.get(edge.from)!.push(edge.to)
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1)
    const key = `${edge.from}→${edge.to}`
    if (!edgeMap.has(key)) edgeMap.set(key, [])
    edgeMap.get(key)!.push(edge)
  }

  // Kahn's algorithm
  const queue: string[] = []
  const quarantinedEdges: CausalEdge[] = []
  let processed = 0

  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    processed++

    for (const neighbor of adj.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) {
        queue.push(neighbor)
      }
    }
  }

  // Detect cycles: nodes with remaining in-degree
  const cycles: string[][] = []
  const remaining = [...inDegree.entries()].filter(([_, deg]) => deg > 0)

  if (remaining.length > 0) {
    const remainingSet = new Set(remaining.map(([id]) => id))
    const visited = new Set<string>()

    for (const [start] of remaining) {
      if (visited.has(start)) continue
      const cycle: string[] = []
      let current: string | undefined = start
      while (current && remainingSet.has(current) && !visited.has(current)) {
        visited.add(current)
        cycle.push(current)
        current = adj.get(current)?.find(n => remainingSet.has(n))
      }
      if (cycle.length > 0) cycles.push(cycle)
    }

    // Quarantine edges that participate in cycles
    for (const cycle of cycles) {
      for (let i = 0; i < cycle.length; i++) {
        const from = cycle[i]
        const to = cycle[(i + 1) % cycle.length]
        const key = `${from}→${to}`
        if (edgeMap.has(key)) {
          quarantinedEdges.push(...edgeMap.get(key)!)
          edgeMap.delete(key)
        }
      }
    }
  }

  // Rebuild adjacency without quarantined edges
  const adjClean = new Map<string, string[]>()
  for (const id of nodeIds) adjClean.set(id, [])
  for (const edge of edges) {
    if (quarantinedEdges.includes(edge)) continue
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    adjClean.get(edge.from)!.push(edge.to)
  }

  // Partial ordering: sort by topological level + timestamp
  // Recompute in-degrees from scratch (Kahn's algorithm cleared the originals)
  const inDegreeForLevels = new Map<string, number>()
  for (const id of nodeIds) inDegreeForLevels.set(id, 0)
  for (const edge of edges) {
    if (quarantinedEdges.includes(edge)) continue
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    inDegreeForLevels.set(edge.to, (inDegreeForLevels.get(edge.to) || 0) + 1)
  }

  const level = new Map<string, number>()
  const q: string[] = []

  for (const [id, deg] of inDegreeForLevels) {
    if (deg === 0) {
      q.push(id)
      level.set(id, 0)
    }
  }

  while (q.length > 0) {
    const current = q.shift()!
    const currentLevel = level.get(current) || 0

    for (const neighbor of adjClean.get(current) || []) {
      const newDeg = (inDegreeForLevels.get(neighbor) || 0) - 1
      inDegreeForLevels.set(neighbor, newDeg)
      if (newDeg >= 0) {
        level.set(neighbor, Math.max(level.get(neighbor) || 0, currentLevel + 1))
      }
      if (newDeg === 0) {
        q.push(neighbor)
      }
    }
  }

  // Assign topology order: level first, timestamp as tiebreaker
  const sorted = [...nodes].sort((a, b) => {
    const la = level.get(a.id) ?? 0
    const lb = level.get(b.id) ?? 0
    if (la !== lb) return la - lb
    return a.timestamp.localeCompare(b.timestamp)
  })

  sorted.forEach((node, i) => { node.topologyOrder = i })

  return {
    hasCycle: cycles.length > 0,
    cycles,
    quarantinedEdges,
    sorted,
  }
}

// ============================================================
// EDGE BUILDER
// ============================================================

export function buildEdges(nodes: TimelineNode[]): CausalEdge[] {
  const edges: CausalEdge[] = []
  const nodeMap = new Map<string, TimelineNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Causation edges: causationId → id
  for (const node of nodes) {
    if (node.causationId && nodeMap.has(node.causationId)) {
      edges.push({ from: node.causationId, to: node.id, type: 'causation' })
    }
  }

  // Correlation edges: events sharing same correlationId
  const corrGroups = new Map<string, TimelineNode[]>()
  for (const node of nodes) {
    if (!node.correlationId) continue
    if (!corrGroups.has(node.correlationId)) corrGroups.set(node.correlationId, [])
    corrGroups.get(node.correlationId)!.push(node)
  }
  for (const [, group] of corrGroups) {
    if (group.length < 2) continue
    group.sort((a, b) => a.topologyOrder - b.topologyOrder)
    for (let i = 0; i < group.length - 1; i++) {
      edges.push({ from: group[i].id, to: group[i + 1].id, type: 'correlation' })
    }
  }

  // Sequence edges: transport events within same conversation
  const convGroups = new Map<string, TimelineNode[]>()
  for (const node of nodes) {
    if (node.source !== 'transport') continue
    const conv = (node.payload as any)?.conversation_id as string || ''
    if (!conv) continue
    if (!convGroups.has(conv)) convGroups.set(conv, [])
    convGroups.get(conv)!.push(node)
  }
  for (const [, group] of convGroups) {
    group.sort((a, b) => (a.eventSequence ?? 0) - (b.eventSequence ?? 0))
    for (let i = 0; i < group.length - 1; i++) {
      edges.push({ from: group[i].id, to: group[i + 1].id, type: 'sequence' })
    }
  }

  return edges
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function buildRecoveryTimeline(query: TimelineQuery): Promise<CausalGraph> {
  const entityId = query.invoiceId || query.customerId || query.billzoMessageId || query.recoveryCaseId || ''
  if (!entityId) {
    return { nodes: [], edges: [], hasCycle: false, quarantinedEdges: [] }
  }

  const customerId = query.customerId

  // Fetch from all sources in parallel
  const [transportNodes, outboxNodes, deltaNodes, attrNodes] = await Promise.all([
    fetchWhatsAppEvents(entityId, customerId),
    fetchOutboxEvents(entityId, customerId),
    fetchProjectionDeltas(entityId, customerId),
    fetchAttributions(entityId),
  ])

  // Fetch behavioral metrics if we have a customer ID
  let behaviorNodes: TimelineNode[] = []
  const cid = customerId || transportNodes.find(n => (n.payload as any)?.customer_id)?.payload?.customer_id as string
  if (cid) {
    behaviorNodes = await fetchBehavioralMetrics(cid)
  }

  // Merge all nodes
  const allNodes = [...transportNodes, ...outboxNodes, ...deltaNodes, ...behaviorNodes, ...attrNodes]

  // Deduplicate by (source, id)
  const seen = new Set<string>()
  const deduped: TimelineNode[] = []
  for (const node of allNodes) {
    const key = `${node.source}:${node.id}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(node)
  }

  if (deduped.length === 0) {
    return { nodes: [], edges: [], hasCycle: false, quarantinedEdges: [] }
  }

  // Build edges
  const edges = buildEdges(deduped)

  // Topological sort with cycle detection
  const { hasCycle, quarantinedEdges, sorted } = detectCycles(deduped, edges)

  // Rebuild edges from sorted nodes
  const finalEdges = buildEdges(sorted)

  return {
    nodes: sorted,
    edges: finalEdges.filter(e => !quarantinedEdges.includes(e)),
    hasCycle,
    quarantinedEdges,
  }
}
