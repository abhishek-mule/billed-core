-- 097 Recovery Credit Reservations
--
-- In-flight reservation for the reservation → execution → settlement/release
-- model (worker credit-ledger). A credit is claimed BEFORE an automated action
-- is dispatched and held only for the duration of the send; it is either
-- settled into a real ledger 'consumption' entry after success or released
-- after failure.
--
-- Exactly-once: the global unique index on collection_action_id is an immutable
-- claim tag, so the same automated action can never reserve two credits and can
-- never be double-billed via concurrent dispatches.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recovery_credit_reservations (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             text NOT NULL,
    collection_action_id  text NOT NULL,
    pool                  text NOT NULL CHECK (pool IN ('included', 'purchased')),
    status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'settled', 'released')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    expires_at            timestamptz NOT NULL
);

-- Exactly one reservation per automated action, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_credit_reservations_action
    ON public.recovery_credit_reservations (collection_action_id);

-- Stale-reaper and per-tenant availability reads.
CREATE INDEX IF NOT EXISTS idx_recovery_credit_reservations_tenant_status
    ON public.recovery_credit_reservations (tenant_id, status);

COMMENT ON TABLE public.recovery_credit_reservations IS
    'In-flight credit reservations for automated recovery actions (reserve before send, settle after success, release after failure). Global unique collection_action_id guarantees exactly-once billing per action.';
COMMENT ON COLUMN public.recovery_credit_reservations.tenant_id IS 'Owner tenant (matches public.tenants.id).';
COMMENT ON COLUMN public.recovery_credit_reservations.collection_action_id IS 'Immutable claim tag — the automated action that holds this reservation.';
COMMENT ON COLUMN public.recovery_credit_reservations.pool IS 'Which credit pool the reservation drew from: included or purchased.';
COMMENT ON COLUMN public.recovery_credit_reservations.status IS 'active = credit held in-flight; settled = converted to a ledger consumption entry; released = returned to the pool (failure/stale).';
COMMENT ON COLUMN public.recovery_credit_reservations.expires_at IS 'TTL deadline; a stale sweep releases active rows past this timestamp.';

COMMIT;