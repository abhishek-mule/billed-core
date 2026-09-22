export type EscalationStage = 'healthy' | 'monitor' | 'attention' | 'urgent' | 'critical';
export declare const ESCALATION_STAGE_DAYS: {
    readonly monitor: 7;
    readonly attention: 15;
    readonly urgent: 30;
};
export declare function escalationStageFromDays(overdueDays: number): EscalationStage;
/** Urgent+ = the stage at which escalation is even eligible. */
export declare function isUrgentPlus(stage: EscalationStage): boolean;
/** Deterministic INR formatting (Indian grouping) shared by basis bullets. */
export declare function recoveryFormatRupees(amount: number): string;
export interface EscalationDecisionInput {
    /** Oldest overdue days across the customer's invoices (case-level). */
    overdueDays: number;
    /** Total outstanding across the customer's relevant overdue invoices. */
    outstanding: number;
    /** Number of open (unpaid) invoices feeding outstanding. */
    invoiceCount: number;
    /** Promised → overdue transitions. */
    brokenPromises: number;
    /** Outbound whatsapp sent/delivered/read that did not resolve the invoice. */
    ignoredReminders: number;
    /** Call outcomes with no answer. */
    unansweredCalls: number;
    /** False when there is no live payment arrangement (offer / promise-to-pay). */
    hasActiveArrangement: boolean;
}
export type EscalationBasisKind = 'outstanding' | 'overdue' | 'broken_promise' | 'ignored_reminder' | 'unanswered_call' | 'no_arrangement';
export interface EscalationBasisItem {
    /** Machine kind — lets the UI group/colour bullets. */
    kind: EscalationBasisKind;
    /** Human fact string, always backed by a verifiable ledger fact. */
    fact: string;
}
export interface RecoveryEscalationDecision {
    recommended: boolean;
    /** INTERNAL ONLY — deterministic integer for ordering which case surfaces
     *  first. Never rendered to merchants; basis bullets are what merchants see. */
    grade: number;
    basis: EscalationBasisItem[];
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
export declare function escalationDecision(input: EscalationDecisionInput): RecoveryEscalationDecision;
export type RecoveryEffortChannel = 'whatsapp' | 'followups' | 'calls' | 'promises' | 'payments';
export interface RecoveryEffortEvent {
    channel: RecoveryEffortChannel;
    occurredAt: string;
}
export interface RecoveryEffortSummary {
    attempts: number;
    /** Whole days spanned by the effort window (min 1). */
    days: number;
    channels: Record<RecoveryEffortChannel, number>;
    noise: string;
    result: string;
}
/**
 * Aggregate the recovery spine into "9 attempts over 47 days". `result` is
 * deterministic: payments win, then promises, else the neutral default.
 */
export declare function buildEffortSummary(events: RecoveryEffortEvent[], window: {
    start: string;
    end: string;
}): RecoveryEffortSummary;
export type SettlementOfferKind = 'full' | 'partial' | 'plan' | 'revised_promise_date';
export interface SettlementOffer {
    type: SettlementOfferKind;
    /** Amount when applicable (full/partial/plan). */
    amount?: number;
    /** Instalment description when type = plan (e.g. "3 monthly instalments"). */
    schedule?: string;
    /** ISO date when type = revised_promise_date. */
    dueBy?: string;
    note?: string;
}
export declare const SETTLEMENT_OFFER_KINDS: SettlementOfferKind[];
export interface SettlementOfferValidation {
    valid: boolean;
    errors: string[];
}
/** Validate a settlement offer. Unknown kinds / negative amounts are always invalid. */
export declare function validateSettlementOffer(offer: unknown): SettlementOfferValidation;
export type EscalationStatus = 'assessed' | 'recommended' | 'prepared' | 'notified' | 'settled' | 'cancelled';
export type MerchantDecision = 'authorize' | 'offer_plan' | 'pause' | 'decline';
export declare const MERCHANT_DECISIONS: MerchantDecision[];
export declare const ESCALATION_STATUSES: EscalationStatus[];
/**
 * Cycle per spec §10: assessed → recommended → prepared → notified →
 * settled | cancelled. `decide()` records merchant_decision without
 * necessarily advancing status (a merchant can pause while prepared).
 * settled/cancelled are terminal.
 */
export declare function allowsEscalationTransition(from: EscalationStatus, to: EscalationStatus): boolean;
/** Echoes Phase 1.5 093 backfill outcome: 67 historical events have no
 *  `billzo_message_id` stored → their link is Unknown. */
export type AttributionFidelity = 'verified' | 'unknown_no_action_id' | 'provider';
export interface CommunicationEvidenceSource {
    /** Customer attribution from the identity chain; null when unproven. */
    attributedCustomerId: string | null;
    /** True when the event carries a verified link (billzo_message_id /
     *  recovery_attempt_id → collection_action). */
    hasActionId: boolean;
    /** Provider-confirmed event (reached the customer's device). */
    source: 'whatsapp' | 'provider';
}
/**
 * Classify a communication's attribution confidence. The pack can NEVER assert
 * customer attribution for an unverified event:
 *   a) no stored action id  → 'unknown_no_action_id' (093 reality)
 *   b) action id + identity → 'verified'
 *   c) action id, no identity → 'provider'
 */
export declare function classifyCommunicationFidelity(src: CommunicationEvidenceSource): AttributionFidelity;
export interface PackEvidenceRow {
    fidelity: AttributionFidelity;
    kind: string;
    summary: string;
    occurredAt: string | null;
    /** Source identifier — collection_action.id / recovery_case_events.id / provider id. */
    sourceId: string | null;
    /** Customer contact is ONLY attached when fidelity = verified. */
    customerPhone: string | null;
    customerName: string | null;
}
export interface EvidenceCandidate extends CommunicationEvidenceSource {
    kind: string;
    summary: string;
    occurredAt: string | null;
    sourceId: string | null;
}
/**
 * Build the pack's communication evidence. The no-causal-evidence invariant is
 * mechanical here: customer contact is attached ONLY to 'verified' rows. An
 * unverified event still renders (the pack records it as attribution-unknown)
 * but never claims the customer sent/received it.
 */
export declare function buildPackEvidence(rows: EvidenceCandidate[], customer?: {
    name?: string | null;
    phone?: string | null;
}): PackEvidenceRow[];
//# sourceMappingURL=escalation.d.ts.map