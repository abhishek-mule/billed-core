# BillZo System Architecture & Constitution

## Core Objective
Prove the **First Rupee Recovery** through a **Causal Truth Engine**.

---

## 1. The Stack
1.  **Truth (Event Ledger):** Supabase `outbox` table (Immutable facts).
2.  **Logic (Projection Engine):** `worker/src/lib/recovery/reducer.ts` (Derives state).
3.  **Policy (Decision Engine):** `canSendReminder()` (Execution permission).
4.  **Transport (Execution):** Baileys stateless WhatsApp socket.

---

## 2. Dimensional Truth Model
State is never a single status. It is a projection across three dimensions:
- **Financial State:** How much is owed? (Derived via Reducer).
- **Confidence State:** Is the signal trusted? (Verified vs. Conflicted).
- **Policy State:** Is action allowed? (Snoozed vs. Allowed).

---

## 3. Invariants
- **Immutable Events:** We only `APPEND` new events; we never `UPDATE` historical facts.
- **Fail-Closed:** If the projection is ambiguous, messaging is blocked.
- **Replayability:** The dashboard must be reconstructible from scratch using the event log.
- **Separation:** Money Truth is distinct from Relationship Sentiment.
