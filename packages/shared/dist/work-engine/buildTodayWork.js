"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTodayWork = buildTodayWork;
const types_1 = require("./types");
function classifyCase(input, context) {
    if (input.nextActionType === 'review_payment') {
        return {
            severity: 'high',
            headline: `Review payment from ${input.customerName}`,
            reason: 'A payment needs your confirmation.',
            primaryAction: {
                type: 'receive_payment',
                label: 'Receive Payment',
                target: { entity: 'payment', id: input.caseId },
            },
        };
    }
    if (input.brokenPromises > 0) {
        return {
            severity: 'critical',
            headline: `Call ${input.customerName}`,
            reason: 'A payment promise was missed. A call works better than a reminder.',
            primaryAction: {
                type: 'call',
                label: 'Call',
                target: { entity: 'customer', id: input.customerId },
            },
            secondaryAction: {
                type: 'receive_payment',
                label: 'Receive Payment',
                target: { entity: 'payment', id: input.caseId },
            },
        };
    }
    if (input.ignoredReminders >= 3) {
        return {
            severity: 'critical',
            headline: `Call ${input.customerName}`,
            reason: 'Three reminders were ignored. Try a direct call.',
            primaryAction: {
                type: 'call',
                label: 'Call',
                target: { entity: 'customer', id: input.customerId },
            },
            secondaryAction: {
                type: 'send_reminder',
                label: 'Send Reminder',
                target: { entity: 'customer', id: input.customerId },
            },
        };
    }
    if (input.promiseToPayDate) {
        const due = new Date(input.promiseToPayDate);
        const today = context.now;
        today.setHours(0, 0, 0, 0);
        if (due <= today) {
            return {
                severity: 'high',
                headline: `Follow up with ${input.customerName}`,
                reason: 'Promise due today. Call if payment does not arrive.',
                primaryAction: {
                    type: 'review',
                    label: 'Review',
                    target: { entity: 'customer', id: input.customerId },
                },
                secondaryAction: {
                    type: 'call',
                    label: 'Call',
                    target: { entity: 'customer', id: input.customerId },
                },
            };
        }
        return {
            severity: 'low',
            headline: `Wait for ${input.customerName}`,
            reason: `Promised payment by ${input.promiseToPayDate}. No action needed now.`,
            primaryAction: {
                type: 'wait',
                label: 'Wait',
            },
        };
    }
    if (input.oldestOverdueDays > 0) {
        return {
            severity: 'high',
            headline: `Receive ${formatAmount(input.totalOverdue)} from ${input.customerName}`,
            reason: `${input.oldestOverdueDays} days overdue. Send a reminder.`,
            primaryAction: {
                type: 'receive_payment',
                label: 'Receive Payment',
                target: { entity: 'payment', id: input.caseId },
            },
            secondaryAction: {
                type: 'send_reminder',
                label: 'Send Reminder',
                target: { entity: 'customer', id: input.customerId },
            },
        };
    }
    return {
        severity: 'normal',
        headline: `Receive ${formatAmount(input.totalOverdue)} from ${input.customerName}`,
        reason: 'Payment is pending.',
        primaryAction: {
            type: 'receive_payment',
            label: 'Receive Payment',
            target: { entity: 'payment', id: input.caseId },
        },
        secondaryAction: {
            type: 'send_reminder',
            label: 'Send Reminder',
            target: { entity: 'customer', id: input.customerId },
        },
    };
}
function formatAmount(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}
function buildTodayWork(cases, context) {
    return cases
        .map(c => {
        const { severity, headline, reason, primaryAction, secondaryAction } = classifyCase(c, context);
        return {
            id: c.caseId,
            customerId: c.customerId,
            customerName: c.customerName,
            customerPhone: c.phone,
            headline,
            reason,
            severity,
            primaryAction,
            secondaryAction,
            moneyImpact: c.totalOverdue,
            dueAt: c.promiseToPayDate ?? undefined,
        };
    })
        .sort((a, b) => types_1.SeverityWeight[b.severity] - types_1.SeverityWeight[a.severity]);
}
//# sourceMappingURL=buildTodayWork.js.map