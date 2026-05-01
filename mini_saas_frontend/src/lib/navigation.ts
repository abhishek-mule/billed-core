/**
 * Core Navigation Model for BillZo
 * Based on the principle: "Where do I go to make money, spend money, or check stock?"
 */

export interface NavSection {
  id: string
  label: string
  icon: string
  path: string
  order: number
  mobileOnly?: boolean
  subSections?: NavSubSection[]
}

export interface NavSubSection {
  id: string
  label: string
  path: string
  order: number
}

/**
 * Primary Navigation Sections
 * Ordered by frequency: Frequent → Top, Rare → Bottom
 */
export const NAVIGATION_SECTIONS: NavSection[] = [
  // 1. Dashboard (Control Center) - Most frequent
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    path: '/merchant',
    order: 1,
    subSections: []
  },
  
  // 2. Sales (Money In) - High frequency
  {
    id: 'sales',
    label: 'Sales',
    icon: 'DollarSign',
    path: '/merchant/sales',
    order: 2,
    subSections: [
      { id: 'invoices', label: 'Invoices', path: '/merchant/invoice', order: 1 },
      { id: 'estimates', label: 'Estimates', path: '/merchant/estimates', order: 2 },
      { id: 'customers', label: 'Customers', path: '/merchant/parties', order: 3 }
    ]
  },
  
  // 3. Purchases (Money Out) - CORE DIFFERENTIATOR
  {
    id: 'purchases',
    label: 'Purchases',
    icon: 'ShoppingCart',
    path: '/merchant/purchases',
    order: 3,
    subSections: [
      { id: 'purchase-orders', label: 'Purchase Orders', path: '/merchant/purchase', order: 1 },
      { id: 'scan-invoice', label: 'Scan Invoice', path: '/merchant/purchase/scan', order: 2 },
      { id: 'suppliers', label: 'Suppliers', path: '/merchant/suppliers', order: 3 }
    ]
  },
  
  // 4. Inventory (Stock Brain) - High frequency
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'Package',
    path: '/merchant/products',
    order: 4,
    subSections: [
      { id: 'products', label: 'Products', path: '/merchant/products', order: 1 },
      { id: 'stock-inward', label: 'Stock Inward', path: '/merchant/stock/inward', order: 2 },
      { id: 'stock-adjustment', label: 'Stock Adjustment', path: '/merchant/stock/adjustment', order: 3 }
    ]
  },
  
  // 5. Contacts (Unify People) - Medium frequency
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'Users',
    path: '/merchant/contacts',
    order: 5,
    subSections: [
      { id: 'all-contacts', label: 'All Contacts', path: '/merchant/contacts', order: 1 },
      { id: 'customers', label: 'Customers', path: '/merchant/parties', order: 2 },
      { id: 'suppliers', label: 'Suppliers', path: '/merchant/suppliers', order: 3 }
    ]
  },
  
  // 6. Payments - Medium frequency
  {
    id: 'payments',
    label: 'Payments',
    icon: 'CreditCard',
    path: '/merchant/payments',
    order: 6,
    subSections: [
      { id: 'receivables', label: 'Receivables', path: '/merchant/payments/receivables', order: 1 },
      { id: 'payables', label: 'Payables', path: '/merchant/payments/payables', order: 2 },
      { id: 'transactions', label: 'Transactions', path: '/merchant/payments/transactions', order: 3 }
    ]
  },
  
  // 7. Reports - Lower frequency (ONLY after data is clean)
  {
    id: 'reports',
    label: 'Reports',
    icon: 'BarChart3',
    path: '/merchant/reports',
    order: 7,
    subSections: [
      { id: 'sales-reports', label: 'Sales Reports', path: '/merchant/reports/sales', order: 1 },
      { id: 'purchase-reports', label: 'Purchase Reports', path: '/merchant/reports/purchases', order: 2 },
      { id: 'tax-reports', label: 'Tax Reports', path: '/merchant/reports/tax', order: 3 },
      { id: 'inventory-reports', label: 'Inventory Reports', path: '/merchant/reports/inventory', order: 4 }
    ]
  },
  
  // 8. Settings - Lowest frequency
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    path: '/merchant/settings',
    order: 8,
    subSections: [
      { id: 'business', label: 'Business', path: '/merchant/settings/business', order: 1 },
      { id: 'invoice', label: 'Invoice', path: '/merchant/settings/invoice', order: 2 },
      { id: 'ocr', label: 'OCR', path: '/merchant/settings/ocr', order: 3 },
      { id: 'users', label: 'Users', path: '/merchant/settings/users', order: 4 },
      { id: 'payments', label: 'Payments', path: '/merchant/settings/payments', order: 5 },
      { id: 'security', label: 'Security', path: '/merchant/settings/security', order: 6 }
    ]
  }
]

/**
 * Mobile Bottom Navigation (Max 5 items)
 * Most frequent actions that need quick access
 */
export const MOBILE_BOTTOM_NAV: NavSection[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'Home',
    path: '/merchant',
    order: 1
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: 'DollarSign',
    path: '/merchant/sales',
    order: 2
  },
  {
    id: 'purchases',
    label: 'Purchases',
    icon: 'ShoppingCart',
    path: '/merchant/purchases',
    order: 3
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'Package',
    path: '/merchant/products',
    order: 4
  },
  {
    id: 'more',
    label: 'More',
    icon: 'MoreHorizontal',
    path: '/merchant/more',
    order: 5,
    mobileOnly: true
  }
]

/**
 * More Menu Items (Mobile)
 * Items that don't fit in bottom nav
 */
export const MOBILE_MORE_MENU: NavSection[] = [
  {
    id: 'payments',
    label: 'Payments',
    icon: 'CreditCard',
    path: '/merchant/payments',
    order: 1
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'BarChart3',
    path: '/merchant/reports',
    order: 2
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'Users',
    path: '/merchant/contacts',
    order: 3
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    path: '/merchant/settings',
    order: 4
  }
]

/**
 * Critical Flows that must be seamless
 */
export const CRITICAL_FLOWS = {
  invoice: {
    path: '/merchant/sales/invoices/new',
    steps: ['Sales', 'New Invoice', 'Save', 'Send', 'Payment', 'Report']
  },
  purchase: {
    path: '/merchant/purchases/scan',
    steps: ['Purchases', 'Scan', 'Review', 'Save', 'Inventory Update', 'Report']
  },
  stock: {
    path: '/merchant/inventory/stock-inward',
    steps: ['Purchase', 'Stock Inward', 'Product Update', 'Inventory View']
  }
}

/**
 * Helper function to get navigation section by ID
 */
export function getNavSectionById(id: string): NavSection | undefined {
  return NAVIGATION_SECTIONS.find(section => section.id === id)
}

/**
 * Helper function to get sub-section by parent ID and sub-section ID
 */
export function getSubSection(parentId: string, subSectionId: string): NavSubSection | undefined {
  const parent = getNavSectionById(parentId)
  return parent?.subSections?.find(sub => sub.id === subSectionId)
}

/**
 * Helper function to get breadcrumb trail for a path
 */
export function getBreadcrumbTrail(path: string): Array<{ label: string; path: string }> {
  const trail: Array<{ label: string; path: string }> = []
  
  // Find matching section
  const section = NAVIGATION_SECTIONS.find(s => path.startsWith(s.path))
  if (section) {
    trail.push({ label: section.label, path: section.path })
    
    // Find matching sub-section
    const subSection = section.subSections?.find(s => path.startsWith(s.path))
    if (subSection) {
      trail.push({ label: subSection.label, path: subSection.path })
    }
  }
  
  return trail
}