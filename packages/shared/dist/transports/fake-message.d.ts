import type { MessageTransport, Message, MessageResult } from './message';
export declare class FakeMessageTransport implements MessageTransport {
    readonly name = "fake";
    private sent;
    private failNext;
    private simulateDelayMs;
    setSimulateDelay(ms: number): void;
    setFailNext(fail: boolean): void;
    send(message: Message): Promise<MessageResult>;
    getStatus(messageId: string): Promise<MessageResult | null>;
    getSentMessages(): {
        message: Message;
        result: MessageResult;
    }[];
    getSentCount(): number;
    clear(): void;
}
//# sourceMappingURL=fake-message.d.ts.map