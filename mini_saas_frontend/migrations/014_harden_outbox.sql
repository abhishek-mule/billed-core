-- 014_harden_outbox.sql
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed'));
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- 015_add_dlq.sql
CREATE TABLE IF NOT EXISTS failed_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  failed_at TIMESTAMPTZ DEFAULT NOW()
);
