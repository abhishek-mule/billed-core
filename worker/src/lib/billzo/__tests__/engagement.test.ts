import { describe, it, expect } from 'vitest'
import {
  resolveProjectionState,
  TRANSPORT_PRECEDENCE,
  LOCKED_STATES,
} from '../engagement'
import type {
  ProjectionTransportState,
  ProjectionDeliveryHealth,
  ProjectionState,
  IncomingEvent,
} from '../engagement'

// ============================================================
// TEST UTILITIES
// ============================================================

function ev(
  transportState: ProjectionTransportState,
  seq: number,
  deliveryHealth: ProjectionDeliveryHealth = 'healthy',
  eventId?: string,
): IncomingEvent {
  return {
    transportState,
    deliveryHealth,
    eventSequence: BigInt(seq),
    occurredAt: `2026-01-01T00:00:0${seq}Z`,
    eventId: eventId ?? `evt-${seq}`,
  }
}

function st(
  transportState: ProjectionTransportState,
  seq: number,
  deliveryHealth: ProjectionDeliveryHealth = 'healthy',
  fc = 0,
  lsda: string | null = null,
  lastEventId = 'evt-init',
): ProjectionState {
  return {
    transportState,
    deliveryHealth,
    latestEventSequence: BigInt(seq),
    occurredAt: `2026-01-01T00:00:0${seq}Z`,
    lastEventId,
    failureCount: fc,
    lastSuccessfulDeliveryAt: lsda,
  }
}

function resolveSequence(
  initial: ProjectionState | null,
  events: IncomingEvent[],
): ProjectionState | null {
  let current = initial
  for (const e of events) {
    const r = resolveProjectionState(current, e)
    if (r.nextState) current = r.nextState
  }
  return current
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm])
    }
  }
  return result
}

// ============================================================
// INVARIANT / PROPERTY TESTS
// ============================================================

describe('invariants', () => {
  it('transport precedence never regresses across a sequence', () => {
    const events = [
      ev('queued', 1),
      ev('sent', 2),
      ev('sent', 3, 'retrying'),
      ev('delivered', 4),
    ]
    let current: ProjectionState | null = null
    let lastPrecedence = -1
    for (const e of events) {
      const res = resolveProjectionState(current, e)
      if (res.shouldApply && res.nextState) {
        const prec = TRANSPORT_PRECEDENCE[res.nextState.transportState]
        expect(prec).toBeGreaterThanOrEqual(lastPrecedence)
        lastPrecedence = prec
        current = res.nextState
      }
    }
    expect(lastPrecedence).toBe(TRANSPORT_PRECEDENCE['delivered'])
  })

  it('terminal states are immutable — no event transitions out', () => {
    const terminal = st('failed_terminal', 5)
    const all: ProjectionTransportState[] = [
      'queued',
      'sent',
      'server_ack',
      'delivered',
      'read',
      'received',
    ]
    for (const s of all) {
      const res = resolveProjectionState(terminal, ev(s, 6))
      expect(res.shouldApply).toBe(false)
      expect(res.reason).toBe('terminal_failure_locked')
    }
  })

  it('replaying same event N times yields same state as one application', () => {
    const e = ev('delivered', 5)
    const single = resolveProjectionState(null, e)

    let current: ProjectionState | null = null
    for (let i = 0; i < 10; i++) {
      current = resolveProjectionState(current, e).nextState ?? current
    }
    expect(current).toEqual(single.nextState)
  })

  it('lower precedence cannot override higher precedence regardless of sequence number', () => {
    const current = st('delivered', 1)
    const incoming = ev('queued', 999999)
    const res = resolveProjectionState(current, incoming)
    expect(res.shouldApply).toBe(false)
    expect(res.reason).toBe('stale')
  })

  it('failureCount never decreases', () => {
    const events: IncomingEvent[] = [
      ev('sent', 1, 'retrying'),
      ev('sent', 2, 'retrying'),
      ev('delivered', 3),
    ]
    let current: ProjectionState | null = null
    let lastFc = -1
    for (const e of events) {
      const res = resolveProjectionState(current, e)
      if (res.nextState) {
        expect(res.nextState.failureCount).toBeGreaterThanOrEqual(lastFc)
        lastFc = res.nextState.failureCount
        current = res.nextState
      }
    }
  })

  it('lastSuccessfulDeliveryAt once set is never cleared', () => {
    const withDelivery = st('sent', 2, 'healthy', 0, '2026-01-01T00:00:02Z')
    const res = resolveProjectionState(withDelivery, ev('sent', 3))
    expect(res.shouldApply).toBe(true)
    expect(res.nextState?.lastSuccessfulDeliveryAt).toBe(
      '2026-01-01T00:00:02Z',
    )
  })

  it('duplicate event (same status + sequence) resolves as duplicate not stale', () => {
    const current = st('delivered', 5)
    const res = resolveProjectionState(current, ev('delivered', 5))
    expect(res.shouldApply).toBe(false)
    expect(res.reason).toBe('duplicate')
  })

  it('resolveProjectionState is deterministic — same inputs always same output', () => {
    const inputs: Array<[ProjectionState | null, IncomingEvent]> = [
      [null, ev('queued', 1)],
      [st('delivered', 3), ev('read', 5)],
      [st('failed_terminal', 2), ev('delivered', 3)],
      [st('sent', 4), ev('sent', 3)],
      [st('sent', 2, 'retrying', 1), ev('failed_terminal', 3)],
    ]
    for (const [current, incoming] of inputs) {
      const first = resolveProjectionState(current, incoming)
      for (let i = 0; i < 5; i++) {
        expect(resolveProjectionState(current, incoming)).toEqual(first)
      }
    }
  })
})

// ============================================================
// SCENARIO TESTS
// ============================================================

describe('scenarios', () => {
  it('normal delivery: queued → sent → delivered → read', () => {
    const events = [
      ev('queued', 1),
      ev('sent', 2),
      ev('delivered', 3),
      ev('read', 4),
    ]
    const final = resolveSequence(null, events)
    expect(final?.transportState).toBe('read')
    expect(final?.failureCount).toBe(0)
    expect(final?.lastSuccessfulDeliveryAt).toBe('2026-01-01T00:00:04Z')
  })

  it('transient failure then retry succeeds', () => {
    const events = [
      ev('queued', 1),
      ev('sent', 2, 'retrying'),
      ev('sent', 3),
      ev('delivered', 4),
    ]
    const final = resolveSequence(null, events)
    expect(final?.transportState).toBe('delivered')
    expect(final?.failureCount).toBe(1)
    expect(final?.lastSuccessfulDeliveryAt).toBe('2026-01-01T00:00:04Z')
  })

  it('terminal failure locks projection', () => {
    const events = [
      ev('queued', 1),
      ev('sent', 2),
      ev('failed_terminal', 3),
    ]
    const final = resolveSequence(null, events)
    expect(final?.transportState).toBe('failed_terminal')
    expect(final?.failureCount).toBe(1)
    expect(
      resolveProjectionState(final, ev('delivered', 4)).shouldApply,
    ).toBe(false)
    expect(
      resolveProjectionState(final, ev('read', 5)).reason,
    ).toBe('terminal_failure_locked')
  })

  it('failure escalation: transient retries then terminal', () => {
    const events = [
      ev('sent', 1, 'retrying'),
      ev('failed_terminal', 2),
    ]
    const final = resolveSequence(null, events)
    expect(final?.transportState).toBe('failed_terminal')
    expect(final?.failureCount).toBe(2)
  })

  it('late duplicate webhook is rejected as stale', () => {
    const current = st('delivered', 4)
    const res = resolveProjectionState(current, ev('sent', 3))
    expect(res.shouldApply).toBe(false)
    expect(res.reason).toBe('stale')
  })

  it('sequence inversion — delayed older webhook after newer state', () => {
    const current = st('read', 2)
    const res = resolveProjectionState(current, ev('delivered', 1))
    expect(res.shouldApply).toBe(false)
    expect(res.reason).toBe('stale')
  })

  it('same prec different status — newer sequence wins', () => {
    const events = [ev('received', 1), ev('delivered', 2)]
    const final = resolveSequence(null, events)
    expect(final?.transportState).toBe('delivered')
  })

  it('multiple transient failures before eventual delivery', () => {
    const events = [
      ev('sent', 1, 'retrying'),
      ev('sent', 2, 'retrying'),
      ev('delivered', 3),
    ]
    const final = resolveSequence(null, events)
    expect(final?.transportState).toBe('delivered')
    expect(final?.failureCount).toBe(2)
  })

  it('terminal resists all subsequent events', () => {
    const terminal = st('failed_terminal', 3)
    const attempts: IncomingEvent[] = [
      ev('queued', 4),
      ev('sent', 5),
      ev('delivered', 6),
      ev('read', 7),
      ev('sent', 8, 'retrying'),
    ]
    for (const attempt of attempts) {
      const res = resolveProjectionState(terminal, attempt)
      expect(res.shouldApply).toBe(false)
      expect(res.reason).toBe('terminal_failure_locked')
    }
  })

  it('zero-to-terminal first event', () => {
    const res = resolveProjectionState(null, ev('failed_terminal', 1))
    expect(res.shouldApply).toBe(true)
    expect(res.nextState?.transportState).toBe('failed_terminal')
    expect(res.nextState?.failureCount).toBe(1)
  })
})

// ============================================================
// PERMUTATION TESTS
// ============================================================

describe('permutations', () => {
  function assertFinalTransportState(
    events: IncomingEvent[],
    expected: ProjectionTransportState,
  ) {
    const allPerms = permutations(events)
    for (const perm of allPerms) {
      const final = resolveSequence(null, perm)
      expect(final?.transportState).toBe(expected)
    }
  }

  it('normal delivery converges to delivered regardless of order', () => {
    assertFinalTransportState(
      [ev('queued', 1), ev('sent', 2), ev('delivered', 3)],
      'delivered',
    )
  })

  it('transient failure + retry always converges to delivered', () => {
    assertFinalTransportState(
      [
        ev('queued', 1),
        ev('sent', 2, 'retrying'),
        ev('sent', 3),
        ev('delivered', 4),
      ],
      'delivered',
    )
  })

  it('terminal failure always converges to failed_terminal', () => {
    assertFinalTransportState(
      [ev('queued', 1), ev('sent', 2), ev('failed_terminal', 3)],
      'failed_terminal',
    )
  })

  it('stale events do not affect final state', () => {
    assertFinalTransportState(
      [ev('sent', 3), ev('delivered', 5)],
      'delivered',
    )
  })

  it('duplicate events converge to same final state', () => {
    assertFinalTransportState(
      [ev('delivered', 5), ev('delivered', 5), ev('read', 6)],
      'read',
    )
  })
})

// ============================================================
// REPLAY TESTS
// ============================================================

describe('replay', () => {
  const replayEvents: IncomingEvent[] = [
    ev('queued', 1),
    ev('sent', 2),
    ev('sent', 3, 'retrying'),
    ev('sent', 4),
    ev('delivered', 5),
    ev('read', 6),
  ]

  it('full replay yields identical final state', () => {
    const first = resolveSequence(null, replayEvents)
    for (let i = 0; i < 5; i++) {
      expect(resolveSequence(null, replayEvents)).toEqual(first)
    }
  })

  it('partial replay from sequence offset converges to same transport state', () => {
    const full = resolveSequence(null, replayEvents)
    const partial = replayEvents.slice(3)
    const fromOffset = resolveSequence(null, partial)
    expect(fromOffset?.transportState).toBe(full?.transportState)
  })
})
