export const permissions = {
  createInvoice: ['owner', 'cashier', 'accountant'],
  deleteInvoice: ['owner'],
  editInvoice: ['owner', 'accountant'],
  viewInvoice: ['owner', 'cashier', 'accountant', 'manager', 'auditor'],
  
  createCustomer: ['owner', 'cashier', 'accountant'],
  deleteCustomer: ['owner'],
  editCustomer: ['owner', 'accountant'],
  viewCustomer: ['owner', 'cashier', 'accountant', 'manager', 'auditor'],
  
  createProduct: ['owner', 'accountant'],
  deleteProduct: ['owner'],
  editProduct: ['owner', 'accountant'],
  viewProduct: ['owner', 'cashier', 'accountant', 'manager', 'auditor'],
  
  createPayment: ['owner', 'cashier'],
  deletePayment: ['owner'],
  viewPayment: ['owner', 'cashier', 'accountant', 'manager', 'auditor'],
  
  viewReports: ['owner', 'accountant', 'manager', 'auditor'],
  exportReports: ['owner', 'manager'],
  
  manageUsers: ['owner'],
  manageSettings: ['owner'],
  viewSettings: ['owner', 'accountant'],
} as const

export type Permission = keyof typeof permissions
export type Role = 'owner' | 'cashier' | 'accountant' | 'manager' | 'auditor'

export function hasPermission(role: Role, permission: Permission): boolean {
  const allowed = permissions[permission]
  return allowed.includes(role)
}

export function getUserPermissions(role: Role): Permission[] {
  return Object.entries(permissions)
    .filter(([_, roles]) => roles.includes(role))
    .map(([perm]) => perm as Permission)
}