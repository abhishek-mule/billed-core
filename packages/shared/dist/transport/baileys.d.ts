import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth, ConnectionState } from './types';
export interface BaileysSocketHost {
    sendViaBaileys(tenantId: string, phone: string, text: string): Promise<{
        messageId: string;
    }>;
    sendBaileysDocument(tenantId: string, phone: string, url: string, fileName: string, caption?: string): Promise<{
        messageId: string;
    }>;
    sendBaileysImage(tenantId: string, phone: string, url: string, caption?: string): Promise<{
        messageId: string;
    }>;
    isBaileysConnected(tenantId: string): boolean;
    getBaileysState(tenantId: string): Promise<{
        connectionState?: ConnectionState;
        lastHeartbeatAt?: string | null;
        lastConnectedAt?: string | null;
        deliverySuccessRate?: number | null;
        error?: string | null;
    } | null>;
    startBaileysSocket(tenantId: string): Promise<void>;
    disconnectBaileys(tenantId: string): Promise<void>;
}
export type BaileysTenantResolver = (channelId: string) => Promise<string | null>;
/**
 * Baileys (WhatsApp Web protocol) adapter. The socket host and tenant resolver
 * are injected so the adapter stays free of host dependencies.
 */
export declare class BaileysAdapter implements TransportAdapter {
    readonly provider = "baileys";
    private readonly socket;
    private readonly resolveTenant;
    private readonly maxRetries;
    private readonly retryDelayMs;
    constructor(socket: BaileysSocketHost, resolveTenant: BaileysTenantResolver, options?: {
        maxRetries?: number;
        retryDelayMs?: number;
    });
    private getTenant;
    send(channelId: string, message: OutboundMessage): Promise<SendResult>;
    getHealth(channelId: string): Promise<ChannelHealth>;
    connect(channelId: string): Promise<void>;
    disconnect(channelId: string): Promise<void>;
    handleInbound(_payload: unknown): Promise<{
        eventType: string;
        data: Record<string, unknown>;
    } | null>;
}
//# sourceMappingURL=baileys.d.ts.map