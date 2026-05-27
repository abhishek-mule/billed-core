# Domain Sovereignty Manifest

This document defines canonical ownership, mutation authority, projection responsibilities, and forbidden mutators for every domain in the BillZo platform.

**Status:** Living document — must be updated when domain boundaries change.
**Rule:** Every domain MUST have exactly one canonical authority and one mutation authority. Violations must be flagged in code review.

---

## Sovereignty Table

| Domain | Canonical Authority | Mutation Authority | Projection Stores | Event Producers | Allowed Consumers | Forbidden Mutators | Replay Capability |
|--------|--------------------|--------------------|-------------------|-----------------|-------------------|--------------------|--------------------|
| **Accounting Ledger** | ERPNext (Frappe) | ERPNext only | Postgres `invoices`, Dexie `invoices` | Worker (webhook handler) | Frontend (read-only projections), Worker (read queries) | Frontend, Worker (direct), n8n | Partial (reconstruct from webhook events) |
| **Customer Records** | ERPNext (Frappe Customer) | ERPNext + Provisioning API | Postgres `customers`, Dexie `customers` | Provisioning API, Worker (sync) | Frontend (projections), Worker (orchestration) | Frontend (direct), n8n | Full (from provisioning events) |
| **Product/Inventory** | ERPNext (Frappe Item) | ERPNext only | Postgres `products`, Dexie `products` | Worker (sync bridge) | Frontend (projections), POS | Frontend (direct create/update) | Partial |
| **Behavioral Metrics** | Postgres (`customer_behavioral_metrics`, `whatsapp_events`) | Worker (behavioral materializer) | Postgres projections only | Worker (behavioral engine) | Worker (orchestrator), Worker (recovery) | Frontend, n8n, ERPNext | Full (replay from event stream) |
| **WhatsApp Transport** | Postgres (`whatsapp_events`) | Worker (transport layer) | Postgres `whatsapp_message_projection` | Worker (Baileys socket, Gupshup client) | Worker (behavioral engine), Frontend (read-only) | Frontend (direct), n8n, ERPNext | Full (from raw transport events) |
| **Tenant Lifecycle** | Provisioning API (FastAPI) | Provisioning API only | Postgres `tenants`, Frappe Billed Tenant, Dexie `tenants` | Provisioning API, Worker (onboarding) | Frontend (read-only), Worker (read-only) | Frontend, Worker, n8n, ERPNext | Full (from provisioning events) |
| **Auth/Session** | JWT service (middleware) | Auth API only | Frontend cookies (`bz_access`, `bz_refresh`) | Auth API | Frontend (middleware), API routes | Firebase, Supabase Auth | N/A (session only) |
| **Payments** | Razorpay (external) | Payment webhook handler | Postgres `payments`, Dexie `payments`, Frappe Payment Entry | Payment webhook (Worker) | Frontend (read-only), Recovery engine | Frontend (direct), n8n | Full (from webhook events) |
| **Recovery Orchestration** | Postgres (`recovery_cases`, `recovery_attributions`) | Worker (orchestrator) | Postgres projections | Worker (orchestrator) | Frontend (read-only) | Frontend, n8n, ERPNext | Full (replay from orchestration snapshots) |
| **User Experience State** | Frontend (Dexie/IndexedDB) | Frontend only | Dexie stores | Frontend actions | Sync bridge (Worker) | Worker, n8n, ERPNext | N/A (transient) |

---

## Rules

### Rule 1 — No Cross-Domain Mutation
No component may write to a store it does not own. Reading is permitted via the store's public query interface only.

### Rule 2 — Projections Are Read-Only
Any component may maintain a read-only projection of a domain it does not own. These projections must be disposable and rebuildable from the event stream. They must NEVER be written back to the canonical authority.

### Rule 3 — Event-Driven Synchronization
When a component needs data from another domain, it must consume events from that domain's event stream. Direct database queries to another domain's store are permitted for bootstrapping only, with an explicit migration plan to event-driven consumption.

### Rule 4 — Authority Escalation
No component may escalate its own authority. If a component needs mutation capability in a domain it does not own, it must emit an intent and let the domain owner process it.

---

## Current Violations (Must Fix)

| Violation | Location | Fix |
|-----------|----------|-----|
| Worker directly UPDATEs `invoices` | `queues/reminders.ts:221-229` | Emit `recovery.reminder.sent` event; let ERP bridge update Frappe |
| Frontend directly creates/updates `products` | `products-service.ts` | Products must be created in ERPNext first; frontend writes to Dexie as transient projection only |
| Worker directly INSERTs `whatsapp_events` | `lib/baileys-socket.ts:154-172` | Must emit outbox event and let transport projector write |
| n8n directly calls Frappe APIs | All n8n workflows | Must go through API gateway with intent validation |
| Frontend directly calls `/api/whatsapp/send` | `whatsapp-actions.ts` | Must go through `/api/intents/send-message` instead |
