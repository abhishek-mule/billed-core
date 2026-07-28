-- 079_fix_priority_cases_business_rules.sql
-- Refactor get_priority_cases to use business rules instead of status strings.
--
-- Changes:
--   1. Backfill legacy statuses ('unpaid', 'overdue' → 'issued')
--   2. Active invoices determined by outstanding_amount > 0 (not status name)
--   3. Overdue derived from due_date < NOW() (not status = 'overdue')
--   4. total_overdue computed from invoices directly (not rc.total_overdue)
--   5. New priority_score column combining days overdue + amount weight +
--      broken promise penalty + ignored reminders.
--   6. Sort by priority_score DESC instead of attention_score DESC.

-- 1. Backfill legacy statuses to match sync serialization
UPDATE invoices
SET status = 'issued'
WHERE status IN ('unpaid', 'overdue');

-- 2. Drop old RPC (return type changed — OR REPLACE won't work)
DROP FUNCTION IF EXISTS get_priority_cases(TEXT, INTEGER);

-- 3. Create new RPC
CREATE OR REPLACE FUNCTION get_priority_cases(
  p_tenant_id TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  case_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  phone TEXT,
  total_overdue NUMERIC,
  oldest_overdue_days INT,
  attention_score INT,
  priority_score INT,
  next_action_type TEXT,
  promise_to_pay_date TIMESTAMPTZ,
  ignored_reminders INT,
  broken_promises INT,
  open_invoice_count INT,
  automation_mode TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH invoice_stats AS (
    SELECT
      inv.customer_id,
      COUNT(*)::int                                               AS open_count,
      SUM(inv.outstanding_amount)::numeric                        AS total_outstanding,
      MAX(EXTRACT(DAY FROM (v_now - inv.due_date)::interval))::int AS max_overdue_days
    FROM invoices inv
    WHERE inv.tenant_id = p_tenant_id
      AND inv.outstanding_amount > 0
      AND inv.due_date IS NOT NULL
    GROUP BY inv.customer_id
  ),
  ignored_reminder_stats AS (
    SELECT
      inv2.customer_id,
      COUNT(*)::int AS reminder_count
    FROM whatsapp_events we
    JOIN invoices inv2 ON inv2.id = we.invoice_id
    WHERE we.tenant_id = p_tenant_id
      AND we.direction = 'outbound'
      AND we.status IN ('sent', 'delivered', 'read')
    GROUP BY inv2.customer_id
  ),
  broken_promise_stats AS (
    SELECT
      rce.case_id,
      COUNT(*)::int AS broken_count
    FROM recovery_case_events rce
    WHERE rce.event_type = 'transition'
      AND rce.payload->>'to_recovery_state' = 'overdue'
      AND rce.payload->>'from_recovery_state' = 'promised'
    GROUP BY rce.case_id
  )
  SELECT
    rc.id::text                                                                    AS case_id,
    rc.customer_id::text,
    c.customer_name::text,
    c.phone::text,
    COALESCE(isum.total_outstanding, 0)::numeric                                   AS total_overdue,
    COALESCE(isum.max_overdue_days, 0)::int                                        AS oldest_overdue_days,
    rc.attention_score::int,
    (
      COALESCE(isum.max_overdue_days, 0)
      + LEAST(COALESCE(isum.total_outstanding / 100, 0), 50)::int
      + COALESCE(bps.broken_count, 0) * 10
      + COALESCE(irs.reminder_count, 0) * 5
    )::int                                                                         AS priority_score,
    rc.next_action_type::text,
    rc.promise_to_pay_date::timestamptz,
    COALESCE(irs.reminder_count, 0)::int                                           AS ignored_reminders,
    COALESCE(bps.broken_count, 0)::int                                             AS broken_promises,
    COALESCE(isum.open_count, 0)::int                                              AS open_invoice_count,
    c.automation_mode::text
  FROM recovery_cases rc
  JOIN customers c ON c.id = rc.customer_id
  LEFT JOIN invoice_stats        isum ON isum.customer_id = rc.customer_id
  LEFT JOIN broken_promise_stats bps  ON bps.case_id     = rc.id
  LEFT JOIN ignored_reminder_stats irs ON irs.customer_id = rc.customer_id
  WHERE rc.tenant_id = p_tenant_id
    AND rc.recovery_state_v2 NOT IN ('recovered', 'closed')
    AND rc.next_action_type IN ('send_reminder', 'call', 'follow_up_call', 'review_payment', 'merchant_review')
  ORDER BY priority_score DESC, rc.attention_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_priority_cases IS 'Returns top priority recovery cases for a tenant, ordered by priority_score DESC. Active invoices determined by outstanding_amount > 0; overdue derived from due_date < NOW().';
