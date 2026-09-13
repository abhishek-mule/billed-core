export declare const NOTIFICATION_LEVELS: readonly ["critical", "attention", "info"];
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];
export declare const NOTIFICATION_CATEGORIES: readonly ["recovery", "payments", "inventory", "system"];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export declare const NOTIFICATION_TYPES: readonly ["recovery.needs_you", "recovery.promise_broken", "recovery.payment_received", "recovery.customer_replied", "payment.received", "payment.unmatched", "inventory.low_stock", "inventory.out_of_stock", "inventory.back_in_stock", "notification.test"];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export declare const NOTIFICATION_TYPE_LEVEL: Record<NotificationType, NotificationLevel>;
export declare const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory>;
export declare const NOTIFICATION_TARGET_TYPES: readonly ["customer", "case", "invoice", "payment", "product", "notification"];
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];
export interface NotificationTarget {
    targetType: NotificationTargetType;
    targetId: string | null;
}
export interface NewNotification {
    tenantId: string;
    recipientUserId?: string | null;
    type: NotificationType;
    level: NotificationLevel;
    title: string;
    body: string;
    targetType: NotificationTargetType;
    targetId: string;
    action: string;
    dedupeKey: string;
}
export interface NotificationRecord {
    id: string;
    tenantId: string;
    recipientUserId: string | null;
    type: NotificationType;
    level: NotificationLevel;
    title: string;
    body: string | null;
    targetType: NotificationTargetType;
    targetId: string | null;
    action: string;
    dedupeKey: string;
    isRead: boolean;
    createdAt: string;
}
export interface NotificationPreferences {
    pushEnabled: boolean;
    recovery: boolean;
    payments: boolean;
    inventory: boolean;
    backInStock: boolean;
    updatedAt: string | null;
}
export declare const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'updatedAt'>;
export declare function defaultNotificationPreferences(): NotificationPreferences;
export declare function shouldNotify(preferences: NotificationPreferences | null | undefined, type: NotificationType): boolean;
export declare const PRODUCT_ALERT_STATES: readonly ["NORMAL", "LOW_STOCK", "OUT_OF_STOCK"];
export type ProductAlertState = (typeof PRODUCT_ALERT_STATES)[number];
//# sourceMappingURL=types.d.ts.map