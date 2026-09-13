"use strict";
// ============================================================
// NOTIFICATION CONTRACT — target / deep links (spec §8)
// ============================================================
// Every notification carries a target (type + id). Consumers build the
// exact BillZo screen from this map — never "send the merchant to the
// dashboard and make them hunt". Relative links are resolved to absolute
// URLs by the caller (worker prepends NEXT_PUBLIC_APP_URL; the frontend
// uses router.push).
Object.defineProperty(exports, "__esModule", { value: true });
exports.TARGET_ROUTES = void 0;
exports.notificationDeepLink = notificationDeepLink;
exports.notificationDeepLinkAbsolute = notificationDeepLinkAbsolute;
exports.TARGET_ROUTES = {
    customer: (id) => (id ? `/recovery/customer/${id}` : '/recovery'),
    case: (id) => (id ? `/recovery/case/${id}` : '/recovery'),
    invoice: (id) => (id ? `/invoices/${id}` : '/invoices'),
    payment: () => '/pulse',
    product: (id) => (id ? `/products/${id}` : '/products'),
    notification: () => '/notifications',
};
function notificationDeepLink(target) {
    if (!target)
        return '/dashboard';
    return exports.TARGET_ROUTES[target.targetType](target.targetId || null);
}
function notificationDeepLinkAbsolute(target, appUrl) {
    return new URL(notificationDeepLink(target), appUrl).toString();
}
//# sourceMappingURL=deeplinks.js.map