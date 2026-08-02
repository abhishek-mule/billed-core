import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth, ConnectionState } from './types';
export interface GupshupChannelConfig {
    apiKey: string;
    appName: string;
    sourceNumber: string;
}
export type GupshupConfigResolver = (channelId: string) => Promise<GupshupChannelConfig | null>;
export interface CircuitBreakerStore {
    get(key: string): Promise<string | null>;
    setex(key: string, ttlSec: number, value: string): Promise<void>;
    del(key: string): Promise<void>;
}
/**
 * Gupshup REST API adapter. Config resolution and the circuit-breaker store are
 * injected so the adapter stays free of host dependencies (DB client, Redis).
 */
export declare class GupshupAdapter implements TransportAdapter {
    readonly provider = "gupshup";
    private readonly configResolver;
    private readonly circuit;
    constructor(options?: {
        configResolver?: GupshupConfigResolver;
        circuitBreaker?: CircuitBreakerStore;
    });
    private getConfig;
    send(channelId: string, message: OutboundMessage): Promise<SendResult>;
    getHealth(channelId: string): Promise<ChannelHealth>;
    connect(_channelId: string): Promise<void>;
    disconnect(_channelId: string): Promise<void>;
    handleInbound(payload: unknown): Promise<{
        eventType: string;
        data: Record<string, unknown>;
    } | null>;
    private isCircuitOpen;
    private recordSendSuccess;
    private recordSendFailure;
}
export type { ConnectionState };
//# sourceMappingURL=gupshup.d.ts.map