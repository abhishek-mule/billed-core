export interface FakeRecoveryCase {
    caseId: string;
    customerId: string;
    tenantId: string;
    totalOverdue: number;
    status: 'active' | 'recovered' | 'closed';
    nextActionType: string;
    brokenPromises: number;
    ignoredReminders: number;
    automationMode: string;
    updatedAt: string;
}
export declare class FakeRecoveryProjection {
    readonly name = "fake";
    cases: Map<string, FakeRecoveryCase>;
    updateCallCount: number;
    createCase(c: FakeRecoveryCase): Promise<void>;
    updateCase(caseId: string, update: Partial<FakeRecoveryCase>): Promise<void>;
    getCase(caseId: string): FakeRecoveryCase | undefined;
    getAllCases(): FakeRecoveryCase[];
    clear(): void;
}
//# sourceMappingURL=fake-recovery-projection.d.ts.map