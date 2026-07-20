import type { MetaConfig, Template } from './types';
export declare function createMetaTemplateManager(config: MetaConfig): {
    list(): Promise<Template[]>;
    findByName(name: string): Promise<Template | null>;
    getApproved(): Promise<Template[]>;
    create(name: string, category: "UTILITY" | "MARKETING" | "AUTHENTICATION", components: any[], language?: string): Promise<any>;
    remove(name: string): Promise<any>;
};
//# sourceMappingURL=templates.d.ts.map