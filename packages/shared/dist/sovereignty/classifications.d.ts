export type SovereigntyCriticality = 'transport' | 'behavioral' | 'operational' | 'financial' | 'regulatory';
export type SovereigntyScope = 'tenant_local' | 'cross_tenant' | 'global';
export type GovernanceState = 'governed' | 'exempt' | 'deferred-authoritative';
export type JustificationCode = 'derived_state' | 'append_only_observability' | 'event_transport' | 'offline_sync_debt' | 'bootstrap_import' | 'idempotency_guard' | 'notification_routing' | 'ephemeral_operational_state';
export type SourceOfTruth = 'authority' | 'projection' | 'analytics' | 'transport' | 'client_sync' | 'bootstrap';
export type InventoryReversibility = 'reversible' | 'append_only' | 'irreversible';
export type InventoryOperation = 'insert' | 'update' | 'delete' | 'upsert' | 'rpc';
export interface MutationInventoryEntry {
    readonly table: string;
    readonly mutationPath: string;
    readonly lineNumber: number;
    readonly operation: InventoryOperation;
    readonly governance: GovernanceState;
    readonly intentType?: string;
    readonly justificationCode: JustificationCode;
    readonly reversibility: InventoryReversibility;
    readonly criticality: SovereigntyCriticality;
    readonly scope: SovereigntyScope;
    readonly sourceOfTruth: SourceOfTruth;
}
export interface CriticalityOverride {
    readonly capabilityId: string;
    readonly overrideCriticality: SovereigntyCriticality;
    readonly overrideScope: SovereigntyScope;
    readonly justificationCode: JustificationCode;
}
//# sourceMappingURL=classifications.d.ts.map