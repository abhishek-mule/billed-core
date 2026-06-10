-- Migration 042: Add next_review_at to recovery_decisions
-- Allows the timeline to show "Next review: 29 June 09:00" on blocked decisions

ALTER TABLE recovery_decisions
ADD COLUMN next_review_at TIMESTAMPTZ;

-- Backfill: for existing rows with cooldown blocks, estimate from created_at
UPDATE recovery_decisions
SET next_review_at = created_at + INTERVAL '24 hours'
WHERE next_review_at IS NULL
  AND (rules_snapshot->>'cooldown_expired') = 'false';
