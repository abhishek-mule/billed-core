-- 095_notifications.sql
-- Action-oriented notification layer (server-authoritative, projected from
-- BillZo's existing authoritative systems). See P1 notification contract in
-- packages/shared/src/notifications/*.
--
-- Principles encoded here:
--   * notifications are a PROJECTION — the record is created exactly once by
--     the authoritative handler (worker state-machine / payment funnel /
--     inventory transition endpoint), never by a generic "something happened"
--     emitter.
--   * dedupe_key + UNIQUE(tenant_id, dedupe_key) is the exactly-once guard
--     (worker retry / webhook retry cannot duplicate an alert). Deterministic
--     key shape: `<type>:<entityId>` for entity alerts, optionally
--     `<type>:<entityId>:<state>` for state transitions, and
--     `<type>:evt:<sourceEventId>` for event-sourced alerts.
--   * notification_preferences is the tenant-level gate applied BEFORE a
--     record is created (defaults ON except back_in_stock, which is opt-in to
--     avoid merchant noise).
--   * product_alert_cycle is the single low-stock transition truth: the
--     NORMAL → LOW_STOCK → OUT_OF_STOCK → NORMAL state per product. Alerts are
--     created on transition (state change) only, and `cycle` is bumped on every
--     transition so re-entering an alert state produces a fresh, unique
--     dedupe_key (instead of being swallowed by the same-state first alert).
--
-- The notification record is the SOURCE OF TRUTH for the in-app notification
-- center; FCM push is merely a DELIVERY MECHANISM that may fail. Push delivery
-- never mutates this table.

-- 1. Notifications (in-app source of truth)
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  recipient_user_id TEXT,
  type              TEXT NOT NULL,
  level             TEXT NOT NULL CHECK (level IN ('critical', 'attention', 'info')),
  title             TEXT NOT NULL,
  body              TEXT,
  target_type       TEXT NOT NULL CHECK (target_type IN ('customer', 'case', 'invoice', 'payment', 'product', 'notification')),
  target_id         TEXT,
  action            TEXT NOT NULL DEFAULT '',
  dedupe_key        TEXT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly-once: one (tenant, dedupe_key) → at most one notification record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_tenant_dedupe
  ON notifications (tenant_id, dedupe_key);

-- Notification center feed: per-tenant, newest first, unread first.
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
  ON notifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread
  ON notifications (tenant_id, is_read) WHERE is_read = FALSE;

-- 2. Notification preferences (tenant-level gates + push toggle, MVP defaults)
CREATE TABLE IF NOT EXISTS notification_preferences (
  tenant_id     TEXT PRIMARY KEY,
  push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  recovery      BOOLEAN NOT NULL DEFAULT TRUE,
  payments      BOOLEAN NOT NULL DEFAULT TRUE,
  inventory     BOOLEAN NOT NULL DEFAULT TRUE,
  back_in_stock BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Inventory alert transition truth (per product)
CREATE TABLE IF NOT EXISTS product_alert_cycle (
  tenant_id    TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  alert_state  TEXT NOT NULL DEFAULT 'NORMAL'
               CHECK (alert_state IN ('NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK')),
  cycle        INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, product_id)
);