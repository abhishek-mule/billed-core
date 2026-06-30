"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTimeline = buildTimeline;
function buildTimeline(events) {
    return events
        .map(e => ({
        date: e.occurredAt,
        type: e.type,
        label: e.label,
        detail: e.detail,
        amount: e.amount,
    }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
//# sourceMappingURL=buildTimeline.js.map