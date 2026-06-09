-- 037_event_spine_phase3.sql
-- Phase 3 — Identity Quarantine
--
-- Prerequisite: migrations 035, 036
--
-- Creates:
--   1. spine_quarantine table for events rejected due to missing external_refs
--   2. Indexes for quarantine query patterns
--
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS spine_quarantine (
  id            BIGSERIAL PRIMARY KEY,
  event_id      TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  source_system TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload       JSONB DEFAULT '{}'::jsonb,
  reason        TEXT NOT NULL,
  refused_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id     VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_spine_quarantine_entity
  ON spine_quarantine (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_spine_quarantine_tenant
  ON spine_quarantine (tenant_id);
