-- Recovery Sessions
--
-- Tracks each "merchant works a case" session from open to close.
-- A session starts when the merchant opens a recovery case and ends when
-- they close it or 30min of inactivity passes.
--
-- Each session records:
--   - What BillZo recommended at session start
--   - Every action the merchant took
--   - Whether they followed BillZo's recommendation
--   - The outcome (recovered, promised, no answer, etc.)
--   - Amount recovered during the session
--   - Session duration
--
-- This becomes the foundation for:
--   - Recommendation quality tracking (% accepted / rejected)
--   - Merchant productivity analytics (sessions/day, avg duration, success rate)
--   - AI training data (what actually works per merchant vertical)
--   - Team/merchant performance metrics

CREATE TABLE IF NOT EXISTS recovery_sessions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  case_id         TEXT NOT NULL REFERENCES recovery_cases(id),
  customer_id     TEXT,

  -- Recommendation shown at session start
  starting_recommendation TEXT,
  recommendation_accepted BOOLEAN,

  -- Timeline
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  session_duration_seconds INTEGER,

  -- What happened
  outcome         TEXT CHECK (outcome IN (
                    'recovered', 'promised', 'no_answer', 'wrong_number',
                    'dispute', 'not_interested', 'abandoned', 'in_progress'
                  )),
  amount_recovered NUMERIC(12,2) DEFAULT 0,
  actions_taken   JSONB DEFAULT '[]'::jsonb,
  -- e.g. [{"action":"call","at":"..."},{"action":"reminder","at":"..."}, ...]

  -- Merchant override — did they do something different from recommendation?
  manual_override TEXT,

  -- Free-form merchant note at end of session
  notes           TEXT,

  completed_by    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_sessions_tenant ON recovery_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_case ON recovery_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_started ON recovery_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_outcome ON recovery_sessions(outcome);
