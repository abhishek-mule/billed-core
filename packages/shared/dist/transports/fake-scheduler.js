"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeScheduler = void 0;
class FakeScheduler {
    constructor() {
        this.name = 'fake';
        this.jobs = new Map();
        this.autoFire = false;
    }
    setAutoFire(fire) {
        this.autoFire = fire;
    }
    async schedule(job) {
        this.jobs.set(job.id, { ...job, fired: false });
    }
    async cancel(jobId) {
        this.jobs.delete(jobId);
    }
    async list() {
        return Array.from(this.jobs.values());
    }
    async fire(jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
            return;
        this.jobs.set(jobId, { ...job, fired: true, firedAt: new Date().toISOString() });
    }
    async fireAll() {
        for (const [id] of this.jobs) {
            await this.fire(id);
        }
    }
    getPending() {
        return Array.from(this.jobs.values()).filter(j => !j.fired);
    }
    getFired() {
        return Array.from(this.jobs.values()).filter(j => j.fired);
    }
    clear() {
        this.jobs.clear();
        this.autoFire = false;
    }
}
exports.FakeScheduler = FakeScheduler;
//# sourceMappingURL=fake-scheduler.js.map