"use strict";
// ============================================================
// ORCHESTRATOR TYPES — Policy/inference boundary
// ============================================================
// The orchestrator is a pure functional policy engine.
// It accepts BehavioralRecommendationContext + invoice state
// and returns a SendRecommendation.
//
// The orchestrator NEVER:
//   - sends messages
//   - reads/writes databases
//   - checks rate limits
//   - generates message text
//
// boundary:
//   memory → inference → recommendation → policy → execution
//   (types.ts)  (traits)  (orchestrator)   (reminders queue)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SEND_RECOMMENDATION = void 0;
// ============================================================
// DEFAULTS — Safe fallbacks when observationCount is 0
// ============================================================
exports.DEFAULT_SEND_RECOMMENDATION = {
    shouldSend: true,
    skipReason: null,
    timing: {
        immediate: false,
        delayMinutes: 0,
        preferredWindow: null,
    },
    channel: {
        priority: 'whatsapp',
        channelViability: 0,
    },
    content: {
        tone: 'neutral',
        stage: 't0_soft',
    },
    cadence: {
        nextFollowUpDays: 3,
        maxFollowUps: 4,
        shouldSkipStage: false,
    },
    escalation: {
        shouldEscalate: false,
        reason: null,
    },
};
//# sourceMappingURL=orchestrator-types.js.map