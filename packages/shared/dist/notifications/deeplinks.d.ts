import type { NotificationTarget, NotificationTargetType } from './types';
export declare const TARGET_ROUTES: Record<NotificationTargetType, (id: string | null) => string>;
export declare function notificationDeepLink(target: NotificationTarget | null | undefined): string;
export declare function notificationDeepLinkAbsolute(target: NotificationTarget | null | undefined, appUrl: string): string;
//# sourceMappingURL=deeplinks.d.ts.map