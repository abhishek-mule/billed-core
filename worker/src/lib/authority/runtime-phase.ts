const PHASE_ORDER: Record<RuntimePhase, number> = {
  PREBOOT: 0,
  POLICY_READY: 1,
  CAPABILITIES_READY: 2,
  AUTHORITY_READY: 3,
  QUEUES_READY: 4,
  HTTP_READY: 5,
  RUNNING: 6,
  DEGRADED: -1,
  PANIC: -2,
}

export enum RuntimePhase {
  PREBOOT = 'PREBOOT',
  POLICY_READY = 'POLICY_READY',
  CAPABILITIES_READY = 'CAPABILITIES_READY',
  AUTHORITY_READY = 'AUTHORITY_READY',
  QUEUES_READY = 'QUEUES_READY',
  HTTP_READY = 'HTTP_READY',
  RUNNING = 'RUNNING',
  DEGRADED = 'DEGRADED',
  PANIC = 'PANIC',
}

function phaseOrdinal(phase: RuntimePhase): number {
  return PHASE_ORDER[phase]
}

export class RuntimeOrchestrator {
  private _current: RuntimePhase = RuntimePhase.PREBOOT
  private readonly log: (msg: string) => void
  private readonly listeners: Array<(from: RuntimePhase, to: RuntimePhase) => void> = []

  constructor(log?: (msg: string) => void) {
    this.log = log ?? console.log
  }

  get currentPhase(): RuntimePhase {
    return this._current
  }

  onTransition(fn: (from: RuntimePhase, to: RuntimePhase) => void): void {
    this.listeners.push(fn)
  }

  transition(to: RuntimePhase): void {
    const from = this._current
    const fromOrd = phaseOrdinal(from)
    const toOrd = phaseOrdinal(to)

    if (to === RuntimePhase.PANIC || to === RuntimePhase.DEGRADED) {
      this._current = to
      this.log(`[RuntimeOrchestrator] ${from} → ${to}`)
      for (const fn of this.listeners) fn(from, to)
      return
    }

    if (toOrd < 0) {
      throw new Error(`Cannot transition to ${to} via transition() — use panic() or degrade()`)
    }

    if (toOrd <= fromOrd) {
      throw new Error(`Invalid transition: ${from} → ${to} (phase must advance)`)
    }

    if (toOrd !== fromOrd + 1) {
      throw new Error(`Invalid transition: ${from} → ${to} (cannot skip phases)`)
    }

    this._current = to
    this.log(`[RuntimeOrchestrator] ${from} → ${to}`)
    for (const fn of this.listeners) fn(from, to)
  }

  assertPhase(atLeast: RuntimePhase): void {
    if (phaseOrdinal(this._current) < phaseOrdinal(atLeast)) {
      throw new Error(
        `Runtime phase ${this._current} is below required ${atLeast}. ` +
        `System is not ready for this operation.`,
      )
    }
  }

  panic(error: string): void {
    this.log(`[RuntimeOrchestrator] PANIC: ${error}`)
    this._current = RuntimePhase.PANIC
  }

  degrade(reason: string): void {
    this.log(`[RuntimeOrchestrator] DEGRADED: ${reason}`)
    this._current = RuntimePhase.DEGRADED
  }

  isInPhase(...phases: RuntimePhase[]): boolean {
    return phases.includes(this._current)
  }

  isAtLeast(phase: RuntimePhase): boolean {
    return phaseOrdinal(this._current) >= phaseOrdinal(phase)
  }
}
