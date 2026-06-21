# Billzo Frontend Audit

## Verdict

The previous frontend was not a money recovery machine. It was a network-first admin product carrying OTP auth, Aadhaar, onboarding, analytics, reporting, ERP, observability, push, duplicated dashboard modules, and unused workers. It forced loaders and API fetches into the primary dashboard and invoice flows, which violates Billzo's 1.5 second and offline-first rules.

## Deleted Immediately

- `src/app/api/**`: removed 80+ API routes from the active frontend because the task is frontend rebuild, not backend CRUD/admin expansion.
- `src/app/login/**`: removed OTP login surface; replaced with mock auto-login and injected demo tenant.
- `src/app/invoice/**`: removed public payment pages from the frontend shell until they directly support recovery.
- `src/components/dashboard/**`: removed duplicate passive dashboard cards, charts, sync banners, ERP cards, GST readiness cards, system health widgets.
- `src/components/sheets/**`: removed duplicated quick action and magic scan patterns.
- `src/components/AadhaarVerification.tsx`, `DataMigration.tsx`, `OnboardingChecklist.tsx`, `ObservabilityWidget.tsx`, `PushNotificationManager.tsx`: removed non-core friction surfaces.
- `src/hooks/**`: removed redundant network/session/form/offline hooks; replaced by one Dexie-backed `useBillzo`.
- `src/providers/**`: removed React Query/session/toast provider stack.
- `src/server/**`, `src/pwa/**`, `src/types/**`: removed inactive frontend-adjacent server and generated types.
- `src/lib/**`: replaced broad auth, Redis, ERP, reporting, webhook, PDF, queue, metrics, and worker modules with a compact Billzo offline domain.
- `src/lib/workers/wa-worker/node_modules/**`: removed nested dependency tree that should never live inside `src`.

## Hardcoded / Weak Patterns Found

- Network-first dashboard: `fetch('/api/merchant/stats')` blocked the first screen.
- Auth friction: middleware required `billzo_session`, while the brief explicitly asks for mock login and no OTP.
- Passive analytics: dashboard contained trends, system state, debug DTO panels, reports, and health widgets instead of CTAs.
- Duplicate UI: dashboard quick actions, sheet quick actions, magic scan component, scanner components, and invoice builders overlapped.
- Broken encoding: rupee symbols were rendered as mojibake in several screens.
- Dead routes: settings upgrade, reports paths, inventory paths, integrations paths, OTP routes, Aadhaar route, webhooks, push routes, and observability routes were not part of scanning, invoicing, recovery, or purchases.
- Server-heavy dependencies: Redis, PG, Drizzle, web-push, PDF rendering, Recharts, Zustand, React Query, and Excel export were not contributing to the core PWA flow.

## Rebuilt Structure

- `src/app/(app)/dashboard/page.tsx`: attention engine and money recovery console.
- `src/app/(app)/scan/page.tsx`: primary bill/barcode scan entry.
- `src/app/(app)/invoices/page.tsx`: one-tap invoice, repeat last, mark paid, WhatsApp recovery.
- `src/app/(app)/purchases/page.tsx`: purchase scan and living inventory.
- `src/app/(app)/settings/page.tsx`: mock login, tenant, queue, Razorpay test-mode status.
- `src/components/billzo/*`: one component namespace for the product shell and core screens.
- `src/lib/billzo/*`: Dexie schema, seed data, idempotent actions, mock tenant, Supabase sync adapter.

## Architecture Rules Applied

- All writes go to Dexie first.
- Every record has a client UUID and tenant ID.
- Sync queue uses an idempotency key: `tenant:entity:id:action`.
- UI reads local data and never waits for Supabase.
- Supabase sync is opportunistic and background-only.
- Razorpay is test-mode simulation only from invoice actions.
- Navigation is capped at five items: Home, Invoices, Scan, Purchases, Settings.

## Impact

- Removed roughly two thirds of the active frontend surface area.
- Removed 20 direct dependencies and 268 installed packages from the dependency graph.
- Eliminated first-screen API dependency.
- Replaced multi-step invoice creation with customer/product suggestions and repeat-last invoice.
- Added one-tap WhatsApp reminder, one-tap mark paid, offline queue indicator, purchase scan stock increase, invoice stock decrease.
