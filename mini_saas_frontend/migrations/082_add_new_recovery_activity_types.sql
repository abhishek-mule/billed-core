-- 082_add_new_recovery_activity_types.sql
-- Split payment_received into customer_payment_reported (customer portal)
-- and payment_confirmed (merchant verification).

ALTER TABLE recovery_activities DROP CONSTRAINT IF EXISTS recovery_activities_type_check;

ALTER TABLE recovery_activities ADD CONSTRAINT recovery_activities_type_check
  CHECK (type IN (
    'invoice_created', 'invoice_sent', 'customer_viewed',
    'payment_link_opened', 'reminder_sent', 'merchant_called',
    'promise_received', 'promise_fulfilled', 'promise_broken',
    'payment_received', 'customer_payment_reported', 'payment_confirmed', 'note_added'
  ));
