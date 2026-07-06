"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeTimeline = void 0;
class FakeTimeline {
    constructor() {
        this.name = 'fake';
        this.events = [];
    }
    async addEvent(event) {
        this.events.push({ ...event, occurredAt: new Date().toISOString() });
    }
    getEventsForCustomer(customerId) {
        return this.events.filter(e => e.customerId === customerId);
    }
    getEventsByType(type) {
        return this.events.filter(e => e.type === type);
    }
    getEventCount() {
        return this.events.length;
    }
    clear() {
        this.events = [];
    }
}
exports.FakeTimeline = FakeTimeline;
//# sourceMappingURL=fake-timeline.js.map