export interface DashboardMetric {
    name: string;
    value: number;
    updatedAt: string;
}
export interface DashboardSectionUpdate {
    type: string;
    itemCount: number;
    updatedAt: string;
}
export declare class FakeDashboardProjection {
    readonly name = "fake";
    metrics: Map<string, DashboardMetric>;
    sections: Map<string, DashboardSectionUpdate>;
    refreshCallCount: number;
    lastRefreshAt: string | null;
    updateMetric(name: string, value: number): Promise<void>;
    updateSection(type: string, itemCount: number): Promise<void>;
    refresh(): Promise<void>;
    getMetric(name: string): DashboardMetric | undefined;
    getSection(type: string): DashboardSectionUpdate | undefined;
    clear(): void;
}
//# sourceMappingURL=fake-dashboard-projection.d.ts.map