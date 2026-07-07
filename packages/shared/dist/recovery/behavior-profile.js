"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyMerchantProfile = exports.CURRENT_MODEL_VERSION = void 0;
exports.createEmptyCustomerProfile = createEmptyCustomerProfile;
exports.createEmptyBusinessProfile = createEmptyBusinessProfile;
exports.CURRENT_MODEL_VERSION = '1.0.0';
function createEmptyCustomerProfile(customerId, tenantId) {
    return {
        customerId,
        tenantId,
        modelVersion: exports.CURRENT_MODEL_VERSION,
        updatedAt: new Date().toISOString(),
        eventCount: 0,
        observed: {
            payment: {
                avgSettlementDelayHours: 0,
                avgPaymentAmount: 0,
                partialPaymentRate: 0,
                promiseKeepingRate: 0,
                earlyPaymentRate: 0,
                latePaymentRate: 0,
                paymentCount: 0,
                promiseCount: 0,
            },
            communication: {
                readRate: 0,
                ignoreRate: 0,
                clickToPayLatencyHours: 0,
                responseDelayHours: 0,
                totalRemindersSent: 0,
                totalReads: 0,
                totalClicks: 0,
            },
            temporal: {
                histograms: {
                    hourOfDay: new Array(24).fill(0),
                    dayOfWeek: new Array(7).fill(0),
                    weekOfMonth: new Array(5).fill(0),
                    month: new Array(12).fill(0),
                },
                preferredDayOfWeek: 0,
                preferredHourRange: { start: 9, end: 17 },
                salaryWeekBias: 'none',
                monthEndBias: false,
                weekendBias: 'none',
            },
            relationship: {
                preferredAction: 'reminder',
                communicationPreference: 'unknown',
                respondsToCall: false,
                respondsToReminder: false,
            },
        },
        derived: {
            liquidityWindow: { dayOfWeek: 5, startHour: 9, endHour: 17, confidence: 0 },
            riskScore: 0,
            stabilityScore: 0,
            recoveryDifficulty: 'medium',
        },
        predicted: {
            probabilityPayToday: 0,
            probabilityIgnoreReminder: 0,
            expectedCollectionAmount: 0,
        },
        confidence: { overall: 0, fields: {} },
        drift: null,
    };
}
function createEmptyBusinessProfile(tenantId) {
    return {
        tenantId,
        modelVersion: exports.CURRENT_MODEL_VERSION,
        updatedAt: new Date().toISOString(),
        customerCount: 0,
        avgRiskScore: 0,
        preferredRecoveryStyle: 'balanced',
        dashboardEngagement: 'unknown',
        snoozeRate: 0,
        callPreference: false,
        busiestCollectionDay: null,
        avgReceivableAgeDays: null,
        avgRecoveryEfficiency: null,
        avgPaymentCycleDays: null,
        reminderEffectiveness: null,
        cashflowHealth: null,
    };
}
/** @deprecated Use BusinessBehaviorProfile and createEmptyBusinessProfile */
exports.createEmptyMerchantProfile = createEmptyBusinessProfile;
//# sourceMappingURL=behavior-profile.js.map