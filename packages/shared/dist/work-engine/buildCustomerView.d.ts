import type { CustomerView, WorkContext } from './types';
export interface CustomerInvoiceInput {
    id: string;
    invoiceNumber?: string;
    total: number;
    paidAmount: number;
    status: string;
    dueAt?: string;
    createdAt: string;
}
export interface CustomerPaymentInput {
    id: string;
    amount: number;
    method?: string;
    createdAt: string;
}
export interface CustomerData {
    id: string;
    name: string;
    phone?: string;
    invoices: CustomerInvoiceInput[];
    payments: CustomerPaymentInput[];
    lastActivityAt?: string;
}
export declare function buildCustomerView(data: CustomerData, context: WorkContext): CustomerView;
//# sourceMappingURL=buildCustomerView.d.ts.map