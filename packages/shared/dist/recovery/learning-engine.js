"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningEngine = void 0;
const behavior_profile_1 = require("./behavior-profile");
const payment_1 = require("./feature-extractor/payment");
const communication_1 = require("./feature-extractor/communication");
const temporal_1 = require("./feature-extractor/temporal");
const relationship_1 = require("./feature-extractor/relationship");
const risk_1 = require("./feature-extractor/risk");
const confidence_1 = require("./confidence");
const bayesian_1 = require("./learning/bayesian");
const drift_1 = require("./learning/drift");
const drift_2 = require("./learning/drift");
class LearningEngine {
    compute(input) {
        const { customerEvents, previousProfile, driftConfig } = input;
        const now = new Date().toISOString();
        const payment = (0, payment_1.extractPaymentFeatures)(customerEvents);
        const communication = (0, communication_1.extractCommunicationFeatures)(customerEvents);
        const temporal = (0, temporal_1.extractTemporalFeatures)(customerEvents);
        const relationship = (0, relationship_1.extractRelationshipFeatures)(customerEvents);
        const risk = (0, risk_1.extractRiskFeatures)(customerEvents, relationship);
        const observed = { payment, communication, temporal, relationship };
        const derived = {
            liquidityWindow: {
                dayOfWeek: temporal.preferredDayOfWeek,
                startHour: temporal.preferredHourRange.start,
                endHour: temporal.preferredHourRange.end,
                confidence: (0, confidence_1.computeFieldConfidence)(customerEvents.length, (0, bayesian_1.posteriorVariance)((0, bayesian_1.updateBelief)({ alpha: 1, beta: 1 }, payment.paymentCount, customerEvents.length))),
            },
            riskScore: risk.riskScore,
            stabilityScore: risk.stabilityScore,
            recoveryDifficulty: risk.recoveryDifficulty,
        };
        const fieldConfidences = {
            avgSettlementDelayHours: (0, confidence_1.computeFieldConfidence)(payment.paymentCount, 0.3),
            avgPaymentAmount: (0, confidence_1.computeFieldConfidence)(payment.paymentCount, 0.4),
            readRate: (0, confidence_1.computeFieldConfidence)(communication.totalReads, 0.2),
            preferredDayOfWeek: (0, confidence_1.computeFieldConfidence)(customerEvents.length, 0.3),
        };
        const overallConfidence = (0, confidence_1.computeOverallConfidence)(fieldConfidences);
        const belief = (0, bayesian_1.updateBelief)({ alpha: 1, beta: 1 }, payment.paymentCount, customerEvents.length);
        const predicted = {
            probabilityPayToday: (0, bayesian_1.posteriorMean)(belief),
            probabilityIgnoreReminder: 1 - communication.readRate,
            expectedCollectionAmount: payment.avgPaymentAmount * (0, bayesian_1.posteriorMean)(belief),
        };
        let drift = previousProfile?.drift ?? null;
        if (previousProfile && customerEvents.length >= (driftConfig?.minimumSamples ?? drift_2.DEFAULT_DRIFT_CONFIG.minimumSamples)) {
            drift = (0, drift_1.detectHistogramDrift)([
                temporal.histograms.hourOfDay,
                temporal.histograms.dayOfWeek,
            ], [
                previousProfile.observed.temporal.histograms.hourOfDay,
                previousProfile.observed.temporal.histograms.dayOfWeek,
            ], ['hourOfDay', 'dayOfWeek'], driftConfig);
        }
        const profile = {
            customerId: customerEvents.length > 0 ? customerEvents[0].customerId : previousProfile?.customerId ?? 'unknown',
            tenantId: customerEvents.length > 0 ? customerEvents[0].tenantId : previousProfile?.tenantId ?? 'unknown',
            modelVersion: behavior_profile_1.CURRENT_MODEL_VERSION,
            updatedAt: now,
            eventCount: customerEvents.length,
            observed,
            derived,
            predicted,
            confidence: {
                overall: overallConfidence,
                fields: fieldConfidences,
            },
            drift,
        };
        const businessProfile = this.computeBusinessProfile(input, profile);
        const explanation = this.buildExplanation(profile, relationship);
        return {
            customerProfile: profile,
            businessProfile,
            recomputedAt: now,
            explanation,
            features: { payment, communication, temporal, relationship, risk },
        };
    }
    buildExplanation(profile, relationship) {
        const lw = profile.derived.liquidityWindow;
        const features = [];
        if (relationship.respondsToReminder)
            features.push('responds_to_reminders');
        if (relationship.respondsToCall)
            features.push('responds_to_calls');
        if (lw.confidence > 0.5)
            features.push('known_liquidity_window');
        if (profile.observed.communication.readRate > 0.5)
            features.push('high_read_rate');
        if (profile.observed.payment.promiseKeepingRate > 0.5)
            features.push('keeps_promises');
        if (profile.derived.stabilityScore > 0.5)
            features.push('stable_payer');
        const riskLabel = profile.derived.riskScore > 50 ? 'high' : profile.derived.riskScore > 25 ? 'medium' : 'low';
        return {
            summary: `${riskLabel} risk customer with ${features.length > 0 ? features.join(', ') : 'limited data'}`,
            keyFeatures: features,
            liquidityWindow: lw.confidence > 0 ? { dayOfWeek: lw.dayOfWeek, startHour: lw.startHour, endHour: lw.endHour } : null,
            riskScore: profile.derived.riskScore,
            stabilityScore: profile.derived.stabilityScore,
            confidence: profile.confidence.overall,
            modelVersion: behavior_profile_1.CURRENT_MODEL_VERSION,
            driftDetected: profile.drift?.hasDrifted ?? false,
        };
    }
    computeBusinessProfile(input, customerProfile) {
        const prev = input.previousBusinessProfile ?? (0, behavior_profile_1.createEmptyBusinessProfile)(input.merchantEvents[0]?.tenantId ?? 'unknown');
        if (customerProfile.eventCount === 0)
            return prev;
        const custRisk = customerProfile.derived.riskScore;
        const weightedAvg = prev.avgRiskScore * prev.customerCount + custRisk;
        const newCount = prev.customerCount + 1;
        const avgRisk = weightedAvg / newCount;
        const snoozeEvents = input.customerEvents.filter(e => e.type === 'snooze_requested');
        const snoozeRate = input.customerEvents.length > 0 ? snoozeEvents.length / input.customerEvents.length : prev.snoozeRate;
        let style = 'balanced';
        if (avgRisk > 50)
            style = 'aggressive';
        else if (avgRisk < 25)
            style = 'gentle';
        const callEvents = input.merchantEvents.filter(e => e.type === 'call');
        const callPreference = callEvents.length > 3;
        const avgDelay = customerProfile.observed.payment.avgSettlementDelayHours;
        const avgCycle = avgDelay > 0 ? avgDelay / 24 : null;
        const efficiency = customerProfile.observed.payment.paymentCount > 0
            ? Math.min(1, customerProfile.observed.payment.paymentCount / (customerProfile.observed.payment.paymentCount + input.customerEvents.filter(e => e.type === 'reminder_sent').length))
            : null;
        return {
            tenantId: prev.tenantId,
            modelVersion: behavior_profile_1.CURRENT_MODEL_VERSION,
            updatedAt: new Date().toISOString(),
            customerCount: newCount,
            avgRiskScore: avgRisk,
            preferredRecoveryStyle: style,
            dashboardEngagement: prev.dashboardEngagement,
            snoozeRate,
            callPreference,
            busiestCollectionDay: customerProfile.observed.temporal.preferredDayOfWeek,
            avgReceivableAgeDays: avgCycle,
            avgRecoveryEfficiency: efficiency,
            avgPaymentCycleDays: avgCycle,
            reminderEffectiveness: customerProfile.observed.communication.readRate,
            cashflowHealth: prev.cashflowHealth,
        };
    }
}
exports.LearningEngine = LearningEngine;
//# sourceMappingURL=learning-engine.js.map