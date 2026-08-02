export function resolveQuickNav(query: string): string | null {
  const normalized = query.trim().toLowerCase()

  if (!normalized) return null

  const routes = [
    { route: '/dashboard', keywords: ['dashboard', 'home', 'overview', 'main'] },
    { route: '/invoices', keywords: ['invoice', 'invoices', 'bill', 'bills'] },
    { route: '/parties', keywords: ['customer', 'customers', 'party', 'parties', 'contact', 'contacts'] },
    { route: '/recovery', keywords: ['recovery', 'follow up', 'follow-up', 'followup', 'reminder', 'queue'] },
    { route: '/cashflow', keywords: ['cashflow', 'money', 'collections', 'dues'] },
    { route: '/pulse', keywords: ['payments', 'payment', 'pulse'] },
    { route: '/products', keywords: ['product', 'products', 'stock', 'inventory'] },
    { route: '/reports', keywords: ['report', 'reports', 'analytics', 'gst'] },
    { route: '/settings', keywords: ['settings', 'config', 'configuration', 'preferences'] },
    { route: '/pos', keywords: ['pos', 'sell', 'sale', 'create bill', 'new invoice'] },
  ]

  return routes.find(({ keywords }) => keywords.some(keyword => normalized.includes(keyword)))?.route ?? null
}
