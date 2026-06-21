# Phase A: Financial Truth Engine — Implementation Spec

## Overview
Fix the financial substrate before any intelligence layer is added.

## Core Problem
Three parallel systems compute "outstanding":
1. `invoices.outstanding_amount` (database trigger on payments table)
2. `reducer` (per-invoice event replay from case-machine)
3. `recovery_cases.total_outstanding` (customer-level aggregate)

**Drift = Inconsistency between these sources**

## Architecture Rules
- Never mix facts (what happened) and beliefs (what we think)
- Financial truth is immutable after commitment
- No intelligence layer without financial substrate certainty

## Phase A Tools

### 1. pnpm recovery:trace <invoiceId> --tenant <tenantId>

**Purpose**: Single invoice financial debugger, invariant checker

**Output**: 
- Event chain (invoices, payments, adjustments)
- Before/after snapshots for each financial event  
- Invariant validation results
- Current state comparison (trigger vs reducer)

**Use Cases**:
- Merchant support: "Why does BillZo say I owe ₹5,000?"
- Developer debugging: Invariant violations
- Auditor: Financial truth verification

**Data Sources**:
- `recovery_case_events` (state machine decisions)
- `outbox` (raw events, filtered to financial types)

### 2. pnpm recovery:audit --tenant <tenantId>

**Purpose**: Tenant-wide drift report, severity analysis

**Output**:
- Drift count summary
- Drift details (invoice, amount, reason)
- Severity classification (critical vs warning)
- Summary statistics

**Fields Analyzed**:
- invoice.outstanding_amount (trigger)
- reducer.outstanding (replayed)
- recovery_cases.total_outstanding (aggregate)

### 3. pnpm recovery:rebuild --apply

**Purpose**: Zero-drift fix applied in single transaction

**Pre-requisites**:
- Run recovery:trace to identify all drifts
- Review and approve each fix
- Execute with --apply flag

**Output**:
- Applied changes log
- Recovery audit entries
- Verification of zero drift

## Data Model Changes

### 1. Shadow Recovery Cases (028_shadow_recovery_cases.sql)

```sql
CREATE TABLE shadow_recovery_cases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  
  -- Financial truth (what affects business decisions)
  total_outstanding NUMERIC DEFAULT 0 NOT NULL,
  total_overdue NUMERIC DEFAULT 0 NOT NULL,
  open_invoice_count INT DEFAULT 0 NOT NULL,
  overdue_invoice_count INT DEFAULT 0 NOT NULL,
  
  -- Collection position (what actually needs to be done)
  recovery_state TEXT NOT NULL DEFAULT 'created',
  next_action_due_at TIMESTAMPTZ,
  
  -- Projection metadata
  projection_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
);
```

**Fields NOT in shadow**: engagement_state, attention_score, next_action_type, promise_to_pay_date, disputed_invoice_count, promised_invoice_count

### 2. Projection Version (027_recovery_case_state.sql)

```sql
ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 1;
```

**Usage**: Different projections (v1, v2, v3...) for different time periods

### 3. Recovery Audit Log

```sql
CREATE TABLE recovery_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'invoice' | 'recovery_case'
  entity_id TEXT NOT NULL,
  field VARCHAR(50) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by VARCHAR(100) DEFAULT 'recovery:rebuild'
);
```

## Implementation Order

### Week 1: Visibility & Discovery

**Days 1-2: recovery:trace**
- Build trace.ts CLI
- Load events from event ledger (recovery_case_events + filtered outbox)
- Replay through reducer
- Compare with trigger state
- Show invariant violations

**Days 3-4: recovery:audit**
- Build audit.ts CLI
- Scan all invoices for tenant
- Identify all drifts
- Classify severity
- Output drift report

### Week 2: Parallel Truth

**Days 5-6: Shadow projection**
- Create shadow_recovery_cases migration
- Implement shadow-projection runner
- Wire into event processing pipeline
- Run for 48h to collect baseline

**Days 7-8: Drift analysis**
- Run recovery:audit to compare shadow vs real
- Identify all drifts
- Plan fixes

### Week 3: Repair & Cutover

**Days 9-11: recovery:rebuild --apply**
- For each drift, apply fix
- Write to recovery_audit_log
- Single transaction per entity

**Days 12-15: Tenant rollout**
- Start with 1-2 test tenants
- Monitor for regressions
- Gradual expansion to all tenants

## Success Criteria

1. **Zero Drift**: `recovery:audit` shows 0 drifts for all scanned tenants
2. **All Invariants Pass**: Every financial event maintains invariants
3. **Recovery Audit Complete**: All changes logged with reason
4. **Tenant Rollout**: Each tenant cutover verified before next

## Code Structure

```
worker/src/lib/recovery/audit/
├── types.ts                    # Type definitions
├── event-loader.ts             # Load events from ledger
├── trace.ts                   # Single invoice trace CLI
├── trace.test.ts              # Unit tests
├── shadow-projection.ts       # Shadow case updater
└── index.ts                   # CLI exports
```

## Questions Before Implementation

1. **CLI Framework**: Use `tsx` or `commander.js`?
2. **Event Ledger Strategy**: recovery_case_events + filtered outbox, or create separate event_ledger?
3. **Drift Analysis Algorithm**: Batch vs incremental scanning?
4. **Audit Logging**: Should we log successful reads too, or only changes?
5. **Concurrency**: How to handle concurrent rebuilds?

## Dependencies

- `reducer.ts` (existing)
- `case-machine.ts` (existing)
- `supabaseAdmin` (existing)
- `commander` (new dependency)
- `vitest` (for testing)

## Critical Success Factor

**The first production feature is not a new reducer. It is observability of financial truth.**

Only with `pnpm recovery:trace` can support, developers, and auditors understand when and why the financial substrate is wrong.

This architecture turns the entire recovery system from "clever code" into a trustworthy financial engine.