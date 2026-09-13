// ============================================================
// NOTIFICATION CONTRACT — target / deep links (spec §8)
// ============================================================
// Every notification carries a target (type + id). Consumers build the
// exact BillZo screen from this map — never "send the merchant to the
// dashboard and make them hunt". Relative links are resolved to absolute
// URLs by the caller (worker prepends NEXT_PUBLIC_APP_URL; the frontend
// uses router.push).

import type { NotificationTarget, NotificationTargetType } from './types'

export const TARGET_ROUTES: Record<NotificationTargetType, (id: string | null) => string> = {
  customer: (id) => (id ? `/recovery/customer/${id}` : '/recovery'),
  case: (id) => (id ? `/recovery/case/${id}` : '/recovery'),
  invoice: (id) => (id ? `/invoices/${id}` : '/invoices'),
  payment: () => '/pulse',
  product: (id) => (id ? `/products/${id}` : '/products'),
  notification: () => '/notifications',
}

export function notificationDeepLink(target: NotificationTarget | null | undefined): string {
  if (!target) return '/dashboard'
  return TARGET_ROUTES[target.targetType](target.targetId || null)
}

export function notificationDeepLinkAbsolute(target: NotificationTarget | null | undefined, appUrl: string): string {
  return new URL(notificationDeepLink(target), appUrl).toString()
}