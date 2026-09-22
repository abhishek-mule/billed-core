-- 099_recovery_escalations.sql
-- Phase C: Recovery Escalation Pack — the escalation spine table.
--
-- One table, three roles separated by column intent (per RECOVERY_ESCALATION_PACK.md Rev 2):
--   Domain A  Recovery Decision   — status, recommended, grade, basis, merchant_decision
--   Domain B  Recovery Case       — snapshot (portable evidence projection, written ONCE)
--   Domain C  Settlement Workflow — settlement_offer, merchant_note
--
-- Deviations from the spec sketch (Schema §10) — the spec shows `uuid` for
-- case_id / customer_id / primary_invoice_id, but the LIVE spine is TEXT:
--   recovery_cases.id / customer_id, customers.id, invoices.id are all TEXT.
-- Per the 028 lesson (FK type mismatches) and 096/097 house style we use TEXT
-- identifiers with NO declared FK constraints — asserts exact-match types without
-- re-introducing the 028 trap. prepared_by stays UUID (auth users are UUID).
--
-- Append-only, exactly-once, house style (named CHECKs, partial-unique, tenant_id text):
--   - exactly one ACTIVE escalation per recovery case; settled/cancelled releases the slot
--   - basis (facts) frozen at assessment — it is what the merchant was shown
--   - snapshot written ONCE on prepare; never mutated (portable projection, Section 4)
--   - grade is INTERNAL ONLY (deterministic ordering); it is never rendered

BEGIN;

CREATE TABLE IF NOT EXISTS public.recovery_escalations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            TEXT NOT NULL,
    case_id              TEXT NOT NULL,                 -- recovery case (customer-level)
    customer_id          TEXT NOT NULL,                 -- customer-level pack assembly
    primary_invoice_id   TEXT NOT NULL,                 -- trigger invoice; pack includes all customer's overdue

    -- Domain A — Recovery Decision
    status               TEXT NOT NULL DEFAULT 'assessed'
                         CHECK (status IN ('assessed', 'recommended', 'prepared', 'notified', 'settled', 'cancelled')),
    recommended          BOOLEAN NOT NULL DEFAULT FALSE,
    grade                INT NOT NULL DEFAULT 0,        -- INTERNAL ONLY: ordering, never rendered
    basis                JSONB NOT NULL DEFAULT '[]',   -- frozen at assessment; "escalation basis" bullets
    merchant_decision    TEXT
                         CHECK (merchant_decision IS NULL OR merchant_decision IN ('authorize', 'offer_plan', 'pause', 'decline')),
    merchant_note        TEXT,

    -- Domain B — Recovery Case
    snapshot             JSONB,                         -- portable evidence projection, written ONCE on 'prepared'
    prepared_by          UUID,
    prepared_at          TIMESTAMPTZ,

    -- Domain C — Settlement Workflow
    settlement_offer     JSONB
                         CHECK (settlement_offer IS NULL OR (
                           settlement_offer ? 'type'
                           AND settlement_offer->>'type' IN ('full', 'partial', 'plan', 'revised_promise_date')
                         )),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one ACTIVE escalation per customer-case; settled/cancelled releases
-- the slot. Partial-unique must be a standalone index (PG has no partial
-- table constraint form).
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_escalations_active_case
    ON public.recovery_escalations (case_id)
    WHERE status NOT IN ('settled', 'cancelled');

-- Command-center / per-tenant reads.
CREATE INDEX IF NOT EXISTS idx_recovery_escalations_tenant_status
    ON public.recovery_escalations (tenant_id, status);

COMMENT ON TABLE public.recovery_escalations IS
    'Phase C escalation spine: exactly one ACTIVE escalation per recovery case (settled/cancelled releases the slot). Separate domains: decision (status/basis/grade/merchant_decision), recovery case (immutable snapshot), settlement (settlement_offer).';
COMMENT ON COLUMN public.recovery_escalations.case_id IS 'Recovery case id (TEXT — matches recovery_cases.id; do NOT cast to uuid).';
COMMENT ON COLUMN public.recovery_escalations.customer_id IS 'Customer id (TEXT — matches recovery_cases.customer_id / customers.id). Customer-level pack assembly: one customer, N overdue invoices → one coherent pack.';
COMMENT ON COLUMN public.recovery_escalations.primary_invoice_id IS 'Trigger invoice (TEXT — matches invoices.id). The pack includes all of the customer''s relevant overdue invoices; this one is the trigger.';
COMMENT ON COLUMN public.recovery_escalations.grade IS 'INTERNAL ONLY — deterministic integer for ordering which case surfaces first. Never rendered to merchants.';
COMMENT ON COLUMN public.recovery_escalations.basis IS 'Escalation basis bullets (real ledger facts), frozen at assessment — never mutated.';
COMMENT ON COLUMN public.recovery_escalations.snapshot IS 'Portable evidence projection written ONCE on prepare; never mutated. Live records may change later — the snapshot does not rewrite.';
COMMENT ON COLUMN public.recovery_escalations.merchant_decision IS 'authorize | offer_plan | pause | decline — recorded without necessarily advancing status (a merchant can pause while a case stays prepared).';
COMMENT ON COLUMN public.recovery_escalations.settlement_offer IS 'Settlement offer for the Get-paid path: full | partial | plan | revised_promise_date, with amount/schedule when applicable.';

-- ---------------------------------------------------------------------------
-- Frozen evidence: basis (assessment) and snapshot (prepare) are append-only.
-- Once written they can never be mutated — the pack is reproducible, never
-- rewritten (RECOVERY_ESCALATION_PACK.md §4, §8.2). enforced mechanically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_recovery_escalations_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.basis IS NOT NULL AND OLD.basis <> '[]'::jsonb AND NEW.basis IS DISTINCT FROM OLD.basis THEN
        RAISE EXCEPTION 'recovery escalation basis is frozen after assessment (re-assess via a cancelled slot)';
    END IF;
    IF OLD.snapshot IS NOT NULL AND NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
        RAISE EXCEPTION 'recovery escalation snapshot is immutable after prepare';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recovery_escalations_frozen ON public.recovery_escalations;
CREATE TRIGGER trg_recovery_escalations_frozen
    BEFORE UPDATE ON public.recovery_escalations
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_recovery_escalations_frozen();

COMMIT;