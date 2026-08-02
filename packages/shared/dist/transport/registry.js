"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportRegistry = void 0;
class TransportRegistry {
    constructor(resolveProvider) {
        this.resolveProvider = resolveProvider;
        this.adapters = new Map();
    }
    register(adapter) {
        if (this.adapters.has(adapter.provider)) {
            console.warn(`[TransportRegistry] Overriding existing adapter for provider: ${adapter.provider}`);
        }
        this.adapters.set(adapter.provider, adapter);
    }
    get(provider) {
        return this.adapters.get(provider);
    }
    getAll() {
        return Array.from(this.adapters.values());
    }
    async send(channelId, message, options) {
        let provider = options?.provider;
        if (!provider && this.resolveProvider) {
            provider = (await this.resolveProvider(channelId)) || undefined;
        }
        if (!provider) {
            return { success: false, providerMessageId: null, error: `Channel ${channelId} not found`, latencyMs: 0 };
        }
        const adapter = this.adapters.get(provider);
        if (!adapter) {
            return { success: false, providerMessageId: null, error: `No adapter registered for provider: ${provider}`, latencyMs: 0 };
        }
        return adapter.send(channelId, message);
    }
    async getHealth(channelId) {
        const provider = this.resolveProvider ? (await this.resolveProvider(channelId)) || null : null;
        if (!provider)
            return null;
        const adapter = this.adapters.get(provider);
        if (!adapter) {
            return {
                connectionState: 'disconnected',
                isConnected: false,
                lastHeartbeatAt: null,
                lastConnectedAt: null,
                deliverySuccessRate: null,
                qualityScore: null,
                latencyMs: null,
                error: `No adapter registered for provider: ${provider}`,
            };
        }
        return adapter.getHealth(channelId);
    }
}
exports.TransportRegistry = TransportRegistry;
//# sourceMappingURL=registry.js.map