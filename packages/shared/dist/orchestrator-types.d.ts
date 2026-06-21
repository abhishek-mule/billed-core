import type { BehavioralRecommendationContext, OperatingHoursConfig, ReminderStage } from './types';
export interface OptimalSendWindow {
    hour: number;
    weekday: number;
    confidence: number;
}
export interface SendTiming {
    immediate: boolean;
    delayMinutes: number;
    preferredWindow: OptimalSendWindow | null;
}
export type ChannelPriority = 'whatsapp' | 'whatsapp_then_push' | 'push_only';
export interface SendChannel {
    priority: ChannelPriority;
    channelViability: number;
}
export type MessageTone = 'soft' | 'neutral' | 'firm' | 'urgent';
export interface SendContent {
    tone: MessageTone;
    stage: ReminderStage;
}
export interface SendCadence {
    nextFollowUpDays: number;
    maxFollowUps: number;
    shouldSkipStage: boolean;
}
export interface EscalationDecision {
    shouldEscalate: boolean;
    reason: string | null;
}
export interface SendRecommendation {
    shouldSend: boolean;
    skipReason: string | null;
    timing: SendTiming;
    channel: SendChannel;
    content: SendContent;
    cadence: SendCadence;
    escalation: EscalationDecision;
}
export interface InvoiceOrchestrationState {
    id: string;
    total: number;
    daysOverdue: number;
    currentStage: ReminderStage;
    ignoreCount: number;
    amountRatio: number;
}
export interface OrchestrationInput {
    context: BehavioralRecommendationContext;
    invoice: InvoiceOrchestrationState;
    operatingHours: OperatingHoursConfig;
    transportConfidence?: number;
    customerTier?: string;
    reputationScore?: number;
}
export interface DecisionRuleTrace {
    ruleId: string;
    inputs: Record<string, number>;
    threshold?: number;
    outcome: boolean;
    contributionWeight?: number;
}
export interface DecisionConfidence {
    timing: number;
    channel: number;
    cadence: number;
    escalation: number;
    transport: number;
}
export interface BehavioralInterpreterVersions {
    entropy: string;
    traits: string;
    attribution: string;
    calibration: string;
    observation: string;
}
export interface OrchestrationSnapshot {
    invoiceId: string;
    customerId: string;
    tenantId: string;
    policyVersion: string;
    orchestratorVersion: string;
    inputHash: string;
    interpreterVersions: BehavioralInterpreterVersions;
    behavioralSnapshot: {
        traits: {
            temporalRegularity: {
                value: number;
                priorSource: string;
                evidenceWeight: number;
            };
            constraintAffinity: {
                value: number;
                priorSource: string;
                evidenceWeight: number;
            };
            strategicDelayLikelihood: {
                value: number;
                priorSource: string;
                evidenceWeight: number;
            };
            disputeRisk: {
                value: number;
                priorSource: string;
                evidenceWeight: number;
            };
            channelViability: {
                value: number;
                priorSource: string;
                evidenceWeight: number;
            };
        };
        readRate: number;
        channelViability: number;
        entropy: number;
        priorSource: string;
        observationCount: number;
    };
    recommendation: SendRecommendation;
    decisionConfidence: DecisionConfidence;
    ruleTraces: DecisionRuleTrace[];
    rationale: string[];
    executedAt: string;
    triggeredBy: string;
}
export interface BuildRecommendationResult {
    recommendation: SendRecommendation;
    traces: DecisionRuleTrace[];
    confidence: DecisionConfidence;
}
export declare const DEFAULT_SEND_RECOMMENDATION: SendRecommendation;
//# sourceMappingURL=orchestrator-types.d.ts.map