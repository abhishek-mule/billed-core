# BillZo — Known Reality

> Verified operational snapshot, not architecture. Every line is labeled:
> `FACT` (verified), `INFERENCE`, `ASSUMPTION`, `UNKNOWN`, `STALE`.
> Never add an assumption here. If the `Last verified` date is old,
> re-verify before trusting anything below.

**Last verified:** 2026-09-20 (UTC)

## WhatsApp / Gupshup

- `FACT` (verified 2026-09-19, provider docs): **Gupshup is the sole production
  WhatsApp provider** (outbound + inbound). Meta Cloud API is not an active
  launch provider; legacy `/api/meta/webhook` remains only as a temporary
  compatibility path.
- `FACT` (verified 2026-09-19, provider docs): Gupshup does **not** sign webhooks.
  The documented inbound-auth mechanism is **source-IP allowlisting**.
  Authoritative list: `partner-docs.gupshup.io/docs/gupshup-ip-allowlisting`
  (14 IPs captured 2026-09-19; one-IP discrepancy vs the sibling support article
  noted — resolve from provider docs at capture time, never by pinging).
  Full detail: `docs/operations/WEBHOOK_AUTH_AND_SECRETS.md`.
- `FACT` (verified 2026-09-19, code): the unified webhook route
  (`mini_saas_frontend/src/app/api/whatsapp/webhook/route.ts`) has **no `GET`
  handler** (cannot answer Meta's `hub.challenge`), reads provider identity from
  the signing header, and only writes `webhook_inbox` (`ON CONFLICT DO NOTHING`
  on `UNIQUE(provider, provider_event_id)`).
- `FACT` (verified 2026-09-19): `GUPSHUP_WEBHOOK_SECRET` HMAC is retired from the
  inbound path; it is **not** aliased to `META_APP_SECRET`.
- `FACT` (verified 2026-09-19): pre-GO checklist is **15/19 gates**.
  Open: #16 production-secret ownership (`TBD`), #17 Gupshup authentication,
  #18 production migration apply, #19 activation approval.
  Source: `docs/operations/WEBHOOK_PRE_GO_CHECKLIST.md`.
- `FACT` (verified 2026-09-19): `WEBHOOK_DRAIN_ENABLED=false`; production
  database untouched. Webhook code path is frozen pending unfreeze decision.
- `UNKNOWN`: the observed source IP of live Gupshup deliveries in our environment
  (pending operator webhook.site capture — the decisive evidence for gate 17).

## Infrastructure

- `FACT` (verified 2026-09-20, `package.json` + provider SDK): frontend is
  Next.js 14.2.5 + React 18 + Tailwind v3.4 + `lucide-react`; `supabase-js 2.106.2`
  (default `flowType: "implicit"`); tests run on vitest.
- `FACT` (verified 2026-09-20): `tsc --noEmit` clean; **293/293 vitest tests pass**;
  production `next build` succeeds.
- `FACT` (verified 2026-09-19/20, code): web session, OTP, login-event, and
  magic-link rate-limit state live in **Postgres tables** (`sessions`,
  `kv_store`, `login_events`) accessed via the service-role client — despite
  legacy "Redis" naming in code comments. See ADR-002.
- `UNKNOWN`: whether the worker/queue path uses Redis/Upstash in production.
- `FACT` (verified 2026-09-19, git): the repo tracks only `.example` env files;
  real secrets live in platform stores + untracked local `.env.local` files.
- `FACT` (verified 2026-09-19, code review — not yet applied): migrations
  `098_recovery_credits_production`, `100_webhook_inbox`, `101_webhook_inbox_alerts`
  are GO-reviewed; apply order 098→100→101 in one window, pending approval.
  No `verify_098` script exists (verify via `verify_096` + `verify_097`).

## Auth

- `FACT` (verified 2026-09-20, code): auth is **passwordless magic-link only**.
  No password or Google-OAuth backend exists. Login UI:
  `mini_saas_frontend/src/app/auth/page.tsx` + `src/components/ui/sign-in.tsx`;
  endpoints `/api/auth/magic-link` + `/api/auth/supabase` (+ `callback-exchange`,
  `login`, `phone`, `verify-otp`, `refresh`, `logout`).
- `FACT` (verified 2026-09-20, code+fix): the `?error=` stuck-on-reload login bug
  (error-screen "Try again" preserved the query param and looped) is fixed —
  retry now clears local + query errors and strips the query string.

## Frappe / ERP (adjacent — not BillZo core)

- `FACT` (verified 2026-09-20): `frappe_docker/` is a vendored fork of upstream
  `frappe/frappe_docker` plus `apps/india_compliance` and `electrical_trader_pack`.
  Operated via repo-root `rebuild_stack.sh` (pulls `frappe/erpnext:v16.13.3`).
  11 MB / 756 tracked files. Decision to keep it (not delete): ADR-003.
- `FACT` (verified 2026-09-20, code): the only evidenced coupling to BillZo is
  type-level — `IntentSource = 'frappe'` in `worker/src/lib/authority/schemas.ts`
  (mirrored in `packages/shared`). No BillZo code imports `frappe_docker/`.
- `FACT` (verified 2026-09-20): `n8n_workflows/compose.n8n.yaml` attaches n8n to
  the external `frappe_docker` Docker network (created by that compose project).
- `UNKNOWN`: whether Frappe containers run in production; whether any live
  Frappe→BillZo intent flow exists beyond the type variant.
- `FACT`: `electrical_trader_pack/TODO.md` (Phase 3 pending) is ERP-side work,
  never a BillZo task. Ignore `frappe_docker/` unless a task explicitly involves
  the ERP side or the seam.

## App shell / UI conventions

- `FACT` (verified 2026-09-20, code): app layout is `src/components/billzo/AppShell.tsx`
  (fixed sidebar ≥1024px, mobile drawer + bottom nav, topbar with quick-nav search).
  Canonical sidebar nav lives in `src/components/billzo/SidebarNav.tsx`
  (`BILLZO_NAV_GROUPS`); desktop sidebar and mobile drawer share it.
- `FACT` (verified 2026-09-20, code): there is no `components/ui` shadcn scaffold;
  repo convention is `src/components/billzo/*`, except the already-present
  `src/components/ui/sign-in.tsx` (+ `badge`, `button`, `table`, `customers-table`).

## Current limitations

- Gate-17 empirical capture is operator-pending; no webhook-path code changes
  until the unfreeze decision.
- Production secret owners unassigned; production activation not approved.
- `FACT` (fixed 2026-09-20, ADR-004): B-01 worker raw endpoints
  (`/api/v1/recovery/override`, `/trigger-reminder`, `/api/whatsapp/pair/*`)
  now require `WORKER_INTERNAL_SECRET` HMAC; dead `clear-override` removed.
  The secret must exist in **both** Next.js and worker envs or legit proxy
  calls fail closed (503).
- `FACT` (fixed 2026-09-20): B-04 residual closed — billing webhooks anchor to
  the local `subscriptions` row; no tenant minting from raw notes. Legacy
  pre-stamping notes fall back with warn (watch logs for hit rate).
- `FACT` (fixed 2026-09-20): B-05a convergence guard live — duplicate payment
  applications no-op before ledger/events; distinct payments serialize on the
  row lock (ledger trigger = amount anchor). B-05b (outbox single-winner claim)
  still open, discovery pending.
- `known-reality.md` itself goes `STALE` the moment reality changes — the
  `Last verified` date above is the trust anchor, not the contents.
