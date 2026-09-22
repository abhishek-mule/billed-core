"use strict";
// ============================================================
// RECOVERY ESCALATION PACK — shared domain math (pure, framework-free).
//
// Phase C: deterministic decision + evidence-pack + settlement workflow.
// Deliberately NO I/O here — every DB concern lives in the runtime adapters
// (frontend `recovery-escalation.ts`, worker lifecycle). This module is the
// single source of truth for:
//   * the recommendation rule + internal ordering grade (never rendered)
//   * basis bullet building (facts only, no score leak)
//   * Recovery Effort Summary aggregation
//   * settlement-offer validation + status lifecycle transitions
//   * the no-causal-evidence invariant (fidelity markers)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESCALATION_STATUSES = exports.MERCHANT_DECISIONS = exports.SETTLEMENT_OFFER_KINDS = exports.ESCALATION_STAGE_DAYS = void 0;
exports.escalationStageFromDays = escalationStageFromDays;
exports.isUrgentPlus = isUrgentPlus;
exports.recoveryFormatRupees = recoveryFormatRupees;
exports.escalationDecision = escalationDecision;
exports.buildEffortSummary = buildEffortSummary;
exports.validateSettlementOffer = validateSettlementOffer;
exports.allowsEscalationTransition = allowsEscalationTransition;
exports.classifyCommunicationFidelity = classifyCommunicationFidelity;
exports.buildPackEvidence = buildPackEvidence;
// Mirrors the collection-risk stage scale (recovery-risk.ts). Urgent+ starts
// the day after the Attention band ends (16+ days overdue).
exports.ESCALATION_STAGE_DAYS = {
    monitor: 7, // 1–7
    attention: 15, // 8–15
    urgent: 30, // 16–30
    // 31+ → critical
};
function escalationStageFromDays(overdueDays) {
    if (overdueDays <= 0)
        return 'healthy';
    if (overdueDays <= exports.ESCALATION_STAGE_DAYS.monitor)
        return 'monitor';
    if (overdueDays <= exports.ESCALATION_STAGE_DAYS.attention)
        return 'attention';
    if (overdueDays <= exports.ESCALATION_STAGE_DAYS.urgent)
        return 'urgent';
    return 'critical';
}
/** Urgent+ = the stage at which escalation is even eligible. */
function isUrgentPlus(stage) {
    return stage === 'urgent' || stage === 'critical';
}
/** Deterministic INR formatting (Indian grouping) shared by basis bullets. */
function recoveryFormatRupees(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}
/**
 * Deterministic BillZo policy (Section 5/6):
 *
 *   Escalation is RECOMMENDED only when the case is at stage Urgent+ AND ≥1
 *   negative relationship fact is present (broken promise OR ≥2 ignored
 *   reminders OR unanswered call attempts).
 *
 * The output is NOT a number that merchants see: `basis` bullets always
 * reference verifiable ledger facts; `grade` exists only for ordering.
 */
function escalationDecision(input) {
    const basis = [];
    if (input.outstanding > 0) {
        basis.push({
            kind: 'outstanding',
            fact: `${recoveryFormatRupees(input.outstanding)} outstanding across ${input.invoiceCount} invoice${input.invoiceCount === 1 ? '' : 's'}`,
        });
    }
    if (input.overdueDays > 0) {
        basis.push({ kind: 'overdue', fact: `${input.overdueDays} days overdue` });
    }
    if (input.brokenPromises > 0) {
        basis.push({
            kind: 'broken_promise',
            fact: `${input.brokenPromises} payment promise${input.brokenPromises === 1 ? '' : 's'} broken`,
        });
    }
    if (input.ignoredReminders > 0) {
        basis.push({
            kind: 'ignored_reminder',
            fact: `${input.ignoredReminders} reminder${input.ignoredReminders === 1 ? '' : 's'} delivered/read without resolution`,
        });
    }
    if (input.unansweredCalls > 0) {
        basis.push({
            kind: 'unanswered_call',
            fact: `${input.unansweredCalls} call${input.unansweredCalls === 1 ? '' : 's'} unanswered`,
        });
    }
    if (!input.hasActiveArrangement && input.outstanding > 0) {
        basis.push({ kind: 'no_arrangement', fact: 'No active payment arrangement' });
    }
    const stage = escalationStageFromDays(input.overdueDays);
    const negativeFact = input.brokenPromises >= 1 || input.ignoredReminders >= 2 || input.unansweredCalls >= 1;
    return {
        recommended: isUrgentPlus(stage) && negativeFact,
        grade: internalOrderingGrade(input),
        basis,
    };
}
/** Deterministic ordering integer — NEVER rendered. See Section 5. */
function internalOrderingGrade(input) {
    return (Math.max(input.overdueDays, 0) +
        Math.floor(Math.max(input.outstanding, 0) / 1000) +
        input.brokenPromises * 10 +
        (input.ignoredReminders >= 2 ? 5 : 0) +
        input.unansweredCalls * 3);
}
/**
 * Aggregate the recovery spine into "9 attempts over 47 days". `result` is
 * deterministic: payments win, then promises, else the neutral default.
 */
function buildEffortSummary(events, window) {
    const channels = {
        whatsapp: 0,
        followups: 0,
        calls: 0,
        promises: 0,
        payments: 0,
    };
    for (const e of events) {
        if (channels[e.channel] !== undefined)
            channels[e.channel] += 1;
    }
    const attempts = events.length;
    const spanMs = Date.parse(window.end) - Date.parse(window.start);
    const days = Number.isFinite(spanMs) && spanMs > 0 ? Math.ceil(spanMs / 86400000) : 1;
    const result = channels.payments > 0
        ? 'Payment received'
        : channels.promises > 0
            ? 'Promises recorded — none resulting in payment'
            : 'No successful payment or reliable commitment.';
    return {
        attempts,
        days,
        channels,
        noise: `${attempts} attempts over ${days} days`,
        result,
    };
}
exports.SETTLEMENT_OFFER_KINDS = [
    'full',
    'partial',
    'plan',
    'revised_promise_date',
];
/** Validate a settlement offer. Unknown kinds / negative amounts are always invalid. */
function validateSettlementOffer(offer) {
    const errors = [];
    const o = offer;
    if (!o || typeof o !== 'object' || typeof o.type !== 'string') {
        return { valid: false, errors: ['settlement_offer.type is required'] };
    }
    if (!exports.SETTLEMENT_OFFER_KINDS.includes(o.type)) {
        return { valid: false, errors: [`settlement_offer.type must be one of: ${exports.SETTLEMENT_OFFER_KINDS.join(', ')}`] };
    }
    const hasAmount = typeof o.amount === 'number' && Number.isFinite(o.amount);
    if (hasAmount && o.amount < 0) {
        errors.push('settlement_offer.amount cannot be negative');
    }
    switch (o.type) {
        case 'full':
            if (hasAmount && o.amount <= 0)
                errors.push('full-payment amount must be positive when provided');
            break;
        case 'partial':
            if (!hasAmount || o.amount <= 0)
                errors.push('partial-payment offer requires a positive amount');
            break;
        case 'plan':
            if (!hasAmount || o.amount <= 0)
                errors.push('payment plan requires a positive total amount');
            if (!o.schedule || String(o.schedule).trim().length === 0) {
                errors.push('payment plan requires a schedule (e.g. "3 monthly instalments")');
            }
            break;
        case 'revised_promise_date':
            if (!o.dueBy || Number.isNaN(Date.parse(o.dueBy))) {
                errors.push('revised_promise_date offer requires a dueBy ISO date');
            }
            break;
    }
    return { valid: errors.length === 0, errors };
}
exports.MERCHANT_DECISIONS = [
    'authorize',
    'offer_plan',
    'pause',
    'decline',
];
exports.ESCALATION_STATUSES = [
    'assessed',
    'recommended',
    'prepared',
    'notified',
    'settled',
    'cancelled',
];
const ESCALATION_TRANSITIONS = {
    assessed: ['recommended', 'prepared', 'settled', 'cancelled'],
    recommended: ['prepared', 'settled', 'cancelled'],
    prepared: ['notified', 'settled', 'cancelled'],
    notified: ['settled', 'cancelled'],
    settled: [],
    cancelled: [],
};
/**
 * Cycle per spec §10: assessed → recommended → prepared → notified →
 * settled | cancelled. `decide()` records merchant_decision without
 * necessarily advancing status (a merchant can pause while prepared).
 * settled/cancelled are terminal.
 */
function allowsEscalationTransition(from, to) {
    return ESCALATION_TRANSITIONS[from]?.includes(to) ?? false;
}
/**
 * Classify a communication's attribution confidence. The pack can NEVER assert
 * customer attribution for an unverified event:
 *   a) no stored action id  → 'unknown_no_action_id' (093 reality)
 *   b) action id + identity → 'verified'
 *   c) action id, no identity → 'provider'
 */
function classifyCommunicationFidelity(src) {
    if (!src.hasActionId)
        return 'unknown_no_action_id';
    if (src.attributedCustomerId)
        return 'verified';
    return 'provider';
}
/**
 * Build the pack's communication evidence. The no-causal-evidence invariant is
 * mechanical here: customer contact is attached ONLY to 'verified' rows. An
 * unverified event still renders (the pack records it as attribution-unknown)
 * but never claims the customer sent/received it.
 */
function buildPackEvidence(rows, customer) {
    return rows.map(row => {
        const fidelity = classifyCommunicationFidelity(row);
        const verified = fidelity === 'verified';
        return {
            fidelity,
            kind: row.kind,
            summary: row.summary,
            occurredAt: row.occurredAt,
            sourceId: row.sourceId,
            customerPhone: verified ? customer?.phone ?? null : null,
            customerName: verified ? customer?.name ?? null : null,
        };
    });
}
//# sourceMappingURL=escalation.js.map