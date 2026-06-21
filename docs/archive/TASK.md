# BillZo Task Tracker

## Completed Tasks ✅
*   [x] Core schema migration (Invoices, Payments, Reminders).
*   [x] RecoveryCase V2 state machine implementation (Pure logic).
*   [x] Baileys WhatsApp adapter for free messaging.
*   [x] Authority Gateway base implementation.
*   [x] Cognition pipeline architecture.
*   [x] Basic PWA setup with Next.js.
*   [x] Migration 028 (FK fixes and event tables).

## Current Task 🏗️
*   **Phase A Stabilization**: Verifying worker stability on Fly.io and completing the WhatsApp pairing flow with Redis persistence.
*   **Supabase Consolidation**: Running Migration 029 to ensure all business tables exist in Supabase for the eventual Neon shutdown.

## Upcoming Tasks 🚀
*   **Worker Health Probes**: Implement `/health` checks that report on queue depth and Authority phase.
*   **Recovery Backfill**: Script to convert all existing "stuck" invoices into `RecoveryCase` V2 instances.
*   **Manual Snooze/Dispute**: UI and backend support for merchant-driven case status changes.
*   **Gupshup Fallback**: Implementing the paid WhatsApp provider for high-volume tenants.
*   **Deep Razorpay Sync**: Automatic reconciliation via webhooks.

## Blockers 🛑
*   **Database Sync**: Potential race conditions during the Neon -> Supabase consolidation if dual-writing isn't perfectly handled.
*   **Baileys Session TTL**: Ensuring Redis-backed session persistence doesn't expire unexpectedly (currently 30d).

## Priorities 🎯
1.  **First Recovered Rupee**: Get one real reminder sent and one payment reconciled.
2.  **Worker Reliability**: Zero-downtime queue processing.
3.  **Data Sovereignty**: Ensuring the Authority Gateway correctly enforces tenant boundaries.

## Milestones
*   **M1: The First Rupee** (Target: Next 1 week) - One automated recovery.
*   **M2: 10 Merchant Beta** (Target: Next 4 weeks) - Stable pairing and recovery for 10 users.
*   **M3: Database Sovereignty** (Target: Next 8 weeks) - Full consolidation to Supabase, Neon removed.
