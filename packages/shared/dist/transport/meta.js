"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaAdapter = void 0;
const DEFAULT_API_VERSION = 'v25.0';
const MESSAGING_PRODUCT = 'whatsapp';
/**
 * Meta Cloud API adapter.
 *
 * Config resolution order:
 *  1. injected config (pilot mode — BillZo's own WABA, set at boot)
 *  2. injected resolver (tenant-owned path — reads messaging_channels)
 *  3. env vars (META_ACCESS_TOKEN / META_PHONE_NUMBER_ID / META_WABA_ID)
 *
 * The env fallback lets the frontend manual-send path reach the same adapter
 * implementation as the worker without a DB channel row.
 */
class MetaAdapter {
    constructor(config, resolver) {
        this.provider = 'meta';
        this.cachedTemplates = [];
        this.injectedConfig =
            config && config.accessToken && config.phoneNumberId
                ? { ...config, apiVersion: config.apiVersion || DEFAULT_API_VERSION }
                : null;
        this.resolver = resolver || null;
    }
    async initialize() {
        const cfg = await this.getConfig('meta');
        if (!cfg) {
            throw new Error('MetaAdapter.initialize: META_ACCESS_TOKEN / META_PHONE_NUMBER_ID not configured');
        }
        const res = await fetch(this.graphUrl(cfg.phoneNumberId, ''), {
            headers: { Authorization: `Bearer ${cfg.accessToken}` },
        });
        if (!res.ok && res.status !== 400) {
            const body = (await res.json().catch(() => ({})));
            const msg = body?.error?.message || `Meta graph returned ${res.status}`;
            throw new Error(`MetaAdapter.initialize: ${msg}`);
        }
        await this.loadTemplates(cfg);
        console.log('[MetaAdapter] initialize: ✓ token valid, ✓ phone reachable, ✓ templates loaded');
    }
    async loadTemplates(cfg) {
        if (!cfg.wabaId)
            return;
        const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion || DEFAULT_API_VERSION}/${cfg.wabaId}/message_templates`, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
        if (!res.ok) {
            console.warn('[MetaAdapter] initialize: could not load templates (reminders may fail):', res.status);
            return;
        }
        const data = (await res.json().catch(() => ({ data: [] })));
        this.cachedTemplates = Array.isArray(data?.data) ? data.data : [];
    }
    get cachedTemplateNames() {
        return this.cachedTemplates.map((t) => t.name);
    }
    async getConfig(channelId) {
        if (this.injectedConfig) {
            return {
                accessToken: this.injectedConfig.accessToken,
                phoneNumberId: this.injectedConfig.phoneNumberId,
                wabaId: this.injectedConfig.wabaId || '',
                apiVersion: this.injectedConfig.apiVersion || DEFAULT_API_VERSION,
            };
        }
        if (this.resolver) {
            return this.resolver(channelId);
        }
        const accessToken = process.env.META_ACCESS_TOKEN;
        const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
        if (!accessToken || !phoneNumberId)
            return null;
        return {
            accessToken,
            phoneNumberId,
            wabaId: process.env.META_WABA_ID || '',
            apiVersion: DEFAULT_API_VERSION,
        };
    }
    graphUrl(phoneNumberId, path) {
        return `https://graph.facebook.com/${DEFAULT_API_VERSION}/${phoneNumberId}${path}`;
    }
    async apiPost(config, path, body) {
        const url = this.graphUrl(config.phoneNumberId, path);
        console.log(`[MetaAdapter] POST ${url} body=${JSON.stringify(body)}`);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const rawText = await res.text();
        console.log(`[MetaAdapter] RESPONSE status=${res.status} body=${rawText}`);
        let data;
        try {
            data = JSON.parse(rawText);
        }
        catch {
            data = { raw: rawText };
        }
        if (!res.ok) {
            const err = data?.error || data;
            throw new Error(err?.message || err?.error_user_title || `Meta API error (${res.status})`);
        }
        return data;
    }
    async send(channelId, message) {
        const config = await this.getConfig(channelId);
        if (!config) {
            return { success: false, providerMessageId: null, error: 'Meta not configured for this channel', latencyMs: 0 };
        }
        const t0 = performance.now();
        try {
            const payload = {
                messaging_product: MESSAGING_PRODUCT,
                to: message.to.replace(/\D/g, ''),
            };
            if (message.document) {
                payload.type = 'document';
                payload.document = {
                    link: message.document.url,
                    filename: message.document.fileName,
                };
                if (message.document.caption)
                    payload.document.caption = message.document.caption;
            }
            else if (message.image) {
                payload.type = 'image';
                payload.image = { link: message.image.url };
                if (message.image.caption)
                    payload.image.caption = message.image.caption;
            }
            else {
                payload.type = 'text';
                payload.text = { body: message.text, preview_url: false };
            }
            const result = await this.apiPost(config, '/messages', payload);
            return {
                success: true,
                providerMessageId: result.messages?.[0]?.id || null,
                latencyMs: performance.now() - t0,
            };
        }
        catch (err) {
            return {
                success: false,
                providerMessageId: null,
                error: err.message,
                latencyMs: performance.now() - t0,
            };
        }
    }
    async getHealth(channelId) {
        const config = await this.getConfig(channelId);
        if (!config) {
            return {
                connectionState: 'disconnected',
                isConnected: false,
                lastHeartbeatAt: null,
                lastConnectedAt: null,
                deliverySuccessRate: null,
                qualityScore: null,
                latencyMs: null,
                error: 'Meta not configured',
            };
        }
        const t0 = performance.now();
        try {
            const res = await fetch(this.graphUrl(config.phoneNumberId, ''), {
                headers: { Authorization: `Bearer ${config.accessToken}` },
            });
            const ok = res.ok || res.status === 400; // 400 is ok — means endpoint exists, just needs proper args
            return {
                connectionState: ok ? 'connected' : 'degraded',
                isConnected: ok,
                lastHeartbeatAt: new Date().toISOString(),
                lastConnectedAt: null,
                deliverySuccessRate: null,
                qualityScore: null,
                latencyMs: performance.now() - t0,
                error: ok ? null : `Health check returned ${res.status}`,
            };
        }
        catch (err) {
            return {
                connectionState: 'disconnected',
                isConnected: false,
                lastHeartbeatAt: null,
                lastConnectedAt: null,
                deliverySuccessRate: null,
                qualityScore: null,
                latencyMs: performance.now() - t0,
                error: err.message,
            };
        }
    }
    async connect(_channelId) {
        // Meta Cloud API is stateless — nothing to connect
    }
    async disconnect(_channelId) {
        // Meta Cloud API is stateless — nothing to disconnect
    }
    async handleInbound(payload) {
        const body = payload;
        const status = body?.statuses?.[0];
        if (status?.id) {
            return {
                eventType: 'whatsapp.status.updated',
                data: {
                    providerMessageId: status.id,
                    recipientId: status.recipient_id,
                    status: status.status,
                    timestamp: status.timestamp,
                    errors: status.errors || null,
                },
            };
        }
        const msg = body?.messages?.[0];
        if (msg?.id) {
            return {
                eventType: 'whatsapp.message.received',
                data: {
                    messageId: msg.id,
                    from: msg.from,
                    type: msg.type,
                    text: msg.text?.body || null,
                    timestamp: msg.timestamp,
                },
            };
        }
        return null;
    }
}
exports.MetaAdapter = MetaAdapter;
//# sourceMappingURL=meta.js.map