import type { CustomerInvoiceInput, CustomerPaymentInput } from '../work-engine/buildCustomerView';
export interface CustomerSnapshot {
    id: string;
    name: string;
    phone?: string;
    invoices: CustomerInvoiceInput[];
    payments: CustomerPaymentInput[];
}
export type LoadCustomerSnapshot = (id: string) => Promise<CustomerSnapshot>;
//# sourceMappingURL=customer.d.ts.map