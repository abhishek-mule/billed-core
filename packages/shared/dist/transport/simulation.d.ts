import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from './types';
export declare class SimulationAdapter implements TransportAdapter {
    readonly provider = "simulation";
    send(_channelId: string, _message: OutboundMessage): Promise<SendResult>;
    getHealth(_channelId: string): Promise<ChannelHealth>;
    connect(_channelId: string): Promise<void>;
    disconnect(_channelId: string): Promise<void>;
    handleInbound(_payload: unknown): Promise<{
        eventType: string;
        data: Record<string, unknown>;
    } | null>;
}
//# sourceMappingURL=simulation.d.ts.map