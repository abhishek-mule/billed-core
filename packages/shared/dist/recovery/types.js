"use strict";
// ============================================================
// RECOVERY TYPES — Recovery domain aggregate root types
// ============================================================
//
// RecoveryOrchestrator produces RecoveryPlan (what to do next).
// ActionPlanner consumes RecoveryPlan and produces ActionPlan (how to do it).
// CollectionAction is the stored record.
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMINDER_STRATEGIES = exports.RECOVERY_GOALS = exports.ACTION_SOURCES = exports.ACTION_STATUSES = exports.ACTION_TYPES = void 0;
// ============================================================
// ACTION TYPE — Every possible recovery action
// ============================================================
exports.ACTION_TYPES = [
    'reminder',
    'payment_request',
    'call',
    'visit',
    'escalate',
    'wait',
];
// ============================================================
// ACTION STATUS — Lifecycle of a collection action
// ============================================================
exports.ACTION_STATUSES = [
    'scheduled',
    'in_progress',
    'completed',
    'failed',
    'cancelled',
    'expired',
];
// ============================================================
// ACTION SOURCE — Who/what created the action
// ============================================================
exports.ACTION_SOURCES = ['system', 'worker', 'merchant', 'customer'];
// ============================================================
// RECOVERY GOAL — What the orchestrator is trying to achieve
// ============================================================
exports.RECOVERY_GOALS = [
    'full_payment',
    'partial_payment',
    'engagement',
    'relationship_preservation',
];
// ============================================================
// MERCHANT POLICY — CSS inheritance model
// System defaults → Tenant policy → Customer override → Invoice override
// ============================================================
exports.REMINDER_STRATEGIES = ['gentle', 'balanced', 'aggressive'];
//# sourceMappingURL=types.js.map