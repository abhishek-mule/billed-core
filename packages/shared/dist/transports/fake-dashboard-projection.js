"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeDashboardProjection = void 0;
class FakeDashboardProjection {
    constructor() {
        this.name = 'fake';
        this.metrics = new Map();
        this.sections = new Map();
        this.refreshCallCount = 0;
        this.lastRefreshAt = null;
    }
    async updateMetric(name, value) {
        this.metrics.set(name, { name, value, updatedAt: new Date().toISOString() });
    }
    async updateSection(type, itemCount) {
        this.sections.set(type, { type, itemCount, updatedAt: new Date().toISOString() });
    }
    async refresh() {
        this.refreshCallCount++;
        this.lastRefreshAt = new Date().toISOString();
    }
    getMetric(name) {
        return this.metrics.get(name);
    }
    getSection(type) {
        return this.sections.get(type);
    }
    clear() {
        this.metrics.clear();
        this.sections.clear();
        this.refreshCallCount = 0;
        this.lastRefreshAt = null;
    }
}
exports.FakeDashboardProjection = FakeDashboardProjection;
//# sourceMappingURL=fake-dashboard-projection.js.map