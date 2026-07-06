"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeRecoveryProjection = void 0;
class FakeRecoveryProjection {
    constructor() {
        this.name = 'fake';
        this.cases = new Map();
        this.updateCallCount = 0;
    }
    async createCase(c) {
        this.cases.set(c.caseId, { ...c });
    }
    async updateCase(caseId, update) {
        this.updateCallCount++;
        const existing = this.cases.get(caseId);
        if (!existing)
            throw new Error(`Recovery case ${caseId} not found`);
        this.cases.set(caseId, { ...existing, ...update, updatedAt: new Date().toISOString() });
    }
    getCase(caseId) {
        return this.cases.get(caseId);
    }
    getAllCases() {
        return Array.from(this.cases.values());
    }
    clear() {
        this.cases.clear();
        this.updateCallCount = 0;
    }
}
exports.FakeRecoveryProjection = FakeRecoveryProjection;
//# sourceMappingURL=fake-recovery-projection.js.map