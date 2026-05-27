export type CohortAssignmentStrategy = 'random' | 'time_bucketed' | 'customer_property';
export type ExperimentTreatment = 'intervention' | 'control' | 'delayed';
export interface CohortDefinition {
    id: string;
    tenantId: string;
    name: string;
    assignmentStrategy: CohortAssignmentStrategy;
    controlFraction: number;
    startDate: string;
    endDate?: string;
}
export interface ExperimentAssignment {
    cohortId: string;
    customerId: string;
    tenantId: string;
    treatment: ExperimentTreatment;
    assignedAt: string;
    assignmentFactor: number;
}
export interface BaselineEstimate {
    metric: string;
    baseRate: number;
    sampleSize: number;
    confidence: number;
}
//# sourceMappingURL=counterfactual-types.d.ts.map