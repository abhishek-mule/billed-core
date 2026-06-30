"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorkStore = createWorkStore;
const buildTodayWork_1 = require("../work-engine/buildTodayWork");
const buildCustomerPage_1 = require("../work-engine/buildCustomerPage");
const buildCashPosition_1 = require("../work-engine/buildCashPosition");
const buildActivity_1 = require("../work-engine/buildActivity");
const buildDashboardView_1 = require("../work-engine/buildDashboardView");
const buildDashboardSections_1 = require("../work-engine/buildDashboardSections");
function createWorkStore(deps) {
    return {
        async getDashboard() {
            const [cases, events, finance] = await Promise.all([
                deps.loadQueueCases(),
                deps.loadRecentActivity(),
                deps.loadFinancialSummary(),
            ]);
            const context = {
                now: new Date(),
                timezone: 'Asia/Kolkata',
                locale: 'en-IN',
            };
            const view = (0, buildDashboardView_1.buildDashboardView)({
                work: (0, buildTodayWork_1.buildTodayWork)(cases, context),
                cash: (0, buildCashPosition_1.buildCashPosition)(finance, context),
                activity: (0, buildActivity_1.buildActivity)(events, context),
            });
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