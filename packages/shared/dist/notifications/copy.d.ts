import type { NewNotification, NotificationType } from './types';
export interface NotificationCopy {
    title: string;
    body: string;
    action: string;
}
export declare function formatRupees(amount: number): string;
export type NotificationData = {
    'recovery.needs_you': {
        customerName: string;
        amount: number;
        targetId: string;
    };
    'recovery.promise_broken': {
        customerName: string;
        amount: number;
        targetId: string;
    };
    'recovery.payment_received': {
        customerName: string;
        amount: number;
        targetId: string;
    };
    'recovery.customer_replied': {
        customerName: string;
        targetId: string;
    };
    'payment.received': {
        customerName: string;
        amount: number;
        invoiceNumber?: string;
        targetId: string;
    };
    'payment.unmatched': {
        amount: number;
        targetId: string;
    };
    'inventory.low_stock': {
        productName: string;
        stock: number;
        threshold: number;
        targetId: string;
    };
    'inventory.out_of_stock': {
        productName: string;
        targetId: string;
    };
    'inventory.back_in_stock': {
        productName: string;
        stock: number;
        targetId: string;
    };
    'notification.test': {
        title: string;
        body: string;
        targetId: string;
    };
};
export interface BuildNotificationInput<T extends NotificationType> {
    type: T;
    data: NotificationData[T];
    tenantId: string;
    recipientUserId?: string | null;
    /** Override the deterministic default dedupe key (event-sourced or cycle-scoped alerts). */
    dedupeKey?: string;
}
export declare function buildNotification<T extends NotificationType>(input: BuildNotificationInput<T>): NewNotification;
//# sourceMappingURL=copy.d.ts.map