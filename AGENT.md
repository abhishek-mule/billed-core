# BillZo Agent Guide

## Project Context
You are working on **BillZo**, a WhatsApp-native recovery platform for Indian merchants. The project is highly modular, split between a Next.js frontend and a Node.js worker. The "Authority Gateway" is the most critical architectural component, acting as a policy-enforcement layer for all state changes.

## Development Workflow
1.  **Research:** Check `packages/shared` for models before creating new types.
2.  **Outbox First:** Side effects belong in the `outbox` worker, not the API route.
3.  **Policy Check:** If adding a new mutation, ensure it has a corresponding `Capability` and `Policy` in the Authority Gateway.
4.  **Test:** Use Vitest for business logic and state machine transitions.

## Decision-Making Framework
*   **Does it recover cash?** (High priority)
*   **Is it simple for a merchant?** (High priority)
*   **Is it "clever"?** (Avoid)
*   **Does it bypass the Authority?** (Forbidden)

## Task Execution Process
1.  **Analyze Intent:** Identify which lane an action belongs to (Transport, Recovery, Cognition, etc.).
2.  **Define Event:** Add to the event taxonomy in `packages/shared/src/events.ts`.
3.  **Implement Mutation:** Create the capability in `worker/src/lib/authority`.
4.  **Update UI:** Use the "Attention Feed" pattern for user interaction.

## Architecture Rules
*   **Multi-tenant by default:** Every query must have a `tenant_id`.
*   **Append-only Recovery:** Never update a `RecoveryCase` without logging an event to `recovery_case_events`.
*   **Baileys for Scale:** Be mindful of the connection state; Baileys is fragile and requires constant health probing.

## Coding Rules
*   **Strict Typing:** Use the shared types.
*   **Pino Logs:** Always include `tenant_id` and `context` in worker logs.
*   **Optimistic UI:** Don't make the user wait for the outbox worker.

## Review Checklist
*   [ ] Does it include `tenant_id`?
*   [ ] Is it governed by the `MutationGate`?
*   [ ] Are errors logged via `logWorkerError`?
*   [ ] Is the Recovery State Machine kept pure?
*   [ ] Does the UI follow the "Max 7 Situations" rule?

## Frontend Discipline (Added 2026-06-13)

### Before editing any page, audit for these bugs:
1.  **404 Endpoints:** Check that API endpoints called in `fetch()` actually exist as route handlers.
2.  **Response Field Mismatch:** TypeScript `api-types.ts` must match actual API response shapes. Watch for `snake_case` vs `camelCase`.
3.  **JWT Payload Position:** `token.split('.')[1]` is the payload body, `[0]` is the header.
4.  **NaN Safeguards:** All `formatINR(...)` calls need `|| 0` fallback for undefined values.
5.  **Unused Imports:** `lucide-react` icons are heavy — remove unused ones.
6.  **Hardcoded Magic Strings:** Template keys, page sizes, and delay values should be shared constants.
7.  **Dead UI Elements:** Notification bell, ⌘K search, sync pill — either wire or remove.

### Layout Rules:
- FAB must clear bottom nav: `bottom-32` on mobile, `lg:bottom-8` on desktop.
- Bottom nav is 5 columns on mobile only (`lg:hidden`).
- All API calls must use `credentials: "include"` for cookie auth.
- All Dexie queries must filter by `tenantId`.

### Fix Log — 2026-06-13 Frontend Audit:
| # | Fix | Status |
|---|-----|--------|
| 1 | `/api/invoices/remind` 404 → wired to `/api/whatsapp/send` | Done |
| 2 | JWT `split('.')[0]` → `[1]` in AppShell | Done |
| 3 | Override response `data.applied` → `data.success \|\| data.applied` | Done |
| 4 | Dashboard `formatINR()` NaN fallbacks | Done |
| 5 | Payment link: copy vs regenerate logic | Done |
| 6 | RecoveryTimeline: "Show all 9 rules" → "Show all rules" | Done |
| 7 | `udharGentle` template key is valid (in shared types) | N/A |
| 8 | Dashboard filter redundancy cleaned up | Done |
| 9 | Notification bell wired to /pulse, red dot removed | Done |
| 10 | FAB `bottom-24` → `bottom-32` to clear bottom nav | Done |
| 11 | "Remind all" button wired in cashflow | Done |
| 12 | `scheduleBackgroundSync()` on `online` event | Done |
| 13 | Unused imports pruned from invoices, detail, timeline | Done |
| 14 | Double BillZo branding: topbar title hidden on desktop (sidebar is brand anchor) | Done |
| 15 | Sidebar hamburger: 3-span bars → lucide PanelLeftClose/PanelLeft icons | Done |
| 16 | Bottom nav visible on desktop: added explicit `@media (min-width: 1024px) { display: none !important }` | Done |
| 17 | Mobile hamburger visible on desktop: same CSS guard + added base `.mobile-ham` styles | Done |
| 18 | `/api/recovery/queue` 500 on cold start: lazy-init Supabase client inside handler (was module-level `createClient('')` throwing), 8 queries now parallel | Done |
| 19 | Dashboard v1 (Stripe-grade): removed purple gradient, emojis → white/slate, Control Tower, tabular-nums | Done |
| 20 | Dashboard v2 (4-layer cockpit): Pulse / AI Action Center / Health Cards / Recent Activity. Removed navigation grid, zero shadows, recent events from API | Done |

## Context Preservation Strategy
*   Update `AGENT.md` after every session with a fix log.
*   Log architectural shifts in `ARCHITECTURE_TRUTH.md`.
*   Keep discipline rules in this `AGENT.md` "Frontend Discipline" section.
