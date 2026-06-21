# Billzo Production System

## Non-Negotiable Rule

Every user action writes to Dexie first. Supabase, WhatsApp, and Razorpay are background systems. The UI never waits for network and never shows cached-data loaders.

## Flow

1. Mock login injects `tenant_id`.
2. User scans, invoices, collects, or purchases.
3. Dexie transaction writes the record, event ledger, and `sync_queue`.
4. UI refreshes instantly from IndexedDB.
5. Background sync retries with exponential backoff.
6. Supabase RLS enforces `tenant_id`.
7. WhatsApp events update `sent/read/paid` feedback.

## Data Model

The full Supabase schema lives at `src/lib/billzo/supabase-rls.sql` and includes:

- `tenants`
- `customers`
- `products`
- `invoices`
- `invoice_items`
- `purchases`
- `inventory_movements`
- `payments`
- `recovery_attempts`
- `whatsapp_events`
- `sync_queue`

Every table has `tenant_id`, UUID primary keys, and timestamps where records mutate.

## Recovery Engine

Stages:

- `t0_soft`: immediate trust-building reminder with PDF link.
- `t24_nudge`: next-day nudge.
- `t72_strong`: stronger overdue language.
- `t5_warning`: final warning tone.

Adaptive timing:

- If a reminder is read, next follow-up can happen sooner.
- If unread, spacing increases to avoid spam.
- Partial payment resets the invoice to the soft stage.
- Full payment stops recovery.

Every message carries the invoice PDF URL.

## Conflict Policy

- Invoices, products, customers, and purchases use latest-write-wins with local `version`.
- Payments and WhatsApp events use server authority because provider events are append-only truth.
- Queue rows use idempotency keys: `tenant:entity:id:action`.

## Performance

- App shell is static.
- Scanner/OCR is lazy-loaded.
- No charts, reports, or passive analytics.
- First screen is action-first: pending money, overdue invoices, low stock.
