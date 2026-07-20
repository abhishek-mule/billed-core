# BillZo Pilot Verification Runbook

> **Purpose:** Validate the complete recovery loop end-to-end with a real merchant, real
> customer, real WhatsApp, and a real (test) payment — *before* writing any analytics code
> or automating tests.
>
> **Reality First Rule:** Validate the *product* before you automate the *test*.

---

## Architecture Under Test (Scenario A — BillZo-owned Meta)

During the pilot BillZo owns a **single Meta WABA** and uses it for every merchant's
reminders. Meta is **infrastructure**, not a tenant channel:

- Configured **once at worker boot** from `META_ACCESS_TOKEN` / `META_PHONE_NUMBER_ID` /
  `META_WABA_ID` (`worker/bootstrap/meta.ts`).
- `initializeMeta()` throws if env is missing → worker calls `process.exit(1)`. No degraded
  mode. On success it logs: `[Worker] Meta initialized — automatic payment reminders enabled`.
- `MetaAdapter.initialize()` validates the token, confirms the phone number is reachable, and
  loads approved templates.
- Sending path: `worker/lib/whatsapp-router.ts` → `getMetaAdapterSafe()` → `meta.send('meta', …)`.
  `getEffectiveProvider()` returns `'meta'`.
- **No** `messaging_channels` DB row, **no** per-tenant provider resolution, **no**
  `/api/channel/health` endpoint, **no** provider selection UI.

**Operator pre-flight (before each session):** the worker boots cleanly and prints the
"Meta initialized — automatic payment reminders enabled" line. There is no HTTP health
endpoint for reminders — boot success *is* the health check. (The generic `/health`
liveness probe exists but does **not** confirm Meta.)

> Scenario B (merchant-owned Meta) is deferred until ~20 merchants / 500+ reminders prove
> demand. The `MetaAdapter` is the stable seam; a future `MessagingService` sits above it
> without changing the adapter.

---

## The Loop We Are Proving

```
Merchant ──creates──▶ Invoice
Invoice ──overdue──▶ Reminder decision (canSendReminder)
Reminder ──send──▶ WhatsApp (Meta Cloud API, BillZo-owned)
WhatsApp ──delivered──▶ Customer receives
Customer ──understands──▶ Reminder looks trustworthy, invoice clear, CTA obvious
Customer ──taps link──▶ Pays via Razorpay (Test Mode)
Razorpay ──webhook──▶ Reconciliation
Reconciliation ──links──▶ Payment attributed
Recovery ──updates──▶ Case closed + timeline
Merchant ──sees it work──▶ Done
```

> You are not measuring **delivery** — you are measuring **communication**. A technically
> successful reminder that customers ignore is still a failed product.

A failure at **any** step stops the pilot. Nothing else is prioritized until this passes 100%.

---

## Environment (confirmed for the pilot)

| Component | Setting |
|---|---|
| WhatsApp | **Real Meta Cloud API** — production WABA, production phone number |
| Template | **Real approved** Meta template (e.g. `udharGentle`) |
| Merchant device | **Real** phone running the merchant app |
| Customer device | **Real, opted-in** WhatsApp number |
| Razorpay | **Test Mode** (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` test keys) |

This validates the weakest integration (real WhatsApp delivery) without involving live money.

---

## Operator Preflight (run BEFORE touching the environment)

Sounds trivial, but it prevents wasting an hour because Redis wasn't running.

```
Preflight

□ Correct branch checked out (refactor/meta-direct)
□ Tag = pilot-rc1
□ Worker build clean (pnpm --filter billzo-worker build)
□ Redis running
□ Database migrated
□ Razorpay test mode enabled
□ Meta template approved (e.g. udharGentle)
□ Merchant phone verified
□ Customer phone opted in
□ Internet stable
```

---

## Level 1 — Manual Runbook (NOW)

Anyone on the team can run this. Allow **10–15 minutes** for the happy path.

### Preconditions
- [ ] `worker/.env` (or `.env.local`) has `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`
- [ ] Worker boots and logs `Meta initialized — automatic payment reminders enabled`
- [ ] Razorpay **test** mode keys set
- [ ] Worker running with outbox + reminders queues active
- [ ] Frontend running
- [ ] A real phone available to receive the WhatsApp reminder
- [ ] A real UPI / test card to make the payment

### Execution Checklist

**Operator pre-flight**
- [ ] Worker boot log shows `Meta initialized — automatic payment reminders enabled`
- [ ] Approved reminder template is live on the Meta WABA

**Merchant**
- [ ] Create merchant account (email magic-link → onboarding)
- [ ] Business step → Continue (no WhatsApp step shown)
- [ ] Customers step → add or skip
- [ ] Lands on Recovery Readiness; sees **"Automatic payment reminders enabled"**
- [ ] Confirm tenant_id assigned

**Customer**
- [ ] Add customer with a **real, opted-in** WhatsApp number
- [ ] Confirm automation mode enabled for the customer

**Invoice**
- [ ] Create a **₹100** invoice
- [ ] Set due date = **today** (force overdue quickly)

**Recovery**
- [ ] Trigger the overdue scheduler (or wait for the scheduled scan)
- [ ] Confirm `canSendReminder` returned `allowed` (no policy block)

**WhatsApp delivery** — *product validation, not software validation*
- [ ] Reminder delivered to the real phone
- [ ] Template rendered correctly (no broken variables)
- [ ] Payment / UPI link works (opens correctly on Android)
- [ ] Language/tone appropriate for the merchant's customer

**Customer understood the reminder** — *the checkpoint that matters most*
- [ ] Did the reminder look **trustworthy** (not spam)?
- [ ] Was the **invoice understandable** (amount, what it's for)?
- [ ] Was the **CTA obvious** (what to tap)?
- [ ] Was the **payment link immediately visible**?
- [ ] Customer acted without needing explanation

**Payment**
- [ ] Customer pays via test UPI / card
- [ ] Amount matches invoice

**Razorpay**
- [ ] Webhook received by `/api/payment/webhook`
- [ ] Payment reconciled automatically (`reconciliation.ts` → invoice linked)
- [ ] No dead-letter / retry storm

**BillZo state**
- [ ] Invoice status = `Paid` / `recovered`
- [ ] `recovery_cases` updated (case = `recovered` / `closed`)
- [ ] Timeline (`recovery_case_events`) shows the full story
- [ ] 0 unhandled errors in Sentry / worker logs

---

## Timestamp Capture (no analytics code needed)

Do **not** just tick boxes. Write down the clock time of each event:

| Event              | Timestamp |
| ------------------ | --------- |
| Invoice created    |           |
| Became overdue     |           |
| Reminder decision  |           |
| Meta accepted      |           |
| Customer received  |           |
| Customer understood |         |
| Payment initiated  |           |
| Razorpay webhook   |           |
| Invoice reconciled |           |
| Recovery closed    |           |

From these timestamps you already have:
- **Time To First Reminder** (invoice → reminder sent)
- **Time To First Recovered Payment (TTFRP)** (invoice → recovered)
- **Drop-off point** (last timestamp before any stall)

No aggregation script required. Capture this for **Merchant #1** and every pilot after.

---

## Failure Tests (run AFTER the happy path passes)

### Test 1 — Meta unavailable
- [ ] Set an **invalid / expired** `META_ACCESS_TOKEN` (or temporarily revoke it)
- [ ] Restart the worker
- **Expected:**
- [ ] Worker **refuses to start** (`process.exit(1)`)
- [ ] Clear error in logs: `Meta initialization failed — worker refusing to start`
- [ ] **No** degraded mode, **no** silent fallback

### Test 2 — Razorpay webhook failure
- [ ] Simulate the webhook not arriving (block `/api/payment/webhook`, or drop it)
- **Expected:**
- [ ] Payment still **succeeds** at Razorpay
- [ ] Invoice does **not** silently become `Paid`
- [ ] Recovery remains **pending reconciliation**
- [ ] A later retry reconciles it correctly
- [ ] **No** duplicate payment
- [ ] **No** duplicate reminder sent

---

## Evidence to Archive (not just timestamps)

Alongside the 9-event timing table, save artifacts from Merchant #1. They will save hours
on Merchant #2:

- [ ] Worker logs around Meta initialization (boot)
- [ ] Worker logs around the reminder send
- [ ] Razorpay webhook payload (sanitized — strip `razorpay_signature` / keys)
- [ ] Recovery timeline screenshot
- [ ] Merchant dashboard screenshot **before** payment
- [ ] Merchant dashboard screenshot **after** reconciliation
- [ ] WhatsApp message screenshot (customer side)
- [ ] Notes on the "Customer understood" checkpoint (trust / clarity / CTA)

Store these in a `pilot-sessions/merchant-01/` folder (not committed if it holds PII).

---

## During the Pilot — operate, don't fix

Keep a running issue log. Do **not** optimize wording or UI mid-session unless it blocks
completion:

| Issue                        | Severity | Fix immediately? |
| ---------------------------- | -------- | ---------------- |
| Worker crash                 | Critical | Yes              |
| Payment reconciliation wrong | Critical | Yes              |
| Reminder wording awkward     | Medium   | No               |
| Merchant confused by label   | Low      | No               |

Anything not Critical → write it down, fix after the session.

---

## Feature Request Freeze

Merchant #1 will almost certainly ask for: SMS, PDF tweaks, custom reminder text,
multi-language, reports, bulk actions. **Write every request down. Implement none until it
recurs across multiple merchants.** A single merchant's wishlist is not a roadmap.

---

## What Constitutes a Failed Pilot

Be explicit **before** you begin (prevents hindsight bias):

- [ ] Meta cannot reliably deliver reminders
- [ ] Payment cannot be automatically reconciled
- [ ] Merchant needs your intervention to complete the recovery loop
- [ ] Merchant finishes the loop but says they wouldn't continue using BillZo

Any one of these = pilot failed; fix on the branch, do not merge.

---

## Branch & Merge Strategy

All pilot work lives on **`refactor/meta-direct`**. Do **not** merge to `master` until the
recovery loop passes end-to-end (happy path + both failure tests).

```
master
   │
   └── refactor/meta-direct
            │
            ▼
      Manual Pilot Verification
            │
      ┌─────┴─────┐
      │           │
    PASS        FAIL
      │           │
 merge → master  fix on branch
```

`git stash` or commit freely on the branch; `master` stays as the clean rollback point.

### Do NOT merge immediately after the session

```
Pilot Session Report
        ↓
Sleep on it
        ↓
Review logs calmly
        ↓
Categorize issues (Critical / Medium / Low)
        ↓
Only then merge
```

A surprising number of "bugs" disappear after reviewing the timeline calmly. Merge only
once the loop passed and issues are categorized.

### Archiving pilot sessions

Create a directory per merchant so evidence accrues without building analytics:

```
pilot/
    001/
        session.md
        timeline.csv
        merchant-before.png
        merchant-after.png
        whatsapp-message.png
        worker.log
        webhook.json
    002/
    003/
```

By Merchant #10 you'll have a valuable dataset — captured from observation, not infrastructure.
(Move `scripts/meta-send-test.mjs` under `tools/internal/` post-pilot and mark it "never
shipped" so it isn't mistaken for production code.)

---

## Pilot Exit Criteria

The pilot is complete only if **all** are true:
- [ ] Merchant created first invoice
- [ ] Merchant sent first reminder
- [ ] Customer received reminder
- [ ] Customer paid
- [ ] Payment reconciled automatically
- [ ] Merchant completed one full invoice → reminder → payment cycle
- [ ] Merchant says they would **choose to keep using BillZo** after the pilot

> The last two checkboxes measure the product hypothesis, not onboarding polish.

---

## Execution Order

```
L1   Manual runbook on real Meta + Razorpay test mode (Merchant #1)
        ├─ Happy path + timestamps
        ├─ Failure Test 1 (Meta down → worker won't start)
        └─ Failure Test 2 (webhook down → no silent pay / no dup)
   ↓
   PASS?  ──no──▶  fix on refactor/meta-direct
   ↓ yes
   Phase 5  Dead-code + UI cleanup (only after proven)
   ↓
   Phase 6  Docs finalized to match architecture
   ↓
   merge refactor/meta-direct → master
   ↓
   Repeat 5–10× → capture timestamps
   ↓
   L2   Semi-automatic harness (human still pays)
   ↓
   L3   CI mock harness (every PR)
```

---

## P0a — Secret Hygiene (do this before any pilot merchant)

**Verify first (immediate):**
- [ ] Add gitleaks to CI + pre-commit hook
- [ ] `gitleaks detect --log-opts="--all"` on full git history → 0 leaks
- [ ] Confirm `.gitignore` blocks `*.env`, `.env.local`, `worker/.env`

**Rotate only these three (highest impact):**
- [ ] Razorpay key pair (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`)
- [ ] Supabase **service-role** key
- [ ] `JWT_SECRET`

**Defer** (only if exposed externally): Gemini, Brevo, Firebase, VAPID, Meta token, Upstash, DB passwords.
