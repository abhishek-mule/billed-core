import { describe, it, expect } from 'vitest'
import { RuntimeOrchestrator, RuntimePhase } from '../runtime-phase'
import { CapabilityRegistry } from '../capabilities'
import { assertOperational } from '../readiness'
import { LocalFallbackRateLimitStore, createDegradeableRateLimitStore } from '../rate-limit-store'
import { emitRuntimeFingerprint, DECISION_GRAPH_VERSION } from '../runtime-fingerprint'
import type { SovereigntyRule, RateLimitState } from '../schemas'
import type { RateLimitStore } from '../core'

// ============================================================
// RuntimePhase + RuntimeOrchestrator
// ============================================================

describe('RuntimeOrchestrator', () => {
  it('starts in PREBOOT', () => {
    const o = new RuntimeOrchestrator()
    expect(o.currentPhase).toBe(RuntimePhase.PREBOOT)
  })

  it('transitions forward through phases in order', () => {
    const o = new RuntimeOrchestrator()
    o.transition(RuntimePhase.POLICY_READY)
    expect(o.currentPhase).toBe(RuntimePhase.POLICY_READY)
    o.transition(RuntimePhase.CAPABILITIES_READY)
    expect(o.currentPhase).toBe(RuntimePhase.CAPABILITIES_READY)
    o.transition(RuntimePhase.AUTHORITY_READY)
    expect(o.currentPhase).toBe(RuntimePhase.AUTHORITY_READY)
  })

  it('throws on skipping phases', () => {
    const o = new RuntimeOrchestrator()
    expect(() => o.transition(RuntimePhase.HTTP_READY)).toThrow('skip')
  })

  it('throws on going backwards', () => {
    const o = new RuntimeOrchestrator()
    o.transition(RuntimePhase.POLICY_READY)
    expect(() => o.transition(RuntimePhase.PREBOOT)).toThrow('advance')
  })

  it('throws on staying in same phase', () => {
    const o = new RuntimeOrchestrator()
    expect(() => o.transition(RuntimePhase.PREBOOT)).toThrow('advance')
  })

  it('assertPhase throws when below required', () => {
    const o = new RuntimeOrchestrator()
    expect(() => o.assertPhase(RuntimePhase.POLICY_READY)).toThrow('not ready')
  })

  it('assertPhase passes when at required phase', () => {
    const o = new RuntimeOrchestrator()
    o.transition(RuntimePhase.POLICY_READY)
    expect(() => o.assertPhase(RuntimePhase.POLICY_READY)).not.toThrow()
  })

  it('panic transitions to PANIC from any phase', () => {
    const o = new RuntimeOrchestrator()
    o.transition(RuntimePhase.POLICY_READY)
    o.panic('test failure')
    expect(o.currentPhase).toBe(RuntimePhase.PANIC)
  })

  it('degrade transitions to DEGRADED', () => {
    const o = new RuntimeOrchestrator()
    o.transition(RuntimePhase.POLICY_READY)
    o.degrade('redis unavailable')
    expect(o.currentPhase).toBe(RuntimePhase.DEGRADED)
  })

  it('isInPhase returns true for current phase', () => {
    const o = new RuntimeOrchestrator()
    expect(o.isInPhase(RuntimePhase.PREBOOT)).toBe(true)
    expect(o.isInPhase(RuntimePhase.POLICY_READY)).toBe(false)
  })

  it('isAtLeast returns true for reached phases', () => {
    const o = new RuntimeOrchestrator()
    o.transition(RuntimePhase.POLICY_READY)
    expect(o.isAtLeast(RuntimePhase.PREBOOT)).toBe(true)
    expect(o.isAtLeast(RuntimePhase.POLICY_READY)).toBe(true)
    expect(o.isAtLeast(RuntimePhase.CAPABILITIES_READY)).toBe(false)
  })

  it('calls onTransition listener', () => {
    const o = new RuntimeOrchestrator()
    const transitions: Array<{ from: RuntimePhase; to: RuntimePhase }> = []
    o.onTransition((from, to) => transitions.push({ from, to }))
    o.transition(RuntimePhase.POLICY_READY)
    expect(transitions).toHaveLength(1)
    expect(transitions[0].from).toBe(RuntimePhase.PREBOOT)
    expect(transitions[0].to).toBe(RuntimePhase.POLICY_READY)
  })
})

// ============================================================
// CapabilityRegistry — freeze / assertRequiredCapabilities
// ============================================================

describe('CapabilityRegistry freeze', () => {
  it('allows registration before freeze', () => {
    const reg = new CapabilityRegistry()
    reg.register({ capabilityId: 'test' } as any)
    expect(reg.size).toBe(1)
  })

  it('refuses registration after freeze', () => {
    const reg = new CapabilityRegistry()
    reg.register({ capabilityId: 'test' } as any)
    reg.freeze()
    expect(() => reg.register({ capabilityId: 'another' } as any)).toThrow('frozen')
  })

  it('isFrozen returns true after freeze', () => {
    const reg = new CapabilityRegistry()
    expect(reg.isFrozen).toBe(false)
    reg.freeze()
    expect(reg.isFrozen).toBe(true)
  })

  it('runtimeHash is available after freeze', () => {
    const reg = new CapabilityRegistry()
    reg.register({ capabilityId: 'a' } as any)
    reg.register({ capabilityId: 'b' } as any)
    reg.freeze()
    expect(typeof reg.runtimeHash).toBe('string')
    expect(reg.runtimeHash.length).toBe(64)
  })

  it('runtimeHash throws before freeze', () => {
    const reg = new CapabilityRegistry()
    expect(() => reg.runtimeHash).toThrow('not yet frozen')
  })

  it('assertRequiredCapabilities passes when all present', () => {
    const reg = new CapabilityRegistry()
    reg.register({ capabilityId: 'a' } as any)
    reg.register({ capabilityId: 'b' } as any)
    expect(() => reg.assertRequiredCapabilities(['a', 'b'])).not.toThrow()
  })

  it('assertRequiredCapabilities throws when missing', () => {
    const reg = new CapabilityRegistry()
    reg.register({ capabilityId: 'a' } as any)
    expect(() => reg.assertRequiredCapabilities(['a', 'b'])).toThrow('missing')
  })
})

// ============================================================
// Readiness
// ============================================================

describe('assertOperational', () => {
  it('passes when all dependencies are ready', () => {
    const reg = new CapabilityRegistry()
    reg.freeze()
    const report = assertOperational({
      phase: RuntimePhase.RUNNING,
      capabilityRegistry: reg,
      policyPresent: true,
      gatewayListening: true,
    })
    expect(report.operational).toBe(true)
  })

  it('fails when phase is PREBOOT', () => {
    const report = assertOperational({
      phase: RuntimePhase.PREBOOT,
      capabilityRegistry: new CapabilityRegistry(),
      policyPresent: false,
      gatewayListening: false,
    })
    expect(report.operational).toBe(false)
    expect(report.checks.find((c) => c.name === 'runtime_phase')?.ok).toBe(false)
  })

  it('fails when capability registry not frozen', () => {
    const report = assertOperational({
      phase: RuntimePhase.RUNNING,
      capabilityRegistry: new CapabilityRegistry(),
      policyPresent: true,
      gatewayListening: true,
    })
    expect(report.operational).toBe(false)
  })
})

// ============================================================
// Rate Limit Store (degrade-able)
// ============================================================

describe('createDegradeableRateLimitStore', () => {
  it('returns primary store when available', () => {
    const primary: RateLimitStore = {
      getCurrentCounts: async () => ({ perHour: 5 }),
    }
    const store = createDegradeableRateLimitStore(primary)
    expect(store).toBe(primary)
  })

  it('returns LocalFallback when primary is null', () => {
    const store = createDegradeableRateLimitStore(null)
    expect(store instanceof LocalFallbackRateLimitStore).toBe(true)
  })
})

describe('LocalFallbackRateLimitStore', () => {
  it('track returns allowed for first request', () => {
    const store = new LocalFallbackRateLimitStore()
    const result = store.track('key', 60000, 10)
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(1)
  })

  it('track rejects when limit exceeded', () => {
    const store = new LocalFallbackRateLimitStore()
    store.track('key', 60000, 2)
    store.track('key', 60000, 2)
    const result = store.track('key', 60000, 2)
    expect(result.allowed).toBe(false)
  })
})

// ============================================================
// Runtime fingerprint
// ============================================================

describe('emitRuntimeFingerprint', () => {
  it('includes policy_hash, capability_hash, decision_graph_version', () => {
    const fp = emitRuntimeFingerprint({
      policyHash: 'abc123',
      policyVersion: '1.0.0',
      capabilityIds: ['tenant.provision', 'invoice.issue'],
    })
    expect(fp.policy_hash).toBe('abc123')
    expect(fp.decision_graph_version).toBe(DECISION_GRAPH_VERSION)
    expect(fp.capability_hash).toHaveLength(64)
    expect(fp.environment).toBeTruthy()
  })

  it('capability hash is deterministic given same IDs', () => {
    const a = emitRuntimeFingerprint({ policyHash: 'x', policyVersion: '1', capabilityIds: ['a', 'b'] })
    const b = emitRuntimeFingerprint({ policyHash: 'x', policyVersion: '1', capabilityIds: ['b', 'a'] })
    expect(a.capability_hash).toBe(b.capability_hash)
  })
})
