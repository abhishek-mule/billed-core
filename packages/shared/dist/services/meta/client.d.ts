import type { MetaConfig, SendMessageRequest, SendMessageResponse } from './types';
export declare function createMetaClient(config: MetaConfig): {
    sendMessage(payload: SendMessageRequest): Promise<SendMessageResponse>;
    getTemplates(): Promise<{
        data: any[];
    }>;
    createTemplate(name: string, category: string, components: any[], language: string): Promise<any>;
    deleteTemplate(name: string): Promise<any>;
    registerWebhook(webhookUrl: string, verifyToken: string): Promise<any>;
};
//# sourceMappingURL=client.d.ts.map