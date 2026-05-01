/**
 * Role Permissions System
 * Defines permissions for different user roles in the system
 */

export type UserRole = 'owner' | 'manager' | 'cashier' | 'warehouse' | 'accountant' | 'auditor'

export type Permission =
  | 'createInvoice'
  | 'editInvoice'
  | 'deleteInvoice'
  | 'viewInvoice'
  | 'createCustomer'
  | 'editCustomer'
  | 'deleteCustomer'
  | 'viewCustomer'
  | 'setCreditLimits'
  | 'createProduct'
  | 'editProduct'
  | 'deleteProduct'
  | 'viewProduct'
  | 'editStock'
  | 'createPayment'
  | 'deletePayment'
  | 'viewPayment'
  | 'reconcilePayments'
  | 'viewReports'
  | 'exportReports'
  | 'manageUsers'
  | 'manageSettings'
  | 'viewSettings'
  | 'viewAuditLogs'
  | 'sendReminders'
  | 'accessPOS'
  | 'processRefunds'

/**
 * Role permissions matrix
 * Defines what each role can do
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    // Full access to everything
    'createInvoice', 'editInvoice', 'deleteInvoice', 'viewInvoice',
    'createCustomer', 'editCustomer', 'deleteCustomer', 'viewCustomer', 'setCreditLimits',
    'createProduct', 'editProduct', 'deleteProduct', 'viewProduct', 'editStock',
    'createPayment', 'deletePayment', 'viewPayment', 'reconcilePayments',
    'viewReports', 'exportReports',
    'manageUsers', 'manageSettings', 'viewSettings',
    'viewAuditLogs', 'sendReminders',
    'accessPOS', 'processRefunds'
  ],

  manager: [
    // Operational management
    'createInvoice', 'editInvoice', 'viewInvoice',
    'createCustomer', 'editCustomer', 'viewCustomer', 'setCreditLimits',
    'createProduct', 'editProduct', 'viewProduct', 'editStock',
    'createPayment', 'viewPayment',
    'viewReports', 'exportReports',
    'viewSettings',
    'viewAuditLogs', 'sendReminders',
    'accessPOS', 'processRefunds'
  ],

  cashier: [
    // Front-line staff - focused on billing
    'createInvoice', 'viewInvoice',
    'createCustomer', 'viewCustomer',
    'viewProduct',
    'createPayment', 'viewPayment',
    'viewReports',
    'viewSettings',
    'accessPOS'
  ],

  warehouse: [
    // Stock management
    'viewInvoice',
    'viewProduct', 'editStock',
    'viewReports',
    'viewSettings'
  ],

  accountant: [
    // Financial management
    'createInvoice', 'editInvoice', 'deleteInvoice', 'viewInvoice',
    'createCustomer', 'editCustomer', 'deleteCustomer', 'viewCustomer',
    'createProduct', 'editProduct', 'deleteProduct', 'viewProduct',
    'createPayment', 'deletePayment', 'viewPayment', 'reconcilePayments',
    'viewReports', 'exportReports',
    'viewSettings',
    'viewAuditLogs'
  ],

  auditor: [
    // Read-only access for auditing
    'viewInvoice',
    'viewCustomer',
    'viewProduct',
    'viewPayment',
    'viewReports', 'exportReports',
    'viewAuditLogs'
  ]
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || []
  return permissions.includes(permission)
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission))
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission))
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Role hierarchy for escalation
 * Higher roles can override lower roles
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 6,
  accountant: 5,
  manager: 4,
  auditor: 3,
  warehouse: 2,
  cashier: 1
}

/**
 * Check if one role can override another
 */
export function canOverrideRole(higherRole: UserRole, lowerRole: UserRole): boolean {
  return ROLE_HIERARCHY[higherRole] > ROLE_HIERARCHY[lowerRole]
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    owner: 'Owner',
    manager: 'Manager',
    cashier: 'Cashier',
    warehouse: 'Warehouse',
    accountant: 'Accountant',
    auditor: 'Auditor'
  }
  return names[role] || role
}

/**
 * Get role description
 */
export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    owner: 'Full access to all features and settings',
    manager: 'Operational management and reporting',
    cashier: 'Billing and customer management',
    warehouse: 'Inventory and stock management',
    accountant: 'Financial operations and reconciliation',
    auditor: 'Read-only access for auditing purposes'
  }
  return descriptions[role] || ''
}