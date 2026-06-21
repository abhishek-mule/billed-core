# BillZo

BillZo is a **reconstructive financial recovery engine** designed to synchronize truth between merchants, customers, and payment rails.

## Documentation Entry Points
*   **[System Constitution](ARCHITECTURE_TRUTH.md):** The core architectural invariants and dimensional truth model.
*   **[Implementation Plan](IMPLEMENTATION_PLAN.md):** The 45-day roadmap to the First Rupee Recovery Loop.

## Core Pillars
1.  **Money Truth:** Immutable event ledger + pure reducer projection.
2.  **Relationship Memory:** Behavioral tracking (VIP, annoyance, promises).
3.  **Policy Engine:** Context-aware action gating (`canSendReminder`).

## Status
*   **Backend:** Proven (Loop closed: Payment -> Attribution -> Recovered).
*   **Infrastructure:** Stabilized on local Redis.
*   **Next Step:** Implement Task 1.1 (Financial Reducer Hardening).
