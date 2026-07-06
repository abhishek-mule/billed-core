"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeDecisionEngine = void 0;
class FakeDecisionEngine {
    constructor() {
        this.name = 'fake';
    }
    async evaluate(input) {
        if (input.nextActionType === 'review_payment') {
            return { action: 'review', reason: 'Payment needs confirmation', confidence: 0.95 };
        }
        if (input.brokenPromises > 0) {
            return { action: 'call', reason: 'Promise missed — call required', confidence: 0.95 };
        }
        if (input.ignoredReminders >= 3) {
            return { action: 'call', reason: '3 reminders ignored — escalate to call', confidence: 0.9 };
        }
        if (input.promiseToPayDate) {
            const due = new Date(input.promiseToPayDate);
            const now = new Date();
            due.setHours(0, 0, 0, 0);
            now.setHours(0, 0, 0, 0);
            if (due <= now) {
                return { action: 'review', reason: 'Promise due today — review status', confidence: 0.85 };
            }
            return { action: 'wait', reason: 'Promise active — no action needed', confidence: 0.8 };
        }
        if (input.oldestOverdueDays > 0) {
            const stage = input.oldestOverdueDays <= 2 ? 't0_soft'
                : input.oldestOverdueDays <= 5 ? 't24_nudge'
                    : input.oldestOverdueDays <= 10 ? 't72_strong'
                        : 't5_warning';
            return { action: 'send_reminder', reason: `${input.oldestOverdueDays}d overdue`, reminderStage: stage, confidence: 0.85 };
        }
        return { action: 'send_reminder', reason: 'Payment pending', confidence: 0.75 };
    }
    clear() {
    }
}
exports.FakeDecisionEngine = FakeDecisionEngine;
//# sourceMappingURL=fake-decision-engine.js.map