export interface CaseProjection {
    case: {
        id: string;
        status: string;
        recoveryScore?: number;
        priority: string;
        outstandingAmount: number;
        overdueDays: number;
        customer: {
            id: string;
            name: string;
            phone: string;
            email: string | null;
            tier: string | null;
            gstin: string | null;
        } | null;
    };
    summary: {
        totalOutstanding: number;
        invoiceCount: number;
        oldestInvoiceDays: number;
        lastPaymentAt: string | null;
        lastContactAt: string | null;
    };
    invoices: {
        id: string;
        number: string | null;
        amount: number;
        status: string;
        dueDate: string | null;
        overdueDays: number;
    }[];
    promises: {
        id: string;
        date: string | null;
        amount: number;
        status: string;
        createdAt: string;
        note: string | null;
    }[];
    timeline: {
        id: string;
        type: string;
        title: string;
        description: string;
        timestamp: string;
        severity: string;
    }[];
    notes: {
        id: string;
        note: string;
        isPinned: boolean;
        createdAt: string;
    }[];
    recommendations: {
        nextBestAction: string;
        urgency: 'high' | 'medium' | 'low';
        reason: string;
    } | null;
    metrics: {
        reminderCount: number;
        callCount: number;
        promiseCount: number;
        promiseBrokenCount: number;
    };
    health: {
        stale: boolean;
        lastUpdated: string | null;
    };
}
//# sourceMappingURL=case-projection.d.ts.map