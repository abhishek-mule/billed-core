import type { RuntimePhase } from './runtime-phase'
import type { CapabilityRegistry } from './capabilities'

export interface ReadinessCheck {
  readonly name: string
  readonly ok: boolean
  readonly error?: string
}

export interface ReadinessReport {
  readonly operational: boolean
  readonly phase: RuntimePhase
  readonly checks: readonly ReadinessCheck[]
}

export interface ReadinessDependencies {
  readonly phase: RuntimePhase
  readonly capabilityRegistry: CapabilityRegistry
  readonly policyPresent: boolean
  readonly gatewayListening: boolean
}

export function assertOperational(deps: ReadinessDependencies): ReadinessReport {
  const checks: ReadinessCheck[] = []

  // Phase check
  checks.push({
    name: 'runtime_phase',
    ok: deps.phase !== 'PREBOOT' && deps.phase !== 'PANIC',
    error: deps.phase === 'PREBOOT' ? 'Runtime has not started' :
           deps.phase === 'PANIC' ? 'Runtime is in PANIC state' : undefined,
  })

  // Policy registry
  checks.push({
    name: 'policy_present',
    ok: deps.policyPresent,
    error: deps.policyPresent ? undefined : 'No policy bundle loaded',
  })

  // Capability registry
  checks.push({
    name: 'capability_registry_frozen',
    ok: deps.capabilityRegistry.isFrozen,
    error: deps.capabilityRegistry.size === 0
      ? 'No capabilities registered'
      : 'Capability registry not frozen',
  })

  // Gateway
  checks.push({
    name: 'gateway_listening',
    ok: deps.gatewayListening,
    error: deps.gatewayListening ? undefined : 'Gateway not listening',
  })

  const operational = checks.every((c) => c.ok)

  return {
    operational,
    phase: deps.phase,
    checks,
  }
}
