"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeOutboxPublisher = void 0;
const ids_1 = require("../utils/ids");
class FakeOutboxPublisher {
    constructor() {
        this.name = 'fake';
        this.events = new Map();
        this.failNext = false;
    }
    setFailNext(fail) {
        this.failNext = fail;
    }
    async publish(event) {
        if (this.failNext) {
            this.failNext = false;
            throw new Error('Simulated outbox publish failure');
        }
        const id = event.id || (0, ids_1.generateId)();
        const outboxEvent = {
            ...event,
            id,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        this.events.set(id, outboxEvent);
        return id;
    }
    async getStatus(eventId) {
        return this.events.get(eventId) ?? null;
    }
    markProcessed(eventId, status) {
        const event = this.events.get(eventId);
        if (event) {
            this.events.set(eventId, { ...event, status, processedAt: new Date().toISOString() });
        }
    }
    getEvents() {
        return Array.from(this.events.values());
    }
    getPending() {
        return this.getEvents().filter(e => e.status === 'pending');
    }
    clear() {
        this.events.clear();
        this.failNext = false;
    }
}
exports.FakeOutboxPublisher = FakeOutboxPublisher;
//# sourceMappingURL=fake-outbox.js.map