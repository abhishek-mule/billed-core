# ADR-001: Gupshup Inbound Webhook Authentication

- **Status:** Accepted
- **Date:** 2026-09-19
- **Scope:** WhatsApp webhook inbox (pre-GO)

## Context

BillZo launches WhatsApp on Gupshup as the sole production provider (outbound +
inbound). The unified webhook route initially assumed HMAC verification via a
single `GUPSHUP_WEBHOOK_SECRET` env var for both Gupshup and Meta payloads, and
the Meta-only recommendation at the time assumed Gupshup behaved like Meta.

## Decision

- **Gupshup does not sign webhooks.** The provider-documented inbound-auth
  mechanism is **source-IP allowlisting** against Gupshup's published IP list.
- The route must verify the request source against the documented allowlist and
  **fail closed on unknown source IP** (reject, never process), layered on TLS,
  payload validation, dedupe, and the durability boundary.
- `GUPSHUP_WEBHOOK_SECRET` HMAC is retired from the inbound path and is **not**
  aliased to `META_APP_SECRET`. Legacy `/api/meta/webhook` stays temporarily as
  a compatibility path only.
- Empirical capture (operator runs webhook.site against the real callback URL and
  records the observed source/peer IP) is the decisive evidence before
  implementing the allowlist. Never ping candidate IPs from our own machines.

## Rejected alternatives

- **HMAC via `GUPSHUP_WEBHOOK_SECRET`** — false assumption; Gupshup documents no
  signing mechanism. Retired.
- **Meta-Cloud-API-only launch** — superseded by the Gupshup-only scope decision
  (recorded in `docs/development/DECISIONS.md`, 2026-09-19). The core finding
  (no signature; allowlist) stands.
- **Adding an unexplained observed IP to pass a test** — explicitly forbidden;
  unknown source → STOP and investigate.

## Consequences

- Implement fail-closed source-IP verification in the unified route (needs
  unfreeze decision; webhook path is currently frozen).
- Rework obsolete Gupshup-signature test fixtures (`webhook.route.test.ts`,
  `webhook-security.test.ts`) and re-run the staging lifecycle verification.
- Do not duplicate the IP list here: the captured list and capture protocol live
  in `docs/operations/WEBHOOK_AUTH_AND_SECRETS.md`; the authoritative source is
  `partner-docs.gupshup.io/docs/gupshup-ip-allowlisting`.

## Affected systems

- `mini_saas_frontend/src/app/api/whatsapp/webhook/route.ts`
- webhook route/security tests, staging verify script
- `docs/operations/WEBHOOK_PRE_GO_CHECKLIST.md` (gate 17)
