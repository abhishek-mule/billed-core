"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorkStore = createWorkStore;
const buildTodayWork_1 = require("../work-engine/buildTodayWork");
const buildAutomationPlan_1 = require("../work-engine/buildAutomationPlan");
const buildCustomerPage_1 = require("../work-engine/buildCustomerPage");
const buildCashPosition_1 = require("../work-engine/buildCashPosition");
const buildActivity_1 = require("../work-engine/buildActivity");
const buildDashboardSections_1 = require("../work-engine/buildDashboardSections");
function createWorkStore(deps) {
    return {
        async getDashboard() {
            const [cases, events, finance, memoriesResult, upcoming] = await Promise.all([
                deps.loadQueueCases(),
                deps.loadRecentActivity(),
                deps.loadFinancialSummary(),
                deps.loadMerchantMemories ? deps.loadMerchantMemories() : Promise.resolve({ memories: [], insights: [] }),
                deps.loadUpcomingReminders ? deps.loadUpcomingReminders() : Promise.resolve([]),
            ]);
            const context = {
                now: new Date(),
                timezone: 'Asia/Kolkata',
                locale: 'en-IN',
            };
            const view = {
                work: (0, buildTodayWork_1.buildTodayWork)(cases, context),
                cash: (0, buildCashPosition_1.buildCashPosition)(finance, context),
                activity: (0, buildActivity_1.buildActivity)(events, context),
                memories: memoriesResult.memories,
                insights: memoriesResult.insights,
                automationPlan: (0, buildAutomationPlan_1.buildAutomationPlan)(cases, upcoming),
            };
            return { sections: (0, buildDashboardSections_1.buildDashboardSections)(view, context) };
        },
        async getCustomer(id) {
            const snapshot = await deps.loadCustomerSnapshot(id);
            const context = {
                now: new Date(),
                timezone: 'Asia/Kolkata',
                locale: 'en-IN',
            };
            return (0, buildCustomerPage_1.buildCustomerPage)(snapshot, context);
        },
    };
}
//# sourceMappingURL=index.js.map