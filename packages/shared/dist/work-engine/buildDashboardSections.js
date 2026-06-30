"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardSections = buildDashboardSections;
const buildCashMetrics_1 = require("./buildCashMetrics");
function buildDashboardSections(view, context) {
    const todaySection = {
        type: 'today',
        priority: 1,
        title: "Today's Work",
        payload: {
            items: view.work,
            empty: view.work.length === 0 ? {
                headline: "Today's work is complete",
                action: {
                    type: 'review',
                    label: 'Open Udhar',
                    target: { entity: 'customer', id: '' },
                },
            } : undefined,
        },
    };
    const cashSection = {
        type: 'cash',
        priority: 2,
        title: "Today's Cash Position",
        payload: {
            metrics: (0, buildCashMetrics_1.buildCashMetrics)(view.cash, context),
        },
    };
    const activitySection = {
        type: 'activity',
        priority: 3,
        title: 'Recent Activity',
        payload: {
            events: view.activity,
        },
        collapsible: true,
    };
    return [todaySection, cashSection, activitySection];
}
//# sourceMappingURL=buildDashboardSections.js.map