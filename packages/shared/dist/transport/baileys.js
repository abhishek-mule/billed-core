"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaileysAdapter = void 0;
/**
 * Baileys (WhatsApp Web protocol) adapter. The socket host and tenant resolver
 * are injected so the adapter stays free of host dependencies.
 */
class BaileysAdapter {
    constructor(socket, resolveTenant, options) {
        this.provider = 'baileys';
        this.socket = socket;
        this.resolveTenant = resolveTenant;
        this.maxRetries = options?.maxRetries ?? 12;
        this.retryDelayMs = options?.retryDelayMs ?? 2000;
    }
    async getTenant(channelId) {
        return this.resolveTenant(channelId);
    }
    async send(channelId, message) {
        const tenantId = await this.getTenant(channelId);
        if (!tenantId) {
            return { success: false, providerMessageId: null, error: 'Channel not found', latencyMs: 0 };
        }
        const t0 = performance.now();
        const phone = message.to.replace(/\D/g, '');
        const maxRetries = this.maxRetries;
        const retryDelayMs = this.retryDelayMs;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                let result;
                if (message.document) {
                    result = await this.socket.sendBaileysDocument(tenantId, phone, message.document.url, message.document.fileName, message.document.caption);
                }
                else if (message.image) {
                    result = await this.socket.sendBaileysImage(tenantId, phone, message.image.url, message.image.caption);
                }
                else {
                    result = await this.socket.sendViaBaileys(tenantId, phone, message.text);
                }
                return { success: true, providerMessageId: result.messageId, latencyMs: performance.now() - t0 };
            }
            catch (err) {
                const isDisconnected = err.message?.includes('not connected');
                if (!isDisconnected) {
                    return { success: false, providerMessageId: null, error: err.message, latencyMs: performance.now() - t0 };
                }
                if (attempt === maxRetries) {
                    return { success: false, providerMessageId: null, error: 'Baileys not connected after retries', latencyMs: performance.now() - t0 };
                }
                console.log(`[BaileysAdapter] Socket not connected (attempt ${attempt}/${maxRetries}), waiting ${retryDelayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
        return { success: false, providerMessageId: null, error: 'Baileys not connected after retries', latencyMs: performance.now() - t0 };
    }
    async getHealth(channelId) {
        const tenantId = await this.getTenant(channelId);
        if (!tenantId) {
            return {
                connectionState: 'disconnected',
                isConnected: false,
                lastHeartbeatAt: null,
                lastConnectedAt: null,
                deliverySuccessRate: null,
                qualityScore: null,
                latencyMs: null,
                error: 'Channel not found',
            };
        }
        const isConnected = this.socket.isBaileysConnected(tenantId);
        const state = await this.socket.getBaileysState(tenantId);
        if (state) {
            return {
                connectionState: state.connectionState || (isConnected ? 'connected' : 'disconnected'),
                isConnected: isConnected,
                lastHeartbeatAt: state.lastHeartbeatAt ?? null,
                lastConnectedAt: state.lastConnectedAt ?? null,
                deliverySuccessRate: state.deliverySuccessRate ?? null,
                qualityScore: null,
                latencyMs: null,
                error: state.error ?? null,
            };
        }
        return {
            connectionState: isConnected ? 'connected' : 'disconnected',
            isConnected,
            lastHeartbeatAt: null,
            lastConnectedAt: null,
            deliverySuccessRate: null,
            qualityScore: null,
            latencyMs: null,
            error: null,
        };
    }
    async connect(channelId) {
        const tenantId = await this.getTenant(channelId);
        if (!tenantId)
            return;
        await this.socket.startBaileysSocket(tenantId);
    }
    async disconnect(channelId) {
        const tenantId = await this.getTenant(channelId);
        if (!tenantId)
            return;
        await this.socket.disconnectBaileys(tenantId);
    }
    async handleInbound(_payload) {
        // Baileys inbound processing is handled by the socket event listener
        return null;
    }
}
exports.BaileysAdapter = BaileysAdapter;
//# sourceMappingURL=baileys.js.map