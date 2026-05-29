export type IntentSource = 'n8n' | 'n8n_prod' | 'frappe' | 'admin' | 'worker' | 'app' | 'internal_worker' | 'provisioning_sidecar';
export interface IntentEnvelope {
    readonly intentId: string;
    readonly intentType: string;
    readonly intentVersion: number;
    readonly tenantId: string;
    readonly actor: string;
    readonly source: IntentSource;
    readonly timestamp: string;
    readonly causationId: string | null;
    readonly correlationId: string | null;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly nonce: string;
    readonly signature: string;
}
export interface AuthorityResult {
    readonly accepted: boolean;
    readonly intentId: string;
    readonly decisionId: string | null;
    readonly error?: string;
}
export interface InternalIntent {
    readonly intentType: string;
    readonly intentVersion?: number;
    readonly tenantId: string;
    readonly actor: string;
    readonly payload: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map