// ============================================================
// Rebuild CLI — Zero-Drift Financial Fixer
// ============================================================
//
// Reads the reducer-replayed financial truth and writes it back
// to the invoices table, bringing trigger-maintained outstanding
// in line with computed reality.
//
// Safety:
//   - Dry-run by default (no writes)
//   - --apply flag required to actually fix drifts
//   - Every fix is logged to recovery_audit_log for provenance
//
// Usage:
//   pnpm recovery:rebuild -t <tenantId>                  # dry-run (show plan)
//   pnpm recovery:rebuild -t <tenantId> --apply          # execute fixes
//   pnpm recovery:rebuild -t <tenantId> -i <invoiceId>   # single invoice
//   pnpm recovery:rebuild -t <tenantId> --apply -i <id>  # single fix
//
// Correctness:
//   - Reducer's computed outstanding is the SOURCE OF TRUTH
//   - Only invoices.outstanding_amount is corrected
//   - recovery_cases.total_outstanding is NOT auto-fixed
//     (it is an aggregate; requires full customer-level rebuild)

import { supabaseAdmin } from '../../billzo/supabase-admin'
import { traceInvoice } from './trace'
import { writeAuditLog } from './audit-cli'
import type { AuditDrift, RebuildPlan, RebuildResult } from './types'

// ============================================================
// Types
// ============================================================

export interface RebuildOptions {
  tenantId: string
  apply: boolean
  invoiceId?: string
  verbose?: boolean
}

export interface FixAction {
  invoiceId: string
  invoiceNumber?: string
  field: string
  oldValue: number
  newValue: number
  reason: string
  severity: 'critical' | 'warning'
}

// ============================================================
// Constants
// ============================================================

const REBUILD_CLI_VERSION = '1.0.0'

// ============================================================
// generateRebuildPlan
// ============================================================

export async function generateRebuildPlan(options: RebuildOptions): Promise<{
  plan: FixAction[]
  totalInvoices: number
}> {
  const { tenantId, invoiceId, verbose } = options
  const fixActions: FixAction[] = []

  // Build the invoice query
  let query = supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, outstanding_amount, total, paid_amount, status, customer_id')
    .eq('tenant_id', tenantId)

  if (invoiceId) {
    query = query.eq('id', invoiceId)
  }

  const { data: invoices, error } = await query

  if (error) {
    console.error('[Rebuild] Failed to load invoices:', error.message)
    process.exit(1)
  }

  if (!invoices || invoices.length === 0) {
    console.log('[Rebuild] No invoices found')
    return { plan: [], totalInvoices: 0 }
  }

  console.log(`[Rebuild] Analysing ${invoices.length} invoices for tenant ${tenantId}...\n`)

  // Trace each invoice to find drifts
  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i]
    const prefix = `[${i + 1}/${invoices.length}]`

    try {
      const trace = await traceInvoice(invoice.id, tenantId)
      const reducerOutstanding = trace.currentState.reducerOutstanding
      const triggerOutstanding = trace.currentState.triggerOutstanding

      if (reducerOutstanding !== triggerOutstanding) {
        fixActions.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number || undefined,
          field: 'outstanding_amount',
          oldValue: triggerOutstanding,
          newValue: reducerOutstanding,
          reason: `Drift: trigger=${triggerOutstanding}, reducer=${reducerOutstanding}, diff=${trace.drift}`,
          severity: trace.summary.invariantViolations > 0 || Math.abs(trace.drift) > 100
            ? 'critical'
            : 'warning',
        })

        if (verbose) {
          console.log(`${prefix} ⚠️ ${invoice.invoice_number || invoice.id}: ${triggerOutstanding} → ${reducerOutstanding}`)
        }
      } else if (verbose) {
        console.log(`${prefix} ✓ ${invoice.invoice_number || invoice.id}: no drift`)
      }
    } catch (err) {
      console.error(`${prefix} ✗ Failed to trace invoice ${invoice.id}:`, (err as Error).message)
    }
  }

  return { plan: fixActions, totalInvoices: invoices.length }
}

// ============================================================
// executeRebuild — Apply fixes (only with --apply)
// ============================================================

export async function executeRebuild(
  tenantId: string,
  plan: FixAction[],
): Promise<RebuildResult> {
  if (plan.length === 0) {
    return { tenantId, appliedAt: new Date().toISOString(), invoicesFixed: 0, recoveryCasesFixed: 0, auditLogEntries: 0 }
  }

  let invoicesFixed = 0
  let auditLogEntries = 0
  const errors: string[] = []

  for (const action of plan) {
    // Update invoices.outstanding_amount
    // authority:governed rebuild.fix_invoice — correct drift in outstanding_amount
    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({ outstanding_amount: action.newValue })
      .eq('id', action.invoiceId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      errors.push(`Failed to update invoice ${action.invoiceId}: ${updateError.message}`)
      continue
    }

    invoicesFixed++
    auditLogEntries++

    // Write to audit log
    const { error: logError } = await supabaseAdmin
      .from('recovery_audit_log')
      .insert({
        tenant_id: tenantId,
        action: 'rebuild',
        invoice_id: action.invoiceId,
        invoice_number: action.invoiceNumber || null,
        drift_amount: action.newValue - action.oldValue,
        drift_detected: true,
        severity: action.severity,
        audit_snapshot: JSON.stringify(action),
        rebuild_field: action.field,
        rebuild_old_value: action.oldValue,
        rebuild_new_value: action.newValue,
        rebuild_reason: action.reason,
        metadata: JSON.stringify({ cliVersion: REBUILD_CLI_VERSION }),
      })

    if (logError) {
      errors.push(`Failed to log rebuild for ${action.invoiceId}: ${logError.message}`)
    }
  }

  if (errors.length > 0) {
    console.error('\n[Rebuild] Errors during execution:')
    for (const e of errors) {
      console.error(`  ✗ ${e}`)
    }
  }

  return {
    tenantId,
    appliedAt: new Date().toISOString(),
    invoicesFixed,
    recoveryCasesFixed: 0,
    auditLogEntries,
  }
}

// ============================================================
// printRebuildPlan
// ============================================================

function printRebuildPlan(plan: FixAction[]): void {
  console.log('\n' + '='.repeat(60))
  console.log('REBUILD PLAN')
  console.log('='.repeat(60))

  if (plan.length === 0) {
    console.log('\n✅  No fixes needed — all invoices are consistent.')
    return
  }

  for (const action of plan) {
    const icon = action.severity === 'critical' ? '🚨' : '⚠️'
    console.log(`\n${icon} [${action.severity.toUpperCase()}] ${action.invoiceNumber || action.invoiceId}`)
    console.log(`   Field: ${action.field}`)
    console.log(`   ${action.oldValue} → ${action.newValue}`)
    console.log(`   Reason: ${action.reason}`)
  }

  console.log(`\nTotal fixes: ${plan.length}`)
  console.log('Run with --apply to execute these changes.')
}

// ============================================================
// runRebuild — Entry point
// ============================================================

export async function runRebuild(options: RebuildOptions): Promise<void> {
  const { tenantId, apply, verbose } = options

  console.log(`[Rebuild] Tenant: ${tenantId}`)
  console.log(`[Rebuild] Mode: ${apply ? 'APPLY (writes enabled)' : 'dry-run (no writes)'}`)
  if (apply) {
    console.log('[Rebuild] ⚠️  WARNING: This will modify invoice data!')
  }

  const { plan, totalInvoices } = await generateRebuildPlan(options)
  printRebuildPlan(plan)

  if (apply && plan.length > 0) {
    console.log('\n' + '-'.repeat(60))
    console.log('EXECUTING REBUILD...')
    console.log('-'.repeat(60))

    const result = await executeRebuild(tenantId, plan)

    console.log('\n' + '='.repeat(60))
    console.log('REBUILD RESULT')
    console.log('='.repeat(60))
    console.log(`  Invoices fixed:   ${result.invoicesFixed}`)
    console.log(`  Audit log entries: ${result.auditLogEntries}`)
    console.log('='.repeat(60))
  }
}

// ============================================================
// CLI
// ============================================================

export function parseRebuildArgs(): RebuildOptions {
  const args = process.argv.slice(2)
  const options: RebuildOptions = { tenantId: '', apply: false }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-t' || args[i] === '--tenant') options.tenantId = args[++i] || ''
    else if (args[i] === '-i' || args[i] === '--invoice') options.invoiceId = args[++i] || ''
    else if (args[i] === '--apply') options.apply = true
    else if (args[i] === '--verbose') options.verbose = true
  }

  if (!options.tenantId) {
    console.error('Usage: pnpm recovery:rebuild -t <tenantId> [--apply] [--invoice <id>] [--verbose]')
    process.exit(1)
  }

  return options
}

if (require.main === module) {
  const options = parseRebuildArgs()
  runRebuild(options).catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
