"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeMessageTransport = void 0;
class FakeMessageTransport {
    constructor() {
        this.name = 'fake';
        this.sent = new Map();
        this.failNext = false;
        this.simulateDelayMs = 0;
    }
    setSimulateDelay(ms) {
        this.simulateDelayMs = ms;
    }
    setFailNext(fail) {
        this.failNext = fail;
    }
    async send(message) {
        if (this.simulateDelayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.simulateDelayMs));
        }
        if (this.failNext) {
            this.failNext = false;
            const result = {
                messageId: message.id,
                status: 'failed',
                error: 'Simulated failure',
                occurredAt: new Date().toISOString(),
            };
            this.sent.set(message.id, { message, result });
            return result;
        }
        const result = {
            messageId: message.id,
            providerMessageId: `fake-${message.id}`,
            status: 'delivered',
            occurredAt: new Date().toISOString(),
        };
        this.sent.set(message.id, { message, result });
        return result;
    }
    async getStatus(messageId) {
        const entry = this.sent.get(messageId);
        return entry?.result ?? null;
    }
    getSentMessages() {
        return Array.from(this.sent.values());
    }
    getSentCount() {
        return this.sent.size;
    }
    clear() {
        this.sent.clear();
        this.failNext = false;
        this.simulateDelayMs = 0;
    }
}
exports.FakeMessageTransport = FakeMessageTransport;
//# sourceMappingURL=fake-message.js.map