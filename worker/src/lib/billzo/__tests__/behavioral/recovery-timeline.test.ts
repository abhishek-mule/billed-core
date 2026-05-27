import { vi, describe, it, expect } from 'vitest'

vi.mock('@supabase/supabase-js', () => {
  const chainable = {
    select: () => chainable,
    order: () => chainable,
    eq: () => chainable,
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  }
  return {
    createClient: () => ({
      from: () => chainable,
    }),
  }
})

import { buildRecoveryTimeline, buildEdges, detectCycles, type TimelineNode, type CausalEdge } from '../../recovery-timeline'

// ============================================================
// Timeline Query (trivial: empty query)
// ============================================================

describe('buildRecoveryTimeline (edge cases)', () => {
  it('returns empty graph for empty query', async () => {
    const result = await buildRecoveryTimeline({})
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.hasCycle).toBe(false)
  })

  it('returns empty graph for unknown query', async () => {
    const result = await buildRecoveryTimeline({ invoiceId: 'nonexistent' })
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })
})

// ============================================================
// buildEdges — Causal, correlation, sequence edges
// ============================================================

describe('buildEdges', () => {
  function node(id: string, overrides: Partial<TimelineNode> = {}): TimelineNode {
    return {
      id,
      type: 'test.event',
      timestamp: '2026-01-01T00:00:00Z',
      correlationId: '',
      causationId: null,
      source: 'system',
      payload: {},
      topologyOrder: 0,
      ...overrides,
    }
  }

  it('creates causation edges from causationId', () => {
    const nodes: TimelineNode[] = [
      node('a'),
      node('b', { causationId: 'a' }),
    ]
    const edges = buildEdges(nodes)
    expect(edges).toContainEqual({ from: 'a', to: 'b', type: 'causation' })
  })

  it('creates correlation edges for shared correlationId', () => {
    const nodes: TimelineNode[] = [
      node('a', { correlationId: 'corr1', topologyOrder: 0 }),
      node('b', { correlationId: 'corr1', topologyOrder: 1 }),
    ]
    const edges = buildEdges(nodes)
    expect(edges).toContainEqual({ from: 'a', to: 'b', type: 'correlation' })
  })

  it('creates sequence edges for transport events in same conversation', () => {
    const nodes: TimelineNode[] = [
      node('msg1', { source: 'transport', topologyOrder: 0, eventSequence: 1, payload: { conversation_id: 'conv1' } }),
      node('msg2', { source: 'transport', topologyOrder: 1, eventSequence: 2, payload: { conversation_id: 'conv1' } }),
    ]
    const edges = buildEdges(nodes)
    expect(edges).toContainEqual({ from: 'msg1', to: 'msg2', type: 'sequence' })
  })

  it('does not create edges for unknown causationIds', () => {
    const nodes: TimelineNode[] = [
      node('a'),
      node('b', { causationId: 'nonexistent' }),
    ]
    const edges = buildEdges(nodes)
    expect(edges.find(e => e.type === 'causation')).toBeUndefined()
  })

  it('handles nodes with no correlatable fields', () => {
    const nodes: TimelineNode[] = [
      node('a'),
      node('b'),
    ]
    const edges = buildEdges(nodes)
    expect(edges).toHaveLength(0)
  })
})

// ============================================================
// detectCycles — Cycle detection with Kahn's algorithm
// ============================================================

describe('detectCycles', () => {
  function node(id: string, overrides: Partial<TimelineNode> = {}): TimelineNode {
    return {
      id,
      type: 'test.event',
      timestamp: '2026-01-01T00:00:00Z',
      correlationId: '',
      causationId: null,
      source: 'system',
      payload: {},
      topologyOrder: 0,
      ...overrides,
    }
  }

  it('returns sorted nodes for acyclic graph', () => {
    const nodes: TimelineNode[] = [
      node('a', { timestamp: '2026-01-01T00:00:00Z' }),
      node('b', { timestamp: '2026-01-01T00:01:00Z' }),
      node('c', { timestamp: '2026-01-01T00:02:00Z' }),
    ]
    const edges: CausalEdge[] = [
      { from: 'a', to: 'b', type: 'causation' },
      { from: 'b', to: 'c', type: 'causation' },
    ]
    const { hasCycle, sorted, quarantinedEdges } = detectCycles(nodes, edges)
    expect(hasCycle).toBe(false)
    expect(sorted.map(n => n.id)).toEqual(['a', 'b', 'c'])
    expect(quarantinedEdges).toHaveLength(0)
  })

  it('detects simple cycle and quarantines edges', () => {
    const nodes: TimelineNode[] = [
      node('a'),
      node('b'),
    ]
    const edges: CausalEdge[] = [
      { from: 'a', to: 'b', type: 'causation' },
      { from: 'b', to: 'a', type: 'causation' },
    ]
    const { hasCycle, cycles, quarantinedEdges, sorted } = detectCycles(nodes, edges)
    expect(hasCycle).toBe(true)
    expect(cycles.length).toBeGreaterThan(0)
    expect(quarantinedEdges.length).toBeGreaterThan(0)
    // Sorted should still include all nodes (partial order)
    expect(sorted.map(n => n.id)).toEqual(['a', 'b'])
  })

  it('handles complex cycle with 3 nodes', () => {
    const nodes: TimelineNode[] = [
      node('a'),
      node('b'),
      node('c'),
    ]
    const edges: CausalEdge[] = [
      { from: 'a', to: 'b', type: 'causation' },
      { from: 'b', to: 'c', type: 'causation' },
      { from: 'c', to: 'a', type: 'causation' },
    ]
    const { hasCycle, quarantinedEdges } = detectCycles(nodes, edges)
    expect(hasCycle).toBe(true)
    expect(quarantinedEdges.length).toBeGreaterThan(0)
  })

  it('handles DAG with disconnected subgraphs', () => {
    const nodes: TimelineNode[] = [
      node('a'),
      node('b'),
      node('c'),
      node('d'),
      node('e'),
    ]
    const edges: CausalEdge[] = [
      { from: 'a', to: 'b', type: 'causation' },
      { from: 'c', to: 'd', type: 'causation' },
      // e is disconnected
    ]
    const { hasCycle, sorted } = detectCycles(nodes, edges)
    expect(hasCycle).toBe(false)
    expect(sorted.map(n => n.id)).toContain('e')
  })

  it('skips edges with unknown node ids', () => {
    const nodes: TimelineNode[] = [node('a')]
    const edges: CausalEdge[] = [
      { from: 'a', to: 'nonexistent', type: 'causation' },
      { from: 'nonexistent', to: 'a', type: 'causation' },
    ]
    const { hasCycle, quarantinedEdges } = detectCycles(nodes, edges)
    expect(hasCycle).toBe(false)
    expect(quarantinedEdges).toHaveLength(0)
  })

  it('preserves timestamp order when topology levels tie', () => {
    const nodes: TimelineNode[] = [
      node('b', { timestamp: '2026-01-01T00:01:00Z' }),
      node('a', { timestamp: '2026-01-01T00:00:00Z' }),
    ]
    const edges: CausalEdge[] = []
    const { sorted } = detectCycles(nodes, edges)
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('b')
  })

  it('causation edges override reverse timestamp order', () => {
    // Event B has earlier timestamp but caused by A
    const nodes: TimelineNode[] = [
      node('a', { timestamp: '2026-01-01T00:05:00Z' }),
      node('b', { timestamp: '2026-01-01T00:01:00Z' }),
    ]
    const edges: CausalEdge[] = [
      { from: 'a', to: 'b', type: 'causation' },
    ]
    const { sorted } = detectCycles(nodes, edges)
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('b')
  })
})
