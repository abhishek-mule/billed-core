"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outstanding = outstanding;
exports.workQueueCount = workQueueCount;
exports.timelineEventCount = timelineEventCount;
exports.timelineContains = timelineContains;
exports.reminderCount = reminderCount;
exports.messagesSent = messagesSent;
exports.recoveryStatus = recoveryStatus;
exports.nextAction = nextAction;
exports.cashMetric = cashMetric;
exports.brokenPromises = brokenPromises;
exports.workerEventsProcessed = workerEventsProcessed;
exports.dashboardRefreshed = dashboardRefreshed;
exports.noErrorState = noErrorState;
function fail(message) {
    throw new Error(message);
}
function outstanding(customerName, expected) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `"${customerName}" outstanding = ₹${expected}`,
        check: async (h) => {
            const case_ = h.recovery.getCase(caseId);
            if (!case_)
                fail(`No recovery case for ${customerName}`);
            if (case_.totalOverdue !== expected) {
                fail(`Expected ${customerName} outstanding ₹${expected}, got ₹${case_.totalOverdue}`);
            }
        },
    };
}
function workQueueCount(expected) {
    return {
        label: `Work queue has ${expected} item(s)`,
        check: async (h) => {
            const today = h.dashboard.getSection('today');
            const count = today?.itemCount ?? 0;
            if (count !== expected) {
                fail(`Expected ${expected} work items in dashboard, got ${count}`);
            }
        },
    };
}
function timelineEventCount(expected) {
    return {
        label: `Timeline has ${expected} event(s)`,
        check: async (h) => {
            const count = h.timeline.getEventCount();
            if (count !== expected) {
                fail(`Expected ${expected} timeline events, got ${count}`);
            }
        },
    };
}
function timelineContains(text) {
    return {
        label: `Timeline contains "${text}"`,
        check: async (h) => {
            const events = h.timeline.events;
            const found = events.some(e => e.type.toLowerCase().includes(text.toLowerCase()) ||
                JSON.stringify(e.payload).toLowerCase().includes(text.toLowerCase()));
            if (!found) {
                fail(`Timeline does not contain "${text}". Events: ${events.map(e => e.type).join(', ')}`);
            }
        },
    };
}
function reminderCount(customerName, expected) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `"${customerName}" has ${expected} reminder(s)`,
        check: async (h) => {
            const case_ = h.recovery.getCase(caseId);
            if (!case_)
                fail(`No recovery case for ${customerName}`);
            if (case_.ignoredReminders !== expected) {
                fail(`Expected ${expected} reminders for ${customerName}, got ${case_.ignoredReminders}`);
            }
        },
    };
}
function messagesSent(expected) {
    return {
        label: `${expected} message(s) sent`,
        check: async (h) => {
            const count = h.message.getSentCount();
            if (count !== expected) {
                fail(`Expected ${expected} messages sent, got ${count}`);
            }
        },
    };
}
function recoveryStatus(customerName, status) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `"${customerName}" recovery status = "${status}"`,
        check: async (h) => {
            const case_ = h.recovery.getCase(caseId);
            if (!case_)
                fail(`No recovery case for ${customerName}`);
            if (case_.status !== status) {
                fail(`Expected ${customerName} recovery status "${status}", got "${case_.status}"`);
            }
        },
    };
}
function nextAction(customerName, action) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `"${customerName}" next action = "${action}"`,
        check: async (h) => {
            const case_ = h.recovery.getCase(caseId);
            if (!case_)
                fail(`No recovery case for ${customerName}`);
            const normalized = case_.nextActionType.toLowerCase();
            if (!normalized.includes(action.toLowerCase())) {
                fail(`Expected ${customerName} next action to include "${action}", got "${case_.nextActionType}"`);
            }
        },
    };
}
function cashMetric(name, expected) {
    return {
        label: `Cash metric "${name}" = ₹${expected}`,
        check: async (h) => {
            const metric = h.dashboard.getMetric(name);
            if (!metric)
                fail(`No cash metric "${name}"`);
            if (metric.value !== expected) {
                fail(`Expected cash metric "${name}" = ₹${expected}, got ₹${metric.value}`);
            }
        },
    };
}
function brokenPromises(customerName, expected) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `"${customerName}" has ${expected} broken promise(s)`,
        check: async (h) => {
            const case_ = h.recovery.getCase(caseId);
            if (!case_)
                fail(`No recovery case for ${customerName}`);
            if (case_.brokenPromises !== expected) {
                fail(`Expected ${expected} broken promises for ${customerName}, got ${case_.brokenPromises}`);
            }
        },
    };
}
function workerEventsProcessed(expected) {
    return {
        label: `Worker processed ${expected} event(s)`,
        check: async (h) => {
            const count = h.worker.getProcessedCount();
            if (count !== expected) {
                fail(`Worker processed ${count} events, expected ${expected}`);
            }
        },
    };
}
function dashboardRefreshed(expected) {
    return {
        label: `Dashboard refreshed ${expected} time(s)`,
        check: async (h) => {
            const count = h.dashboard.refreshCallCount;
            if (count !== expected) {
                fail(`Dashboard refreshed ${count} times, expected ${expected}`);
            }
        },
    };
}
function noErrorState() {
    return {
        label: 'No dead letters or failures',
        check: async (h) => {
            const deadLetters = h.outbox.getEvents().filter(e => e.status === 'dead_letter');
            if (deadLetters.length > 0) {
                fail(`${deadLetters.length} dead letter(s) found: ${deadLetters.map(e => e.id).join(', ')}`);
            }
            const failures = h.worker.getFailureCount();
            if (failures > 0) {
                fail(`${failures} worker failure(s)`);
            }
        },
    };
}
//# sourceMappingURL=expectations.js.map