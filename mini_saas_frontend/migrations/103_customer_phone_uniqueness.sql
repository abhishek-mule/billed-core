-- 103_customer_phone_uniqueness.sql
-- P0-concurrency: database-enforced uniqueness of customer phone per tenant.
--
-- Context: single-create + bulk-import normalize phones app-side
-- (normalizePhoneE164 = '+91' + last-10-digits) and pre-check for duplicates,
-- but two concurrent requests can both pass the check and double-insert —
-- no DB constraint existed. This migration:
--   1. Normalizes unambiguous Indian-mobile formats to canonical '+91XXXXXXXXXX'
--      (10 digits starting 6-9; 12 digits starting 91; 11 digits starting 0
--      with a valid subscriber part). Anything else (international numbers,
--      garbage) is left byte-identical — never reinterpreted.
--   2. Creates a PARTIAL unique index on (tenant_id, phone) that excludes
--      NULL and '' — single-create allows phoneless customers, so those must
--      stay non-unique. Cross-tenant same-phone rows remain allowed.
--
-- FAIL-LOUD, NOT SILENT: if true duplicates remain after normalization, the
-- CREATE UNIQUE INDEX aborts with the conflicting key. Resolve them with the
-- audit query in verify_103_customer_phone_uniqueness.sql (PART A) BEFORE
-- applying: keep the oldest row, repoint dependents, then re-apply. NEVER
-- blind-delete customers — deliveries/invoices reference customers(id) with
-- ON DELETE CASCADE in some migrations, so a delete would destroy invoices.
--
-- Pre-apply: run verify_103 PART A on staging/prod and resolve conflicts.
-- Post-apply: run verify_103 PART B.

-- ── Step 1a: 10-digit Indian mobiles → '+91XXXXXXXXXX' ──
WITH norm AS (
  SELECT id, phone, regexp_replace(phone, '\D', '', 'g') AS digits
  FROM customers
  WHERE phone IS NOT NULL AND phone <> ''
)
UPDATE customers c
SET phone = '+91' || n.digits, updated_at = NOW()
FROM norm n
WHERE c.id = n.id
  AND length(n.digits) = 10
  AND n.digits ~ '^[6-9][0-9]{9}$'
  AND c.phone <> '+91' || n.digits;

-- ── Step 1b: 12 digits starting 91 → '+91XXXXXXXXXX' ──
WITH norm AS (
  SELECT id, phone, regexp_replace(phone, '\D', '', 'g') AS digits
  FROM customers
  WHERE phone IS NOT NULL AND phone <> ''
)
UPDATE customers c
SET phone = '+' || n.digits, updated_at = NOW()
FROM norm n
WHERE c.id = n.id
  AND length(n.digits) = 12
  AND n.digits LIKE '91%'
  AND substring(n.digits FROM 3) ~ '^[6-9][0-9]{9}$'
  AND c.phone <> '+' || n.digits;

-- ── Step 1c: 11 digits starting 0 → '+91XXXXXXXXXX' ──
WITH norm AS (
  SELECT id, phone, regexp_replace(phone, '\D', '', 'g') AS digits
  FROM customers
  WHERE phone IS NOT NULL AND phone <> ''
)
UPDATE customers c
SET phone = '+91' || right(n.digits, 10), updated_at = NOW()
FROM norm n
WHERE c.id = n.id
  AND length(n.digits) = 11
  AND n.digits LIKE '0%'
  AND right(n.digits, 10) ~ '^[6-9][0-9]{9}$'
  AND c.phone <> '+91' || right(n.digits, 10);

-- ── Step 2: audit notice (visible in migration logs), then enforce ──
DO $$
DECLARE
  conflict_groups INT;
BEGIN
  SELECT COUNT(*) INTO conflict_groups FROM (
    SELECT tenant_id, phone
    FROM customers
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY tenant_id, phone
    HAVING COUNT(*) > 1
  ) d;
  IF conflict_groups > 0 THEN
    RAISE NOTICE '103: % conflicting (tenant_id, phone) groups remain — index creation will abort; resolve via verify_103 PART A, then re-apply', conflict_groups;
  ELSE
    RAISE NOTICE '103: no phone conflicts — creating partial unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_phone
  ON customers (tenant_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';

COMMENT ON INDEX uq_customers_tenant_phone IS
  'P0-concurrency: one phone per tenant. Partial (excludes NULL/empty for phoneless customers). Concurrent bulk imports converge via 23505-as-skip in the API.';
