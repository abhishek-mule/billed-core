"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardView = buildDashboardView;
function buildDashboardView(input, automationPlan) {
    return {
        work: input.work,
        cash: input.cash,
        activity: input.activity,
        automationPlan: automationPlan || [],
    };
}
//# sourceMappingURL=buildDashboardView.js.map