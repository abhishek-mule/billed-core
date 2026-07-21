import type { MetaConfig, SendMessageResponse } from './types';
export declare function createMetaSender(config: MetaConfig): {
    sendTemplate(to: string, templateName: string, variables?: Record<string, string>, language?: string): Promise<SendMessageResponse>;
    sendText(to: string, body: string, previewUrl?: boolean): Promise<SendMessageResponse>;
    sendImage(to: string, link: string, caption?: string): Promise<SendMessageResponse>;
    sendDocument(to: string, link: string, filename: string, caption?: string): Promise<SendMessageResponse>;
    sendUtilityTemplate(to: string, templateName: string, variables: Record<string, string>, language?: string): Promise<SendMessageResponse>;
};
//# sourceMappingURL=send.d.ts.map