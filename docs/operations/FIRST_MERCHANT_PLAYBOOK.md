# FIRST_MERCHANT_PLAYBOOK.md

> **Purpose:** The operational manual for onboarding **Merchant #1** and running the first
> real recovery loop. Rehearse this journey yourself *before* touching any more code or
> running secret scans.
>
> **Reality First Rule:** A smooth merchant journey matters more than any backend optimization.

---

## 0. Environment & Accounts (decide BEFORE the pilot)

| Question | Decision |
|---|---|
| WhatsApp channel? | **BillZo-owned Meta Cloud API** (production WABA, production phone). Merchant never connects anything. |
| Meta WABA / phone? | __________ (BillZo's pilot WABA) |
| Razorpay account? | **Test mode** keys only |
| Android device (merchant)? | __________ |
| UPI app (test payment)? | __________ |
| Test customer phone (real, opted-in)? | __________ |
| If WhatsApp fails? | Worker **refuses to start** (fail-fast) — fix Meta env. No fallback path. |
| If webhook doesn't arrive? | Payment still succeeds; invoice stays pending reconciliation; retry later. Manually POST to `/api/payment/webhook` only to simulate. |
| How to reset data between tests? | Delete tenant rows + re-run `pnpm --filter mini_saas_frontend db:reset` (document exact steps here). |

---

## 1. Discover & Sign Up

**Path:** Landing → `/auth` magic-link → email → `/api/auth/supabase` → `/onboarding`

- [ ] Open the app, click "Send Magic Link" with a real email
- [ ] Open email, click link → lands on `/onboarding`
- [ ] **Watch for:** email login misconfig → stuck on "config" error

---

## 2. Business Setup

**Path:** `/onboarding` (business step) → `POST /api/merchants/create` → sets `bz_tenant` cookie

- [ ] Enter Business Name (≥2 chars), Business WhatsApp number (10 digits), optional GSTIN/category
- [ ] **Watch for:** duplicate-phone error if you reuse a number; GSTIN must be exactly 15 chars
- [ ] On success → redirected straight to the Customers step (no WhatsApp connect step)

---

## 3. Customers (no WhatsApp step)

Onboarding is **Business → Customers → Done**. There is no WhatsApp connect step — BillZo
owns the reminder channel.

- [ ] Add the real test customer (name + opted-in WhatsApp number)
- [ ] Confirm automation mode is enabled for the customer

---

## 4. Reminder Channel — BillZo-owned Meta (IMPLEMENTED, direct adapter)

Decision: **BillZo owns the WhatsApp Business Account during the pilot.** Merchants never
see providers, tokens, webhooks, or QR codes. Implemented as a direct adapter:

- `worker/bootstrap/meta.ts` reads `META_ACCESS_TOKEN` / `META_PHONE_NUMBER_ID` /
  `META_WABA_ID` and calls `initializeMeta()` at worker boot.
- `MetaAdapter.initialize()` validates the token, confirms phone reachability, loads
  approved templates. If env is missing/invalid → worker `process.exit(1)`.
- `worker/lib/whatsapp-router.ts` `sendWhatsAppMessage` sends via the bootstrapped
  `MetaAdapter` singleton directly — **no** `messaging_channels` row, **no** provider
  resolution, **no** `/api/channel/health`.
- `getEffectiveProvider()` returns `'meta'`.
- Frontend `/api/recovery/readiness` is a **static env check** → "Automatic payment
  reminders enabled". Settings pages show "Payment Reminders", not "Connect WhatsApp".

**Operator pre-flight (before each session):** the worker boots and logs
`[Worker] Meta initialized — automatic payment reminders enabled`. Boot success *is* the
health check. There is no reminder-specific HTTP health endpoint.

> Scenario B (merchant-owned Meta) is deferred until ~20 merchants / 500+ reminders prove
> demand. The `MetaAdapter` is the stable seam for that future work.

---

## 5. Add First Customer

**Path:** `/onboarding` (customers step) → CSV import or Skip → `POST /api/customers/bulk-import`

- [ ] For pilot: add the **real test customer** manually or via CSV (name + phone)
- [ ] Customer must be opted-in for WhatsApp reminders
- [ ] **Watch for:** phone formatting; automation mode default

---

## 6. Create First Invoice

**Path:** `/pos` or `/invoices` → create ₹100 invoice, due **today**

- [ ] Verify invoice saved, status = issued/outstanding
- [ ] Set due date = today so the overdue scheduler picks it up fast
- [ ] **Watch for:** POS error states (per IMPLEMENTATION_CHECKLIST, POS lacks error handling)

---

## 7. Trigger Reminder & Receive Payment

**Path:** overdue scheduler → `canSendReminder` → `reminders.ts` → Meta adapter → customer
pays → `POST /api/payment/webhook` → reconciliation → invoice Paid

- [ ] Scheduler runs; reminder decision = allowed
- [ ] Reminder delivered to the real Android phone
- [ ] Template renders correctly; payment link opens on the UPI app
- [ ] Customer pays (test UPI/card)
- [ ] Razorpay webhook arrives → payment reconciled → invoice `Paid`, recovery case `closed`
- [ ] **If webhook missing:** do NOT manually mark paid; let reconciliation retry. To
      simulate, POST the Razorpay payload to `/api/payment/webhook`.
- [ ] **Watch for:** webhook delay, dead-letter retries, Meta template rejection

---

## 8. Verify Merchant Understanding

- [ ] Merchant sees the invoice as Paid in dashboard
- [ ] Recovery timeline shows the full story
- [ ] **Customer understood the reminder** — looked trustworthy, invoice clear, CTA obvious, payment link visible (see PILOT_VERIFICATION_RUNBOOK.md)
- [ ] Merchant completed one full invoice → reminder → payment cycle
- [ ] Merchant says: *"I would choose to keep using BillZo."*

> **Failed pilot** (defined before you begin): Meta can't deliver reliably · payment can't
> auto-reconcile · merchant needs your help to finish the loop · merchant wouldn't continue.
> Any one = stop, fix on the branch, don't merge.

---

## 9. Failure Tests (after happy path)

### Test 1 — Meta unavailable
- [ ] Invalid/expired `META_ACCESS_TOKEN`; restart worker
- [ ] **Expected:** worker refuses to start (`process.exit(1)`), clear error log. No degraded mode.

### Test 2 — Razorpay webhook failure
- [ ] Block `/api/payment/webhook`; customer pays anyway
- [ ] **Expected:** payment succeeds; invoice NOT silently paid; recovery pending
      reconciliation; retry reconciles later; no duplicate payment; no duplicate reminder.

---

## 10. Branch & Merge

All pilot work is on **`refactor/meta-direct`**. Merge to `master` only after the loop
passes (happy path + both failure tests).

```
master ──▶ refactor/meta-direct ──▶ verify ──pass──▶ merge → master
                                  └────────fail──▶ fix on branch
```

---

## Timestamp Capture (no analytics code needed)

| Event              | Timestamp |
| ------------------ | --------- |
| Merchant signed up |           |
| Customer added     |           |
| Invoice created (₹100, due today) |  |
| Became overdue     |           |
| Reminder decision  |           |
| Meta accepted      |           |
| Customer received  |           |
| Payment initiated  |           |
| Razorpay webhook   |           |
| Invoice reconciled |           |
| Recovery closed    |           |

From this you already have Time-To-First-Reminder and TTFRP. No aggregation script required.

---

## Pilot Exit Criteria (all must be ✅)

- [ ] Merchant created first invoice
- [ ] Merchant sent first reminder
- [ ] Customer received reminder
- [ ] Customer paid
- [ ] Payment reconciled automatically
- [ ] Merchant completed one full invoice → reminder → payment cycle
- [ ] Merchant would choose to keep using BillZo

---

## Priority Stack (per pilot-discipline decision)

```
1. Rehearse Merchant #1 journey        ← DONE (this doc)
2. Implement BillZo-owned Meta adapter ← DONE (Scenario A, direct adapter)
3. Gitleaks + secret hygiene
4. Manual pilot verification (L1 + 2 failure tests)  ← DO THIS NEXT
5. Dead-code + UI cleanup (Phase 5, after proven)
6. Docs finalized to architecture (Phase 6)
7. Merge refactor/meta-direct → master
8. Learn from real merchants → then instrument
```
