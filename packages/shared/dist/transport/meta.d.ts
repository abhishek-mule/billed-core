import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from './types';
import type { MetaConfig } from '../services/meta/types';
export type MetaConfigResolver = (channelId: string) => Promise<MetaConfig | null>;
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
export declare class MetaAdapter implements TransportAdapter {
    readonly provider = "meta";
    private readonly injectedConfig;
    private readonly resolver;
    private cachedTemplates;
    constructor(config?: MetaConfig, resolver?: MetaConfigResolver);
    initialize(): Promise<void>;
    private loadTemplates;
    get cachedTemplateNames(): string[];
    private getConfig;
    private graphUrl;
    private apiPost;
    send(channelId: string, message: OutboundMessage): Promise<SendResult>;
    getHealth(channelId: string): Promise<ChannelHealth>;
    connect(_channelId: string): Promise<void>;
    disconnect(_channelId: string): Promise<void>;
    handleInbound(payload: unknown): Promise<{
        eventType: string;
        data: Record<string, unknown>;
    } | null>;
}
//# sourceMappingURL=meta.d.ts.map