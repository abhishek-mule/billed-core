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
}
export declare const DEFAULT_SEND_RECOMMENDATION: SendRecommendation;
//# sourceMappingURL=orchestrator-types.d.ts.map