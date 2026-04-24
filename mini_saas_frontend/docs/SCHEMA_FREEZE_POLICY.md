# Schema Freeze Policy for BillZo v1

## Overview

After Merchant #1 creates their first invoice, the `invoices` table schema becomes append-only. This document defines what changes are permitted post-freeze.

## Freeze Trigger

The schema freeze activates when:
- Invoice #1 is created in production

After this point:

## ✅ Permitted Operations

1. **Adding new columns** (with DEFAULT values)
   ```sql
   ALTER TABLE invoices ADD COLUMN new_field TEXT DEFAULT NULL;
   ```

2. **Adding new indexes**
   ```sql
   CREATE INDEX idx_new ON invoices(new_field);
   ```

3. **Extending enums** (adding new values, never removing)
   ```sql
   ALTER TABLE invoices ADD COLUMN new_status TEXT 
     CHECK (new_status IN ('DRAFT', 'FINALIZED', 'VOIDED', 'CANCELLED', 'DELETED_LOGICAL', 'NEW_VALUE'));
   ```

4. **Adding constraints** (NOT VALID initially, then validate later)
   ```sql
   ALTER TABLE invoices ADD CONSTRAINT chk_total CHECK (total >= 0) NOT VALID;
   ```

## ❌ Forbidden Operations

1. **Renaming columns** - Would break exports
2. **Changing column types** - Would corrupt data
3. **Removing columns** - Would break audit trail
4. **Adding NOT NULL without DEFAULT** - Would fail on existing rows
5. **Adding CHECK constraints that could reject existing data**
6. **Dropping constraints** - Would break compliance

## Migration Safety Rules

Before ANY schema change:

1. **Test on staging first**
   ```bash
   # Dump production schema
   pg_dump $PROD_DB --schema-only > prod_schema.sql
   
   # Apply change to staging
   # Test invoice creation
   # Test exports
   # Test reconciliation
   ```

2. **Add migration with rollback**
   ```sql
   -- Forwards
   ALTER TABLE invoices ADD COLUMN field TEXT;
   
   -- Rollback (documented, not auto-executed)
   ALTER TABLE invoices DROP COLUMN field;
   ```

3. **Wait 24 hours after Merchant #1 notification**
   - Give time to report issues with new invoices

4. **Back up before**
   ```bash
   pg_dump $PROD_DB --data-only > backup_$(date +%Y%m%d).sql
   ```

## Pre-Freeze Checklist

Before activating freeze:

- [x] All required columns exist (invoice_number, status, erp_sync_status, etc.)
- [x] Foreign keys defined
- [x] Indexes for common queries
- [x] CHECK constraints for critical fields
- [x] UNIQUE constraints for tenant + invoice_number
- [x] Audit trail table defined

## Schema Version at Freeze

```
v001_initial: invoices table with ERPNext sync columns
Freeze Point: After first production invoice
```

## Emergency Rollback Procedure

If critical bug requires column removal:

1. DO NOT run DROP COLUMN
2. Instead: Add migration that marks data invalid
   ```sql
   UPDATE invoices SET suspicious_column = NULL 
   WHERE suspicious_column IS NOT NULL;
   ALTER TABLE invoices ALTER COLUMN suspicious_column DROP NOT NULL;
   ```
3. Document as technical debt
4. Fix in next release with proper migration path

Why this discipline matters:

After Merchant #1:
- Ledger = contract
- Exports = tax filings
- Audit = legal proof

Changing schema without caution breaks that trust contract.