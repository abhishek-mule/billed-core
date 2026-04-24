# BillZo Invoice Number Reservation Policy

## Overview

This document defines how invoice number reservations work and the timeout recovery mechanism.

## Flow

```
1. Client calls POST /api/merchant/invoice
   - Include Idempotency-Key header
   
2. Server reserves invoice number (Redis)
   - Creates reservation record with 30s TTL
   
3. Server creates invoice in database
   
4. Server syncs to ERPNext (if finalized)

5. Server confirms reservation
   - Marks as confirmed
   - Moves to confirmed store (30d TTL)

## Reservation Timeout

If confirm not received within **30 seconds**:

- Reservation auto-expires via background cleanup (runs every 5 minutes)
- Invoice number becomes available again
- Invoice remains in database but needs manual intervention

**Policy Decision**: GAPS_ALLOWED

This means gaps in invoice numbering are acceptable. Jurisdictions that require continuous numbering should use:

- Reconciliation report to identify gaps
- Manual re-generation for failed invoices

## Background Cleanup

Runs every 5 minutes:

```typescript
// cleanupExpiredReservations()

1. Find all reservations for tenant
2. Check if confirmedAt is set
3. If not, and age > 30s → delete
4. Increment cleanup counter
```

## Financial Year Scoping

Invoice sequences are scoped by financial year:

```
Keys: invoice_seq:{tenantId}:{FY}
Example: invoice_seq:tenant_abc:2026-2027
```

Auto-switches on April 1st each year.

## Recovery Procedures

### Scenario 1: Write failed, confirm never happened

1. Check pending reservations: GET /api/invoice/pending
2. Identify stuck invoices
3. Re-process manually or void

### Scenario 2: App crash mid-write

1. Reservation exists, no DB record
2. Wait 30s for cleanup OR manually release
3. Retry request

### Scenario 3: Cross-region reorder

Solution: Use financial year scoping + Redis (single source of truth)

## Querying

### Find pending reservations
```sql
-- Requires Redis: KEYS invoice_reserve:tenant_*
```

### Find invoice timeline
```sql
SELECT * FROM audit_logs 
WHERE entity_id = 'invoice_xxx' 
ORDER BY created_at ASC
```

### Find gaps in numbering
```sql
-- Generate report comparing MIN/MAX vs actual COUNT
SELECT 
  invoice_number,
 LAG(invoice_number) OVER (ORDER BY created_at) as prev,
FROM invoices 
WHERE tenant_id = 'xxx' AND created_at > '2026-04-01'
```

## Configuration

| Parameter | Value | Description |
|-----------|-------|------------|
| RESERVATION_TIMEOUT_MS | 30000 | Time before auto-release |
| CLEANUP_INTERVAL_MS | 300000 | Background cleanup frequency |
| MAX_RETRIES | 3 | ERP sync retry limit |