import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from './types';
/**
 * Resolves the provider name for a channel id. Injected by the host
 * (worker or frontend) so this package stays free of DB client imports.
 */
export type ProviderResolver = (channelId: string) => Promise<string | null>;
export declare class TransportRegistry {
    private readonly resolveProvider?;
    private adapters;
    constructor(resolveProvider?: ProviderResolver | undefined);
    register(adapter: TransportAdapter): void;
    get(provider: string): TransportAdapter | undefined;
    getAll(): TransportAdapter[];
    send(channelId: string, message: OutboundMessage, options?: {
        provider?: string;
    }): Promise<SendResult>;
    getHealth(channelId: string): Promise<ChannelHealth | null>;
}
//# sourceMappingURL=registry.d.ts.map