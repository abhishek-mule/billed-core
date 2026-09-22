"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const escalation_1 = require("../escalation");
const urgentInput = {
    overdueDays: 63,
    outstanding: 84000,
    invoiceCount: 4,
    brokenPromises: 3,
    ignoredReminders: 4,
    unansweredCalls: 2,
    hasActiveArrangement: false,
};
(0, vitest_1.describe)('escalation stage scale', () => {
    (0, vitest_1.it)('mirrors the collection-risk stage bands', () => {
        (0, vitest_1.expect)(escalation_1.ESCALATION_STAGE_DAYS).toEqual({ monitor: 7, attention: 15, urgent: 30 });
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(0)).toBe('healthy');
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(-2)).toBe('healthy');
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(7)).toBe('monitor');
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(15)).toBe('attention');
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(16)).toBe('urgent');
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(30)).toBe('urgent');
        (0, vitest_1.expect)((0, escalation_1.escalationStageFromDays)(31)).toBe('critical');
    });
    (0, vitest_1.it)('Urgent+ starts at 16 days overdue', () => {
        (0, vitest_1.expect)((0, escalation_1.isUrgentPlus)('urgent')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.isUrgentPlus)('critical')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.isUrgentPlus)('attention')).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.isUrgentPlus)('healthy')).toBe(false);
    });
});
(0, vitest_1.describe)('rupee formatting', () => {
    (0, vitest_1.it)('formats INR with Indian grouping, deterministic', () => {
        (0, vitest_1.expect)((0, escalation_1.recoveryFormatRupees)(84000)).toBe('₹84,000');
        (0, vitest_1.expect)((0, escalation_1.recoveryFormatRupees)(4800000)).toBe('₹48,00,000');
        (0, vitest_1.expect)((0, escalation_1.recoveryFormatRupees)(500)).toBe('₹500');
        (0, vitest_1.expect)((0, escalation_1.recoveryFormatRupees)(0)).toBe('₹0');
    });
});
(0, vitest_1.describe)('escalation decision — basis (facts only, no score leak)', () => {
    (0, vitest_1.it)('recommends only at Urgent+ with a negative relationship fact', () => {
        const d = (0, escalation_1.escalationDecision)(urgentInput);
        (0, vitest_1.expect)(d.recommended).toBe(true);
    });
    (0, vitest_1.it)('does NOT recommend when below Urgent even with negative facts', () => {
        const d = (0, escalation_1.escalationDecision)({ ...urgentInput, overdueDays: 12 });
        (0, vitest_1.expect)(d.recommended).toBe(false);
    });
    (0, vitest_1.it)('does NOT recommend at Urgent+ with no negative relationship fact', () => {
        const d = (0, escalation_1.escalationDecision)({
            ...urgentInput,
            brokenPromises: 0,
            ignoredReminders: 1, // requires >= 2
            unansweredCalls: 0,
        });
        (0, vitest_1.expect)(d.recommended).toBe(false);
    });
    (0, vitest_1.it)('does NOT recommend for a single ignored reminder regardless of stage', () => {
        (0, vitest_1.expect)((0, escalation_1.escalationDecision)({ ...urgentInput, brokenPromises: 0, ignoredReminders: 1, unansweredCalls: 0 }).recommended).toBe(false);
    });
    (0, vitest_1.it)('basis bullets are verifiable ledger facts, never a score', () => {
        const d = (0, escalation_1.escalationDecision)(urgentInput);
        (0, vitest_1.expect)(d.basis.map(b => b.fact)).toEqual([
            '₹84,000 outstanding across 4 invoices',
            '63 days overdue',
            '3 payment promises broken',
            '4 reminders delivered/read without resolution',
            '2 calls unanswered',
            'No active payment arrangement',
        ]);
    });
    (0, vitest_1.it)('omits no-arrangement bullet when a live arrangement exists', () => {
        const d = (0, escalation_1.escalationDecision)({ ...urgentInput, hasActiveArrangement: true });
        (0, vitest_1.expect)(d.basis.some(b => b.kind === 'no_arrangement')).toBe(false);
    });
    (0, vitest_1.it)('singularises counts correctly', () => {
        const d = (0, escalation_1.escalationDecision)({ ...urgentInput, brokenPromises: 1, ignoredReminders: 1, unansweredCalls: 0 });
        (0, vitest_1.expect)(d.basis).toContainEqual({ kind: 'broken_promise', fact: '1 payment promise broken' });
        (0, vitest_1.expect)(d.basis).toContainEqual({ kind: 'ignored_reminder', fact: '1 reminder delivered/read without resolution' });
    });
    (0, vitest_1.it)('grade exists for ordering but is independent of basis content', () => {
        const d = (0, escalation_1.escalationDecision)(urgentInput);
        (0, vitest_1.expect)(typeof d.grade).toBe('number');
        // grade must exist even when basis has only a single fact.
        const sparse = (0, escalation_1.escalationDecision)({ ...urgentInput, overdueDays: 16, outstanding: 0, invoiceCount: 0 });
        (0, vitest_1.expect)(sparse.basis.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(sparse.grade).toBeGreaterThan(0);
        // deterministic
        (0, vitest_1.expect)((0, escalation_1.escalationDecision)(urgentInput).grade).toBe((0, escalation_1.escalationDecision)(urgentInput).grade);
    });
});
(0, vitest_1.describe)('recovery effort summary', () => {
    (0, vitest_1.it)('aggregates per-channel counts and the effort window', () => {
        const summary = (0, escalation_1.buildEffortSummary)([
            { channel: 'whatsapp', occurredAt: '2026-08-01T10:00:00Z' },
            { channel: 'whatsapp', occurredAt: '2026-08-08T10:00:00Z' },
            { channel: 'calls', occurredAt: '2026-09-01T10:00:00Z' },
        ], { start: '2026-08-01T10:00:00Z', end: '2026-09-17T10:00:00Z' });
        (0, vitest_1.expect)(summary.attempts).toBe(3);
        (0, vitest_1.expect)(summary.channels.whatsapp).toBe(2);
        (0, vitest_1.expect)(summary.channels.calls).toBe(1);
        (0, vitest_1.expect)(summary.channels.followups).toBe(0);
        (0, vitest_1.expect)(summary.channels.promises).toBe(0);
        (0, vitest_1.expect)(summary.channels.payments).toBe(0);
        (0, vitest_1.expect)(summary.days).toBe(47);
        (0, vitest_1.expect)(summary.result).toBe('No successful payment or reliable commitment.');
    });
    (0, vitest_1.it)('never reports zero days of effort', () => {
        const s = (0, escalation_1.buildEffortSummary)([{ channel: 'promises', occurredAt: '2026-09-17T10:00:00Z' }], {
            start: '2026-09-17T10:00:00Z',
            end: '2026-09-17T10:00:00Z',
        });
        (0, vitest_1.expect)(s.days).toBe(1);
        (0, vitest_1.expect)(s.channels.promises).toBe(1);
    });
    (0, vitest_1.it)('a payment makes the result deterministic and positive', () => {
        const s = (0, escalation_1.buildEffortSummary)([{ channel: 'payments', occurredAt: '2026-09-10T10:00:00Z' }], { start: '2026-08-01T00:00:00Z', end: '2026-09-17T00:00:00Z' });
        (0, vitest_1.expect)(s.result).toBe('Payment received');
    });
});
(0, vitest_1.describe)('settlement offer validation', () => {
    (0, vitest_1.it)('ships the four published offer kinds', () => {
        (0, vitest_1.expect)(escalation_1.SETTLEMENT_OFFER_KINDS).toEqual(['full', 'partial', 'plan', 'revised_promise_date']);
    });
    (0, vitest_1.it)('rejects unknown/empty offers', () => {
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)(null).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({}).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'demand_letter' }).valid).toBe(false);
    });
    (0, vitest_1.it)('partial requires a positive amount', () => {
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'partial' }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'partial', amount: 0 }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'partial', amount: 25000 }).valid).toBe(true);
    });
    (0, vitest_1.it)('plan requires a positive amount AND a schedule', () => {
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'plan', amount: 84000 }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'plan', schedule: '3 monthly instalments' }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'plan', amount: 84000, schedule: '3 monthly instalments' }).valid).toBe(true);
    });
    (0, vitest_1.it)('revised_promise_date requires a dueBy ISO date', () => {
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'revised_promise_date' }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'revised_promise_date', dueBy: 'not-a-date' }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'revised_promise_date', dueBy: '2026-10-15' }).valid).toBe(true);
    });
    (0, vitest_1.it)('rejects negative amounts on every kind', () => {
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'full', amount: -1 }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'partial', amount: -1 }).valid).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.validateSettlementOffer)({ type: 'plan', amount: -1, schedule: 'x' }).valid).toBe(false);
    });
});
(0, vitest_1.describe)('escalation lifecycle', () => {
    (0, vitest_1.it)('covers the spec cycle assessed → recommended → prepared → notified → settled', () => {
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('assessed', 'recommended')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('recommended', 'prepared')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('prepared', 'notified')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('notified', 'settled')).toBe(true);
    });
    (0, vitest_1.it)('settled and cancelled are terminal (no outbound edges)', () => {
        for (const from of ['settled', 'cancelled']) {
            for (const to of escalation_1.ESCALATION_STATUSES) {
                (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)(from, to)).toBe(false);
            }
        }
    });
    (0, vitest_1.it)('skipping stages is rejected', () => {
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('assessed', 'notified')).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('recommended', 'notified')).toBe(false);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('notified', 'prepared')).toBe(false);
    });
    (0, vitest_1.it)('cancellation is always open from a running state', () => {
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('assessed', 'cancelled')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('recommended', 'cancelled')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('prepared', 'cancelled')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('notified', 'cancelled')).toBe(true);
    });
    (0, vitest_1.it)('a merchant can settle directly from recommended (money-first path)', () => {
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('assessed', 'settled')).toBe(true);
        (0, vitest_1.expect)((0, escalation_1.allowsEscalationTransition)('recommended', 'settled')).toBe(true);
    });
});
(0, vitest_1.describe)('no-causal-evidence invariant — fidelity markers', () => {
    (0, vitest_1.it)('classifies per the 093 backfill reality', () => {
        (0, vitest_1.expect)((0, escalation_1.classifyCommunicationFidelity)({ attributedCustomerId: 'cust1', hasActionId: true, source: 'whatsapp' })).toBe('verified');
        (0, vitest_1.expect)((0, escalation_1.classifyCommunicationFidelity)({ attributedCustomerId: null, hasActionId: false, source: 'whatsapp' })).toBe('unknown_no_action_id');
        (0, vitest_1.expect)((0, escalation_1.classifyCommunicationFidelity)({ attributedCustomerId: null, hasActionId: true, source: 'whatsapp' })).toBe('provider');
    });
    (0, vitest_1.it)('a pack built on an unverified event renders Unknown and NEVER asserts attribution', () => {
        const rows = (0, escalation_1.buildPackEvidence)([
            {
                kind: 'reminder_sent',
                summary: 'Reminder delivered',
                occurredAt: '2026-08-14T10:00:00Z',
                sourceId: null,
                attributedCustomerId: null, // 093 backfill outcome: no billzo_message_id stored
                hasActionId: false,
                source: 'whatsapp',
            },
        ], { name: 'ABC Traders', phone: '+919000000000' });
        (0, vitest_1.expect)(rows[0].fidelity).toBe('unknown_no_action_id');
        // The invariant: no customer phone/name may be attached to an unverified row.
        (0, vitest_1.expect)(rows[0].customerPhone).toBeNull();
        (0, vitest_1.expect)(rows[0].customerName).toBeNull();
        // And the row still renders — the pack records it as attribution-unknown.
        (0, vitest_1.expect)(rows[0].summary).toBe('Reminder delivered');
    });
    (0, vitest_1.it)('attaches customer contact ONLY to verified rows', () => {
        const rows = (0, escalation_1.buildPackEvidence)([
            {
                kind: 'reminder_sent',
                summary: 'Reminder read',
                occurredAt: '2026-08-14T10:00:00Z',
                sourceId: 'col-action-1',
                attributedCustomerId: 'cust1',
                hasActionId: true,
                source: 'whatsapp',
            },
        ], { name: 'ABC Traders', phone: '+919000000000' });
        (0, vitest_1.expect)(rows[0].fidelity).toBe('verified');
        (0, vitest_1.expect)(rows[0].customerName).toBe('ABC Traders');
        (0, vitest_1.expect)(rows[0].customerPhone).toBe('+919000000000');
    });
    (0, vitest_1.it)('provider events with an action id but no identity stay provider-tagged', () => {
        const rows = (0, escalation_1.buildPackEvidence)([
            {
                kind: 'payment_link_opened',
                summary: 'Payment link opened',
                occurredAt: '2026-08-20T10:00:00Z',
                sourceId: 'action-9',
                attributedCustomerId: null,
                hasActionId: true,
                source: 'provider',
            },
        ]);
        (0, vitest_1.expect)(rows[0].fidelity).toBe('provider');
        (0, vitest_1.expect)(rows[0].customerPhone).toBeNull();
    });
});
//# sourceMappingURL=escalation.test.js.map