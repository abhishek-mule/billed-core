-- ============================================================
-- verify_103_customer_phone_uniqueness.sql
-- Verification for migration 103 on STAGING ONLY.
--
-- PART A — run BEFORE applying 103. Reports every (tenant, phone) group
--   the app treats as identical, so conflicts can be resolved manually
--   (keep oldest, repoint dependents) before the unique index aborts loudly.
-- PART B — run AFTER applying 103. Proves the index exists and holds.
-- ============================================================

-- ── PART A: pre-apply conflict audit (app-canonical normalization) ──
-- Mirrors normalizePhoneE164 ('+91' + last-10-digits) — deliberately wider
-- than the migration's Indian-mobile-only rewrite, so nothing slips through.
WITH canon AS (
  SELECT
    id, tenant_id, customer_name, phone,
    CASE
      WHEN phone IS NULL OR phone = '' THEN NULL
      ELSE '+91' || right(regexp_replace(phone, '\D', '', 'g'), 10)
    END AS app_phone
  FROM customers
)
SELECT tenant_id, app_phone, count(*) AS n, array_agg(id ORDER BY id) AS ids
FROM canon
WHERE app_phone IS NOT NULL
GROUP BY tenant_id, app_phone
HAVING count(*) > 1
ORDER BY n DESC;

-- ── PART B: post-apply proofs ──
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'customers'
  AND indexname = 'uq_customers_tenant_phone';

-- Must return zero rows: no surviving violations.
SELECT tenant_id, phone, count(*)
FROM customers
WHERE phone IS NOT NULL AND phone <> ''
GROUP BY tenant_id, phone
HAVING count(*) > 1;

-- Phoneless customers must be untouched (NULL/'' stay non-unique by design).
SELECT count(*) AS phoneless_rows
FROM customers
WHERE phone IS NULL OR phone = '';
