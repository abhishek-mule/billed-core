// ============================================================
// SpineDiagnostics — Phase 0 measurement probes
// ============================================================
// This module instruments the current system to measure how
// often it violates the Event Spine invariants.
//
// It is PURELY OBSERVATIONAL. No behavioral changes.
// All probes are no-op if diagnostics are disabled.
//
// Phase 0 goal: establish baseline violation rates before
// any enforcement is introduced.
// ============================================================

export interface SpineDiagnosticsSnapshot {
  counters: {
    date_now_in_domain: number
    out_of_order_events: number
    missing_external_refs: number
    dual_write_paths: number
    missing_causation_id: number
    non_deterministic_uuid: number
  }
  lastViolation: {
    type: string
    timestamp: string
    detail: string
  } | null
  startedAt: string
  uptimeSeconds: number
}

class SpineDiagnosticsImpl {
  private _startedAt = Date.now()
  private _counters = {
    date_now_in_domain: 0,
    out_of_order_events: 0,
    missing_external_refs: 0,
    dual_write_paths: 0,
    missing_causation_id: 0,
    non_deterministic_uuid: 0,
  }
  private _lastViolation: SpineDiagnosticsSnapshot['lastViolation'] = null
  private _enabled = true

  get enabled(): boolean {
    return this._enabled
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  private record(type: string, detail: string): void {
    if (!this._enabled) return
    this._lastViolation = {
      type,
      timestamp: new Date().toISOString(),
      detail,
    }
  }

  // ----------------------------------------------------------
  // Probe: Date.now() used inside domain/state-machine logic
  // ----------------------------------------------------------
  dateNowInDomain(source: string): number {
    this._counters.date_now_in_domain++
    this.record('date_now_in_domain', source)
    return Date.now()
  }

  // ----------------------------------------------------------
  // Probe: events processed out of sequence for same entity
  // ----------------------------------------------------------
  outOfOrderEvent(entityId: string, expectedSeq: number, actualSeq: number): void {
    this._counters.out_of_order_events++
    this.record('out_of_order_events', `entity=${entityId} expected=${expectedSeq} actual=${actualSeq}`)
  }

  // ----------------------------------------------------------
  // Probe: event emitted without external provider references
  // ----------------------------------------------------------
  missingExternalRefs(eventType: string, entityId: string | null): void {
    this._counters.missing_external_refs++
    this.record('missing_external_refs', `type=${eventType} entity=${entityId ?? 'null'}`)
  }

  // ----------------------------------------------------------
  // Probe: code writing directly to DB instead of through spine
  // ----------------------------------------------------------
  dualWrite(module: string, table: string): void {
    this._counters.dual_write_paths++
    this.record('dual_write_paths', `${module} → ${table}`)
  }

  // ----------------------------------------------------------
  // Probe: event emitted without causation_id
  // ----------------------------------------------------------
  missingCausationId(eventType: string): void {
    this._counters.missing_causation_id++
    this.record('missing_causation_id', `type=${eventType}`)
  }

  // ----------------------------------------------------------
  // Probe: crypto.randomUUID() used where deterministic ID expected
  // ----------------------------------------------------------
  nonDeterministicUuid(source: string): void {
    this._counters.non_deterministic_uuid++
    this.record('non_deterministic_uuid', source)
  }

  // ----------------------------------------------------------
  // Diagnostic log — single-line structured output
  // ----------------------------------------------------------
  log(): void {
    if (!this._enabled) return
    const s = this.snapshot()
    console.log(JSON.stringify({
      type: 'spine_diagnostics',
      counters: s.counters,
      lastViolation: s.lastViolation,
      uptimeSeconds: s.uptimeSeconds,
      timestamp: new Date().toISOString(),
    }))
  }

  // ----------------------------------------------------------
  // Snapshot — return current state (thread-safe via struct copy)
  // ----------------------------------------------------------
  snapshot(): SpineDiagnosticsSnapshot {
    return {
      counters: { ...this._counters },
      lastViolation: this._lastViolation,
      startedAt: new Date(this._startedAt).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this._startedAt) / 1000),
    }
  }

  // ----------------------------------------------------------
  // Reset all counters (for tests)
  // ----------------------------------------------------------
  reset(): void {
    this._counters = {
      date_now_in_domain: 0,
      out_of_order_events: 0,
      missing_external_refs: 0,
      dual_write_paths: 0,
      missing_causation_id: 0,
      non_deterministic_uuid: 0,
    }
    this._lastViolation = null
    this._startedAt = Date.now()
  }
}

export const spineDiagnostics = new SpineDiagnosticsImpl()
