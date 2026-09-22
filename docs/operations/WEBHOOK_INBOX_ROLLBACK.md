# Webhook Inbox — Production Rollback Runbook

> **Status:** Draft for review, part of the production-readiness review (finding F8).
> No production changes have been executed. This runbook covers the **webhook
> inbox slice**: migration 100 (`webhook_inbox`) + 101 (`webhook_inbox_alerts`),
> the unified route, and the worker drain/health-watch.
>
> **Related:** `migrations/100_webhook_inbox.sql`, `migrations/101_webhook_inbox_alerts.sql`,
> `worker/src/lib/webhook/inbox-drain.ts`, `worker/src/lib/webhook/inbox-alerts.ts`,
> `worker/src/index.ts` (drain kill switch + health watch).

---

## 0. The two invariants that shape every rollback

1. **A 200 to the provider is final.** Once the route returns 200 the provider
   never re-sends that event. Nothing in this runbook "replays from provider" —
   if we lose inbox rows we lose those events forever.
2. **`webhook_inbox` IS the source of truth, not a cache.** Inbox rows are
   lossless providers of the domain writes the drain produces. A "rollback"
   that drops inbox rows silently destroys acknowledged events.

**Corollary:** the rollback procedure is **pause → diagnose → resume**, never
"delete and replay". The drain has a kill switch precisely so that pause never
requires a destructive schema change.

---

## 1. FIRST ACTION: stop consuming (kill switch)

Set on the worker environment (billing-worker deploy env) and re-deploy the
worker:

```text
WEBHOOK_DRAIN_ENABLED=false
```

The drain stops claiming `webhook_inbox` rows. **Do NOT touch the frontend
route and do NOT drop any table at this step.** The route keeps durably
upserting incoming events into `webhook_inbox` (fail-closed if the table is
missing), so new traffic stays safe while you investigate.

> Health watch stays ON by default (`WEBHOOK_ALERTS_ENABLED`, default true) and
> runs independently of the drain — this is deliberate, so the queue remains
> observable while consumption is off. Keep it ON during the rollback.

## 2. Verify the worker stopped consuming

After the worker re-deploys, confirm the worker log line:

```text
[worker] webhook inbox drain DISABLED (set WEBHOOK_DRAIN_ENABLED=true to enable)
[worker] webhook inbox health watch RUNNING (periodic alerts)
```

Then confirm the queue is accumulating and NOT draining. Expect
`status='processing'` count → 0 within ~10s and `status='queued'` to trend up
with live traffic:

```sql
select status, count(*) from public.webhook_inbox group by 1 order by 2 desc;
```

Additionally check the cluster: no row is left in `processing` for longer than a
scan tick after the drain stops (the claim RPC wrote nothing new), and
`claim_next_webhook_events` returns no rows.

```sql
select count(*) from public.webhook_inbox where status = 'processing';
```

## 3. The inbox remains intact (verify before diagnosing)

Confirm no data was lost during the pause:

```sql
-- oldest and newest queued rows (age = pause window)
select min(created_at) as oldest_ingest, max(created_at) as newest_ingest
  from public.webhook_inbox where status = 'queued';
```

If the window shows continuous ingest, the route kept working while the consumer
was off — the durable boundary held. **This is what a good pause looks like.**

## 4. Diagnose

With the drain off you have two read-only surfaces:

```sql
-- 1) DLQ: rows that exhausted 6 attempts before the pause window
select id, provider_event_type, attempts, available_at, last_error
  from public.webhook_inbox
 where status = 'dead'
 order by updated_at desc;

-- 2) Active operator alerts (firing only, PII-safe by design)
select id, kind, severity, fired_at, detail
  from public.webhook_inbox_alerts
 where status = 'firing'
 order by fired_at desc;

-- 2b) recent alert history (last 3 days)
select kind, status, fired_at, resolved_at
  from public.webhook_inbox_alerts
 where created_at > now() - interval '3 days'
 order by created_at desc;
```

Alert semantics (see `inbox-alerts.ts`):

| kind | meaning | severity |
|---|---|---|
| `dead_rows` | ≥1 row exhausted retries → terminal DLQ | critical |
| `retry_storm` | ≥5 rows stuck retrying (attempts ≥ 3) | warning |
| `queue_stalled` | oldest queued row claimable-and-undone > 30 min | warning |
| `stale_processing` | crashed/hung processors leaving expired leases | warning |

Alerts are PII-safe by contract: `detail` carries counts, ages, and opaque row
UUIDs **only** — never payload, provider event ids, phone numbers, or error
text. For the forensic error, query `webhook_inbox.last_error` on the row id.

Requeue a dead row deliberately (one at a time) after fixing its cause:

```ts
// worker console / diagnostic script
import { requeueWebhookEvent } from './src/lib/webhook/inbox-drain'
await requeueWebhookEvent('<row id>')
```

`requeueWebhookEvent` resets `attempts=0` and re-queues **only** `dead` rows; a
stale `last_error` is preserved until the retry succeeds.

## 5. Resume consumption (re-enable after validation)

When the cause is confirmed fixed and the DLQ/diagnostics are clean:

1. Re-run the staging gate (`worker/scripts/staging-webhook-inbox-verify.ts`)
   against staging to reconfirm the lifecycle end-to-end from the current code.
2. Re-enable the kill switch and re-deploy the worker:

```text
WEBHOOK_DRAIN_ENABLED=true
```

3. Verify the drain restarts (worker log: `webhook inbox drain RUNNING`) and the
   backpressure drains oldest-first:

```sql
select status, count(*) from public.webhook_inbox group by 1 order by 2 desc;
-- expect queued ↓, done ↑ within seconds-minutes
```

4. Watch alerts: any `dead_rows`/`stale_processing` firing while the queue is
   draining is a signal the underlying cause is not fixed — pause again.

## 6. Provider cutover / route rollback (if the failure is in the route)

If the unified route itself is at fault (not the worker), you can gate at the
ingress instead: **the route has no env kill switch** (review finding F9) —
its OFF is reverting the frontend deploy. If you must keep old behaviour:

1. Revert the frontend deploy that introduced `app/api/whatsapp/webhook`
   (the route 503s until migration 100 exists, so keeping it pre-100 is safe).
2. Legacy `app/api/meta/webhook` remains available as the stopgap ingress
   (it writes `whatsapp_events` directly). Its answer to "provider cutover" is:
   point the provider/webhook dashboard back at the Meta-only URL.
3. **Only after the ingress is proven idle** may you consider DBA work on
   `webhook_inbox`; never drop it while it holds 200-acked events.

Do not run `DROP TABLE public.webhook_inbox` or `DROP SCHEMA` as part of any
rollback. There is no re-fetch from the provider once a 200 has been sent.

## 7. Degradation matrix (decision aid)

| symptom | first action | fix path |
|---|---|---|
| queue growing, no processing | already OFF — diagnose worker | see §4 |
| dead rows appearing | freeze drain, inspect `last_error`, requeue after fix | §4 |
| route errors (503/5xx) | keep drain OFF, reverting ingress first | §6 |
| alerts not firing | check `WEBHOOK_ALERTS_ENABLED`, watch boot log | set true, redeploy |
| alert spam (false positives) | raise thresholds via env (`WEBHOOK_ALERT_INTERVAL_MS`, or per-kind constants). Note: thresholds are compile-time constants today. | inbox-alerts.ts |
| credits slice regression | separate runbook: `docs/operations/RECOVERY_CREDITS_ROLLOUT.md` | — |