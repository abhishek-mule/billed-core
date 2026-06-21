// ============================================================
// Audit Types - Financial Truth Reconstruction
// ============================================================

export interface FinancialEvent {
  type: string;
  id: string;
  occurredAt: string;
  invoiceId: string;
  customerId: string;
  tenantId: string;
  amount?: number;
  status?: string;
  dueDate?: string;
  adjustmentType?: 'credit' | 'debit';
  adjustmentAmount?: number;
  reversalAmount?: number;
  rawPayload: Record<string, unknown>;
}

export interface InvoiceTraceStep {
  eventIndex: number;
  eventType: string;
  eventId: string;
  occurredAt: string;
  before: FinancialSnapshot;
  event: FinancialEvent;
  after: FinancialSnapshot;
  invariant: {
    check: string;
    passed: boolean;
    expected: number;
    actual: number;
  };
}

export interface FinancialSnapshot {
  invoiceAmount: number;
  totalPaid: number;
  totalReversed: number;
  totalAdjusted: number;
  outstanding: number;
  status: string;
}

export interface TraceResult {
  invoiceId: string;
  tenantId: string;
  customerId: string;
  invoiceNumber?: string;
  steps: InvoiceTraceStep[];
  currentState: {
    triggerOutstanding: number;
    reducerOutstanding: number;
    recoveryCaseOutstanding: number | null;
  };
  drift: number;
  driftDetected: boolean;
  summary: {
    totalEvents: number;
    financialEvents: number;
    invariantViolations: number;
  };
}

export interface AuditDrift {
  invoiceId: string;
  invoiceNumber?: string;
  triggerOutstanding: number;
  reducerOutstanding: number;
  recoveryCaseOutstanding: number | null;
  drift: number;
  reason: string;
  severity: 'critical' | 'warning';
}

export interface AuditResult {
  tenantId: string;
  scannedAt: string;
  totalInvoices: number;
  driftCount: number;
  drifts: AuditDrift[];
}

export interface RebuildPlan {
  tenantId: string;
  invoicesToFix: {
    invoiceId: string;
    field: string;
    oldValue: number;
    newValue: number;
  }[];
  recoveryCasesToFix: {
    caseId: string;
    field: string;
    oldValue: number;
    newValue: number;
  }[];
}

export interface RebuildResult {
  tenantId: string;
  appliedAt: string;
  invoicesFixed: number;
  recoveryCasesFixed: number;
  auditLogEntries: number;
}