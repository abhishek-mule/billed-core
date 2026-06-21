"use strict";
// ============================================================
// DECISION ENGINE TYPES — Pre-Send Checklist
// ============================================================
// The decision engine determines whether a reminder SHOULD be
// sent, independent of HOW or WHEN (those are the orchestrator's
// domain). It enforces fundamental business rules:
//
//   1. Outstanding > 0
//   2. Not disputed
//   3. No active promise
//   4. Not snoozed
//   5. Cooldown expired
//   6. Customer reachable
//   7. No recent manual contact
//   8. Customer tier permits escalation
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_MAX_STAGE = exports.ANNOVER_THRESHOLDS = exports.PHONE_VERIFICATION_STATUSES = exports.CUSTOMER_TIERS = void 0;
// ============================================================
// CUSTOMER TIER — Escalation ceiling
// ============================================================
exports.CUSTOMER_TIERS = ['vip', 'regular', 'risky', 'blacklisted'];
// ============================================================
// PHONE VERIFICATION STATUS
// ============================================================
exports.PHONE_VERIFICATION_STATUSES = ['verified', 'unverified', 'unknown'];
// ============================================================
// INPUT — Everything the engine needs to decide
// ============================================================
exports.ANNOVER_THRESHOLDS = {
    maxRemindersPerMonth: 6,
    maxConsecutiveIgnores: 3,
    silenceDaysAfterIgnore: 7,
    maxRemindersPerInvoice: 10,
    annoyanceCooldownDays: 3,
    merchantInterventionIgnores: 3,
};
// ============================================================
// ESCALATION MATRIX — Max stage per tier
// ============================================================
exports.TIER_MAX_STAGE = {
    vip: 't24_nudge',
    regular: 't5_warning',
    risky: 't5_warning',
    blacklisted: 't5_warning',
};
//# sourceMappingURL=decision-engine-types.js.map