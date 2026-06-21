// ============================================================
// Audit CLI — Tenant-Wide Financial Drift Scanner
// ============================================================
//
// Scans every invoice for a tenant, replays financial events
// through the reducer, and compares trigger-maintained
// outstanding (invoices.outstanding_amount) against the
// reducer's computed outstanding.
//
// Usage:
//   pnpm recovery:audit -t <tenantId>
//   pnpm recovery:audit -t <tenantId> --limit 100 --write
//   pnpm recovery:audit -t <tenantId> --json
//
// Output:
//   - Per-invoice drift report
//   - Severity classification (critical / warning)
//   - Optional persistence to recovery_audit_log table

import { supabaseAdmin } from '../../billzo/supabase-admin'
import { traceInvoice } from './trace'
import type { TraceResult, AuditDrift, AuditResult } from './types'

// ============================================================
// Types
// ============================================================

export interface AuditOptions {
  tenantId: string
  limit?: number
  offset?: number
  verbose?: boolean
  json?: boolean
  write?: boolean
}

export interface AuditProgress {
  scanned: number
  driftsFound: number
  criticalDrifts: number
  warningDrifts: number
  totalEvents: number
  totalInvariantsViolated: number
}

// ============================================================
// Constants
// ============================================================

const AUDIT_CLI_VERSION = '1.0.0'
const CRITICAL_DRIFT_THRESHOLD = 100

// ============================================================
// classifySeverity
// ============================================================

function classifySeverity(drift: number, invariantViolations: number): 'critical' | 'warning' {
  if (Math.abs(drift) > CRITICAL_DRIFT_THRESHOLD || invariantViolations > 0) {
    return 'critical'
  }
  return 'warning'
}

// ============================================================
// buildReason
// ============================================================

function buildReason(trace: TraceResult): string {
  const parts: string[] = []
  if (trace.driftDetected) {
    parts.push(`drift=${trace.drift} (trigger=${trace.currentState.triggerOutstanding}, reducer=${trace.currentState.reducerOutstanding})`)
  }
  if (trace.summary.invariantViolations > 0) {
    parts.push(`${trace.summary.invariantViolations} invariant violations`)
  }
  if (parts.length === 0) {
    parts.push('no drift detected')
  }
  return parts.join('; ')
}

// ============================================================
// scanInvoices — Core audit logic
// ============================================================

export async function scanInvoices(options: AuditOptions): Promise<{
  drifts: AuditDrift[]
  progress: AuditProgress
}> {
  const { tenantId, limit, offset, verbose } = options
  const drifts: AuditDrift[] = []
  const startTime = Date.now()

  // 1. Query invoices for this tenant
  let query = supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, outstanding_amount, total, paid_amount, status, customer_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (limit) query = query.limit(limit)
  if (offset) query = query.range(offset, offset + (limit || 1000) - 1)

  const { data: invoices, error } = await query

  if (error) {
    console.error('[Audit] Failed to load invoices:', error.message)
    process.exit(1)
  }

  if (!invoices || invoices.length === 0) {
    console.log('[Audit] No invoices found for tenant', tenantId)
    return {
      drifts: [],
      progress: { scanned: 0, driftsFound: 0, criticalDrifts: 0, warningDrifts: 0, totalEvents: 0, totalInvariantsViolated: 0 },
    }
  }

  console.log(`[Audit] Scanning ${invoices.length} invoices for tenant ${tenantId}...\n`)

  // 2. Trace each invoice
  let scanned = 0
  let driftsFound = 0
  let criticalDrifts = 0
  let warningDrifts = 0
  let totalEvents = 0
  let totalInvariantsViolated = 0

  for (const invoice of invoices) {
    scanned++
    const progressPrefix = `[${scanned}/${invoices.length}]`

    try {
      const trace = await traceInvoice(invoice.id, tenantId)
      totalEvents += trace.summary.totalEvents
      totalInvariantsViolated += trace.summary.invariantViolations

      if (verbose) {
        const status = trace.driftDetected ? '⚠️' : '✓'
        console.log(`${progressPrefix} ${status} ${invoice.invoice_number || invoice.id}: drift=${trace.drift}, events=${trace.summary.totalEvents}, violations=${trace.summary.invariantViolations}`)
      }

      if (trace.driftDetected) {
        driftsFound++
        const severity = classifySeverity(trace.drift, trace.summary.invariantViolations)
        if (severity === 'critical') criticalDrifts++
        else warningDrifts++

        drifts.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number || undefined,
          triggerOutstanding: trace.currentState.triggerOutstanding,
          reducerOutstanding: trace.currentState.reducerOutstanding,
          recoveryCaseOutstanding: trace.currentState.recoveryCaseOutstanding,
          drift: trace.drift,
          reason: buildReason(trace),
          severity,
        })
      }
    } catch (err) {
      console.error(`${progressPrefix} ✗ Failed to trace invoice ${invoice.id}:`, (err as Error).message)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  return {
    drifts,
    progress: {
      scanned,
      driftsFound,
      criticalDrifts,
      warningDrifts,
      totalEvents,
      totalInvariantsViolated,
    },
  }
}

// ============================================================
// writeAuditLog — Persist individual drifts to recovery_audit_log
// ============================================================

export async function writeAuditLog(
  tenantId: string,
  drifts: AuditDrift[],
  progress: AuditProgress,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const rows = drifts.map(d => ({
    tenant_id: tenantId,
    action: 'audit_scan' as const,
    invoice_id: d.invoiceId,
    invoice_number: d.invoiceNumber || null,
    drift_amount: d.drift,
    drift_detected: true,
    severity: d.severity,
    audit_snapshot: JSON.stringify(d),
    metadata: JSON.stringify({ ...metadata, scannedCount: progress.scanned, totalDrifts: progress.driftsFound }),
  }))

  // authority:governed audit.write_log — append-only provenance log
  const { error } = await supabaseAdmin.from('recovery_audit_log').insert(rows)
  if (error) {
    console.error('[Audit] Failed to write audit log:', error.message)
  } else {
    console.log(`[Audit] Wrote ${rows.length} drift records to recovery_audit_log`)
  }
}

// ============================================================
// printAuditResult
// ============================================================

function printAuditResult(drifts: AuditDrift[], progress: AuditProgress, elapsed: string): void {
  console.log('\n' + '='.repeat(60))
  console.log('RECOVERY AUDIT SUMMARY')
  console.log('='.repeat(60))
  console.log(`  Scanned:        ${progress.scanned} invoices`)
  console.log(`  Events replayed: ${progress.totalEvents}`)
  console.log(`  Drifts found:    ${progress.driftsFound}`)
  console.log(`    Critical:      ${progress.criticalDrifts}`)
  console.log(`    Warning:       ${progress.warningDrifts}`)
  console.log(`  Invariant violations: ${progress.totalInvariantsViolated}`)
  console.log(`  Elapsed:        ${elapsed}s`)
  console.log('='.repeat(60))

  if (drifts.length === 0) {
    console.log('\n✅  ZERO DRIFT — Financial truth is consistent.')
    return
  }

  console.log('\nDRIFT DETAILS:')
  for (const d of drifts) {
    const icon = d.severity === 'critical' ? '🚨' : '⚠️'
    console.log(`\n${icon} [${d.severity.toUpperCase()}] ${d.invoiceNumber || d.invoiceId}`)
    console.log(`   Trigger: ${d.triggerOutstanding}  Reducer: ${d.reducerOutstanding}  Drift: ${d.drift}`)
    if (d.recoveryCaseOutstanding !== null) {
      console.log(`   RecoveryCase aggregate: ${d.recoveryCaseOutstanding}`)
    }
    console.log(`   Reason: ${d.reason}`)
  }

  if (progress.criticalDrifts > 0) {
    console.log('\n🚨  CRITICAL DRIFTS DETECTED — Run recovery:rebuild to fix.')
  }
}

// ============================================================
// runAudit — Entry point
// ============================================================

export async function runAudit(options: AuditOptions): Promise<void> {
  const { tenantId, json, write } = options
  const startTime = Date.now()

  const { drifts, progress } = await scanInvoices(options)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if (json) {
    const result: AuditResult = {
      tenantId,
      scannedAt: new Date().toISOString(),
      totalInvoices: progress.scanned,
      driftCount: progress.driftsFound,
      drifts,
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }

  printAuditResult(drifts, progress, elapsed)

  if (write && drifts.length > 0) {
    await writeAuditLog(tenantId, drifts, progress, {
      cliVersion: AUDIT_CLI_VERSION,
      elapsed,
    })
  }
}

// ============================================================
// CLI
// ============================================================

export function parseAuditArgs(): AuditOptions {
  const args = process.argv.slice(2)
  const options: AuditOptions = { tenantId: '' }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-t' || args[i] === '--tenant') options.tenantId = args[++i] || ''
    else if (args[i] === '--limit') options.limit = parseInt(args[++i], 10) || undefined
    else if (args[i] === '--offset') options.offset = parseInt(args[++i], 10) || undefined
    else if (args[i] === '--verbose') options.verbose = true
    else if (args[i] === '--json') options.json = true
    else if (args[i] === '--write') options.write = true
  }

  if (!options.tenantId) {
    console.error('Usage: pnpm recovery:audit -t <tenantId> [--limit N] [--verbose] [--json] [--write]')
    process.exit(1)
  }

  return options
}

if (require.main === module) {
  const options = parseAuditArgs()
  runAudit(options).catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
