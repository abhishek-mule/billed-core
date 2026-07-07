"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRiskFeatures = extractRiskFeatures;
function extractRiskFeatures(events, relationship) {
    const payments = events.filter(e => e.type === 'payment_received');
    const partials = events.filter(e => e.type === 'partial_payment');
    const promisesBroken = events.filter(e => e.type === 'promise_broken');
    const promisesKept = events.filter(e => e.type === 'promise_kept');
    const remindersSent = events.filter(e => e.type === 'reminder_sent');
    const remindersRead = events.filter(e => e.type === 'reminder_read');
    const totalPromises = promisesBroken.length + promisesKept.length;
    const paymentRatio = remindersSent.length > 0 ? payments.length / remindersSent.length : 0;
    const partialRatio = payments.length > 0 ? partials.length / payments.length : 0;
    const promiseBreakRate = totalPromises > 0 ? promisesBroken.length / totalPromises : 0;
    const engagementScore = remindersSent.length > 0 ? remindersRead.length / remindersSent.length : 0;
    const rawScore = (1 - Math.min(paymentRatio, 1)) * 0.3 +
        partialRatio * 0.15 +
        promiseBreakRate * 0.25 +
        (1 - engagementScore) * 0.2 +
        (relationship.respondsToCall ? 0 : 0.1);
    const riskScore = Math.min(100, Math.max(0, Math.round(rawScore * 100)));
    const defaultProbability = Math.min(1, Math.max(0, rawScore * 0.8));
    let recoveryDifficulty;
    if (riskScore > 65) {
        recoveryDifficulty = 'hard';
    }
    else if (riskScore > 35) {
        recoveryDifficulty = 'medium';
    }
    else {
        recoveryDifficulty = 'easy';
    }
    const paymentCount = payments.length + partials.length;
    const stabilityScore = paymentCount > 0
        ? Math.min(1, Math.max(0, (paymentCount / (paymentCount + promisesBroken.length + 1)) * (1 - partialRatio)))
        : 0;
    return {
        riskScore,
        defaultProbability,
        recoveryDifficulty,
        stabilityScore,
    };
}
//# sourceMappingURL=risk.js.map