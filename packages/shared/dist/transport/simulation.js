"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationAdapter = void 0;
class SimulationAdapter {
    constructor() {
        this.provider = 'simulation';
    }
    async send(_channelId, _message) {
        const t0 = performance.now();
        return {
            success: true,
            providerMessageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            latencyMs: performance.now() - t0,
        };
    }
    async getHealth(_channelId) {
        return {
            connectionState: 'connected',
            isConnected: true,
            lastHeartbeatAt: new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
            deliverySuccessRate: 1,
            qualityScore: 1,
            latencyMs: 0,
            error: null,
        };
    }
    async connect(_channelId) { }
    async disconnect(_channelId) { }
    async handleInbound(_payload) {
        return null;
    }
}
exports.SimulationAdapter = SimulationAdapter;
//# sourceMappingURL=simulation.js.map