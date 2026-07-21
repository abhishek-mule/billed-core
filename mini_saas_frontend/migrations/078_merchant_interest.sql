-- ============================================================
-- merchant_interest: Lead capture for plan upgrades
--
-- Stores requests for Growth, Business, and Enterprise plans
-- during pilot phase. Later can be generalized to waitlists,
-- beta access, feature requests, or sales inquiries.
-- ============================================================

CREATE TABLE merchant_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
      type IN ('growth', 'business', 'enterprise')
  ),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS, no indexes, no FKs — intentionally minimal until
-- volume justifies optimization.
