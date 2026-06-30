"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_1 = require("./index");
function mockDeps(overrides) {
    const defaults = buildMocks();
    return {
        loadQueueCases: overrides?.loadQueueCases ?? defaults.loadQueueCases,
        loadRecentActivity: overrides?.loadRecentActivity ?? defaults.loadRecentActivity,
        loadFinancialSummary: overrides?.loadFinancialSummary ?? defaults.loadFinancialSummary,
        loadCustomerSnapshot: overrides?.loadCustomerSnapshot ?? defaults.loadCustomerSnapshot,
    };
}
function buildMocks() {
    return {
        loadQueueCases: async () => [
            {
                caseId: 'c1',
                customerId: 'cust-1',
                customerName: 'Ankit',
                phone: '+919876543210',
                totalOverdue: 15000,
                oldestOverdueDays: 5,
                nextActionType: 'send_reminder',
                promiseToPayDate: null,
                ignoredReminders: 0,
                brokenPromises: 0,
            },
        ],
        loadRecentActivity: async () => [
            { occurredAt: '2026-06-30T10:00:00Z', eventType: 'payment_received', customerName: 'Ankit', amount: 5000 },
        ],
        loadFinancialSummary: async () => ({
            outstanding: 15000,
            collectedToday: 5000,
            dueToday: 15000,
            customerCount: 1,
        }),
        loadCustomerSnapshot: async (id) => ({
            id,
            name: 'Ankit',
            phone: '+919876543210',
            invoices: [
                { id: 'inv-1', total: 15000, paidAmount: 0, status: 'unpaid', createdAt: '2026-06-25T00:00:00Z', dueAt: '2026-07-05T00:00:00Z' },
            ],
            payments: [],
        }),
    };
}
function isTodaySection(section) {
    return section.type === 'today';
}
function isCashSection(section) {
    return section.type === 'cash';
}
function isActivitySection(section) {
    return section.type === 'activity';
}
function getTodaySection(sections) {
    return sections.find(isTodaySection);
}
function getCashSection(sections) {
    return sections.find(isCashSection);
}
function getActivitySection(sections) {
    return sections.find(isActivitySection);
}
(0, vitest_1.describe)('WorkStore', () => {
    (0, vitest_1.describe)('getDashboard', () => {
        (0, vitest_1.it)('returns sections with today, cash, and activity', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const { sections } = await store.getDashboard();
            const todaySection = getTodaySection(sections);
            const cashSection = getCashSection(sections);
            const activitySection = getActivitySection(sections);
            (0, vitest_1.expect)(todaySection).toBeDefined();
            (0, vitest_1.expect)(cashSection).toBeDefined();
            (0, vitest_1.expect)(activitySection).toBeDefined();
        });
        (0, vitest_1.it)('builds work items in today section from queue cases', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const { sections } = await store.getDashboard();
            const todaySection = getTodaySection(sections);
            (0, vitest_1.expect)(todaySection?.payload.items).toHaveLength(1);
            (0, vitest_1.expect)(todaySection?.payload.items[0].customerName).toBe('Ankit');
            (0, vitest_1.expect)(todaySection?.payload.items[0].moneyImpact).toBe(15000);
        });
        (0, vitest_1.it)('builds cash position in cash section from financial summary', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const { sections } = await store.getDashboard();
            const cashSection = getCashSection(sections);
            (0, vitest_1.expect)(cashSection?.payload.metrics).toHaveLength(3);
            const outstanding = cashSection?.payload.metrics.find(m => m.label === 'Outstanding');
            const collectedToday = cashSection?.payload.metrics.find(m => m.label === 'Collected Today');
            const expectedToday = cashSection?.payload.metrics.find(m => m.label === 'Expected Today');
            (0, vitest_1.expect)(outstanding?.value).toContain('15,000');
            (0, vitest_1.expect)(collectedToday?.value).toContain('5,000');
            (0, vitest_1.expect)(expectedToday?.value).toContain('15,000');
        });
        (0, vitest_1.it)('builds activity in activity section from recent events', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const { sections } = await store.getDashboard();
            const activitySection = getActivitySection(sections);
            (0, vitest_1.expect)(activitySection?.payload.events).toHaveLength(1);
            (0, vitest_1.expect)(activitySection?.payload.events[0].label).toContain('payment received');
        });
        (0, vitest_1.it)('returns empty today section when no queue cases', async () => {
            const deps = mockDeps({
                loadQueueCases: async () => [],
            });
            const store = (0, index_1.createWorkStore)(deps);
            const { sections } = await store.getDashboard();
            const todaySection = getTodaySection(sections);
            (0, vitest_1.expect)(todaySection?.payload.items).toHaveLength(0);
            (0, vitest_1.expect)(todaySection?.payload.empty).toBeDefined();
            (0, vitest_1.expect)(todaySection?.payload.empty?.headline).toBe("Today's work is complete");
            const cashSection = getCashSection(sections);
            (0, vitest_1.expect)(cashSection?.payload.metrics).toHaveLength(3);
            const activitySection = getActivitySection(sections);
            (0, vitest_1.expect)(activitySection?.payload.events).toHaveLength(1);
        });
        (0, vitest_1.it)('returns empty activity section when no recent events', async () => {
            const deps = mockDeps({
                loadRecentActivity: async () => [],
            });
            const store = (0, index_1.createWorkStore)(deps);
            const { sections } = await store.getDashboard();
            const todaySection = getTodaySection(sections);
            (0, vitest_1.expect)(todaySection?.payload.items).toHaveLength(1);
            const activitySection = getActivitySection(sections);
            (0, vitest_1.expect)(activitySection?.payload.events).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)('getCustomer', () => {
        (0, vitest_1.it)('returns a CustomerPageView for the given id', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const result = await store.getCustomer('cust-1');
            (0, vitest_1.expect)(result).toHaveProperty('header');
            (0, vitest_1.expect)(result).toHaveProperty('money');
            (0, vitest_1.expect)(result).toHaveProperty('actions');
            (0, vitest_1.expect)(result).toHaveProperty('evidence');
        });
        (0, vitest_1.it)('includes customer name in the header', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const result = await store.getCustomer('cust-1');
            (0, vitest_1.expect)(result.header.name).toBe('Ankit');
        });
        (0, vitest_1.it)('calculates outstanding from invoices', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const result = await store.getCustomer('cust-1');
            (0, vitest_1.expect)(result.money.outstanding).toBe(15000);
        });
        (0, vitest_1.it)('includes invoices in evidence', async () => {
            const store = (0, index_1.createWorkStore)(mockDeps());
            const result = await store.getCustomer('cust-1');
            (0, vitest_1.expect)(result.evidence.invoices).toHaveLength(1);
            (0, vitest_1.expect)(result.evidence.invoices[0].total).toBe(15000);
        });
        (0, vitest_1.it)('returns empty arrays for customers with no data', async () => {
            const deps = mockDeps({
                loadCustomerSnapshot: async (id) => ({
                    id,
                    name: 'Empty Customer',
                    invoices: [],
                    payments: [],
                }),
            });
            const store = (0, index_1.createWorkStore)(deps);
            const result = await store.getCustomer('empty');
            (0, vitest_1.expect)(result.money.outstanding).toBe(0);
            (0, vitest_1.expect)(result.money.lifetimePurchases).toBe(0);
            (0, vitest_1.expect)(result.evidence.invoices).toHaveLength(0);
            (0, vitest_1.expect)(result.evidence.payments).toHaveLength(0);
            (0, vitest_1.expect)(result.actions).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=index.test.js.map