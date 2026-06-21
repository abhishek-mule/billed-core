-- 045_get_priority_cases_rpc.sql
-- RPC function for fetching priority recovery cases

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
BEGIN
  RETURN QUERY
  SELECT
    rc.id::text as case_id,
    rc.customer_id::text,
    c.customer_name::text,
    c.phone::text,
    rc.total_overdue::numeric,
    COALESCE((
      SELECT MAX(EXTRACT(DAY FROM (NOW() - inv.due_date)::interval))::int
      FROM invoices inv
      WHERE inv.tenant_id = p_tenant_id
        AND inv.customer_id = rc.customer_id
        AND inv.status IN ('unpaid', 'overdue', 'partial')
    ), 0)::int as oldest_overdue_days,
    rc.attention_score::int,
    rc.next_action_type::text,
    rc.promise_to_pay_date::timestamptz,
    COALESCE((
      SELECT COUNT(*)::int
      FROM whatsapp_events we
      WHERE we.tenant_id = p_tenant_id
        AND we.direction = 'outbound'
        AND we.status IN ('sent', 'delivered', 'read')
        AND we.occurred_at > COALESCE(rc.last_activity_at, rc.created_at)
        AND EXISTS (
          SELECT 1 FROM invoices inv2
          WHERE inv2.id = we.invoice_id
          AND inv2.customer_id = rc.customer_id
        )
    ), 0)::int as ignored_reminders,
    COALESCE((
      SELECT COUNT(*)::int
      FROM recovery_case_events rce
      WHERE rce.case_id = rc.id
        AND rce.event_type = 'transition'
        AND rce.payload->>'to_recovery_state' = 'overdue'
        AND rce.payload->>'from_recovery_state' = 'promised'
    ), 0)::int as broken_promises,
    rc.open_invoice_count::int,
    c.automation_mode::text
  FROM recovery_cases rc
  JOIN customers c ON c.id = rc.customer_id
  WHERE rc.tenant_id = p_tenant_id
    AND rc.recovery_state_v2 NOT IN ('recovered', 'closed')
    AND rc.next_action_type IN ('send_reminder', 'call', 'follow_up_call')
  ORDER BY rc.attention_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_priority_cases IS 'Returns top priority recovery cases for a tenant, ordered by attention_score DESC';