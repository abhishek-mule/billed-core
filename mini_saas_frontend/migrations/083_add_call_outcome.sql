-- 083_add_call_outcome.sql
-- Split merchant_called from call_outcome.
-- merchant_called = dialer opened, call_outcome = result recorded by merchant.

ALTER TABLE recovery_activities DROP CONSTRAINT IF EXISTS recovery_activities_type_check;

ALTER TABLE recovery_activities ADD CONSTRAINT recovery_activities_type_check
  CHECK (type IN (
    'invoice_created', 'invoice_sent', 'customer_viewed',
    'payment_link_opened', 'reminder_sent', 'merchant_called',
    'call_outcome',
    'promise_received', 'promise_fulfilled', 'promise_broken',
    'payment_received', 'customer_payment_reported', 'payment_confirmed', 'note_added'
  ));
