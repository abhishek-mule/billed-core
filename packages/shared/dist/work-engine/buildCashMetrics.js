"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCashMetrics = buildCashMetrics;
function buildCashMetrics(cash, context) {
    return [
        {
            label: 'Outstanding',
            value: formatAmount(cash.outstanding),
            tone: cash.outstanding > 0 ? 'negative' : 'neutral',
        },
        {
            label: 'Collected Today',
            value: formatAmount(cash.collectedToday),
            tone: cash.collectedToday > 0 ? 'positive' : 'neutral',
        },
        {
            label: 'Expected Today',
            value: formatAmount(cash.expectedToday),
            tone: 'neutral',
        },
    ];
}
function formatAmount(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}
//# sourceMappingURL=buildCashMetrics.js.map