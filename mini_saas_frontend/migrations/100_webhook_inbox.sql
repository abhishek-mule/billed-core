-- 100_webhook_inbox.sql
-- Durability boundary for the WhatsApp webhook (G1).
--
-- The route's contract is now:
--   authenticate -> parse -> normalize -> sanitize -> PostgreSQL upsert -> 200
-- A 200 is emitted ONLY after the event has crossed a durable PostgreSQL
-- boundary (this table). A failed insert returns non-2xx (503) so the provider
-- retries; duplicates are absorbed by uq_webhook_inbox_provider_event and are
-- still acknowledged 200.
--
-- The route performs NO domain writes — it never touches whatsapp_events,
-- recovery_outcomes, collection_actions, or pilot_events. Domain persistence
-- is owned by the consumer (the inbox worker) which claims rows via
-- claim_next_webhook_events.
--
-- Lease semantics (available_at):
--   queued                    -> claimable when available_at <= now()
--   processing, lease valid   -> available_at > now()  (claimed, working)
--   processing, lease expired -> available_at <= now() (crash recovery:
--                                 re-claimable by the RPC)
--   done / failed / dead      -> terminal; never claimed again
-- The claim transition (queued -> processing + fresh lease) happens in ONE
-- atomic statement under FOR UPDATE SKIP LOCKED so two consumers can never
-- receive the same row.
--
-- CREDENTIALS: payload / payload_raw are sanitized (sanitizeRaw) — credential-
-- shaped keys are redacted, strings capped at 500 chars, arrays at 20 items,
-- aggregate JSON at 16,000 bytes. Never store the webhook secret / auth
-- material. No RLS: this table is billzo-internal, accessed only via the
-- service-role client (matches 090).

BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_inbox (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider             TEXT NOT NULL DEFAULT 'gupshup'
                         CHECK (provider IN ('gupshup', 'meta')),
    provider_event_id    TEXT NOT NULL,   -- msg.id | `msg.id:status` | no-id fallback
    provider_event_type  TEXT NOT NULL
                         CHECK (provider_event_type IN ('customer_message', 'merchant_echo', 'status')),
    phone_number_id      TEXT,
    status               TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'processing', 'done', 'failed', 'dead')),
    attempts             INT NOT NULL DEFAULT 0,   -- incremented by the consumer on failure (Step 4)
    available_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- claimable-at; lease expiry while processing
    last_error           TEXT,                               -- most recent consumer failure message
    payload              JSONB NOT NULL,                     -- sanitized normalized event (reproduction source)
    payload_raw          JSONB,                              -- sanitized raw provider envelope (forensic context)
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_inbox_provider_event
    ON public.webhook_inbox (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_claim
    ON public.webhook_inbox (status, available_at);

COMMENT ON TABLE public.webhook_inbox IS
    'Durable webhook inbox (G1). HTTP 200 is only returned after an event crosses this table. The route performs no domain writes.';

COMMENT ON COLUMN public.webhook_inbox.available_at IS
    'Claim/lease boundary: while status=processing this is the lease expiry (5 min). A processing row with available_at <= now() has an expired lease and is re-claimable (crash recovery). queued rows are claimable when available_at <= now().';

-- Atomic claim: one statement under FOR UPDATE SKIP LOCKED establishes
-- ownership. The subquery locks the eligible rows; the outer UPDATE
-- transitions them to processing with a fresh 5-minute lease. Consumers can
-- never receive the same row, and never a row whose lease has not expired.
CREATE OR REPLACE FUNCTION public.claim_next_webhook_events(p_limit INT)
RETURNS SETOF public.webhook_inbox
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.webhook_inbox
     SET status        = 'processing',
         available_at  = NOW() + INTERVAL '5 minutes',
         updated_at    = NOW()
   WHERE id IN (
         SELECT id
           FROM public.webhook_inbox
          WHERE status IN ('queued', 'processing')
            AND available_at <= NOW()          -- queued+due, or expired-processing lease
          ORDER BY available_at
          LIMIT p_limit
            FOR UPDATE SKIP LOCKED
       )
   RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.claim_next_webhook_events(p_limit INT) IS
    'Atomically claims up to p_limit due inbox rows (queued with available_at <= now(), or expired processing leases). Transitions to processing with a 5-minute lease. FOR UPDATE SKIP LOCKED prevents dual-claim.';

COMMIT;