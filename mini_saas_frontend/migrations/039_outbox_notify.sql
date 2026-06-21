-- ============================================================
-- Phase 6: Outbox Push — Postgres LISTEN/NOTIFY for push-based
-- event processing, replacing the 10s polling loop.
-- ============================================================
-- Fires on INSERT into the outbox table, notifying workers
-- so they can process events immediately instead of polling.
-- Polling is retained as a degraded fallback at 60s interval.
-- ============================================================

CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('outbox_event', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_outbox_event
AFTER INSERT ON outbox
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_event();
