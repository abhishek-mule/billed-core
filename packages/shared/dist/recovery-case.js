"use strict";
// ============================================================
// RecoveryCase — Canonical Collection Position Aggregate Root
// ============================================================
//
// RecoveryState = FACT (what is true about the collection position)
// EngagementState = BELIEF (behavioral interpretation)
//
// Never mix facts and beliefs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_ACTION_TYPES = exports.ENGAGEMENT_STATES_V2 = exports.RECOVERY_STATE_PRECEDENCE = exports.RECOVERY_STATES_V2 = void 0;
exports.deriveRecoveryState = deriveRecoveryState;
exports.computeAttentionScore = computeAttentionScore;
// ============================================================
// RECOVERY STATE — Factual collection position
// ============================================================
// Precedence order (higher = overrides lower when deriving from invoices):
//   closed > recovered > disputed > promised > partial_payment > overdue > active
exports.RECOVERY_STATES_V2 = [
    'active', // invoices exist, no red flags
    'overdue', // at least one invoice past due_date
    'partial_payment', // some invoices paid, some still open
    'promised', // merchant recorded a promise-to-pay
    'recovered', // all invoices paid
    'disputed', // merchant marked as disputed
    'closed', // manually closed or written off
];
// Precedence map: higher index = higher precedence
exports.RECOVERY_STATE_PRECEDENCE = {
    active: 0,
    overdue: 1,
    partial_payment: 2,
    promised: 3,
    disputed: 4,
    recovered: 5,
    closed: 6,
};
// ============================================================
// ENGAGEMENT STATE — Behavioral interpretation
// ============================================================
exports.ENGAGEMENT_STATES_V2 = [
    'unseen', // no reminder response detected
    'engaged', // opened/read reminders
    'intent', // clicked payment link
    'likely_to_pay', // positive payment behavior pattern
    'ghosting', // repeated non-response after engagement
];
// ============================================================
// NEXT ACTION TYPE — System recommendation
// ============================================================
exports.NEXT_ACTION_TYPES = [
    'send_reminder',
    'review_payment',
    'follow_up_call',
    'wait',
    'merchant_review',
];
// ============================================================
// DERIVE STATE — Deterministic precedence from invoice data
// ============================================================
function deriveRecoveryState(invoices) {
    let hasOverdue = false;
    let hasPartial = false;
    let hasActive = false;
    for (const inv of invoices) {
        const s = inv.status.toLowerCase();
        if (s === 'overdue' || (s === 'unpaid' && inv.dueDate && new Date(inv.dueDate) < new Date())) {
            hasOverdue = true;
        }
        else if (s === 'partial') {
            hasPartial = true;
        }
        else if (s === 'unpaid' || s === 'active') {
            hasActive = true;
        }
        else if (s === 'paid' || s === 'reconciled') {
            // paid — doesn't affect state
        }
        else if (s === 'disputed') {
            return 'disputed';
        }
    }
    if (hasOverdue)
        return 'overdue';
    if (hasPartial)
        return 'partial_payment';
    if (hasActive)
        return 'active';
    return 'recovered';
}
// ============================================================
// COMPUTE ATTENTION SCORE — Deterministic ranking
// ============================================================
function computeAttentionScore(params) {
    let score = 0;
    if (params.overdueDays > 30)
        score += 50;
    else if (params.overdueDays > 14)
        score += 30;
    else if (params.overdueDays > 7)
        score += 15;
    if (params.linkClicked)
        score += 20;
    if (params.promiseBroken)
        score += 15;
    if (params.totalOverdue > 50000)
        score += 10;
    if (params.totalOverdue > 10000)
        score += 5;
    if (params.paymentDetected)
        score -= 30;
    return Math.max(0, score);
}
//# sourceMappingURL=recovery-case.js.map