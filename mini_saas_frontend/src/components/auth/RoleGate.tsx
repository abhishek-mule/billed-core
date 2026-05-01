'use client'

import { ReactNode } from 'react'
import { useSession } from '@/hooks/useSession'
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@/lib/role-permissions'
import type { Permission, UserRole } from '@/lib/role-permissions'

interface RoleGateProps {
  children: ReactNode
  requiredRoles?: UserRole[]
  requiredPermissions?: Permission[]
  permissionMode?: 'any' | 'all'
  fallback?: ReactNode
  requireAll?: boolean
}

/**
 * RoleGate Component
 * Conditionally renders children based on user role and permissions
 * 
 * @example
 * <RoleGate requiredRoles={['owner', 'manager']}>
 *   <AdminPanel />
 * </RoleGate>
 * 
 * @example
 * <RoleGate requiredPermissions={['createInvoice', 'editInvoice']} permissionMode="any">
 *   <InvoiceActions />
 * </RoleGate>
 */
export function RoleGate({
  children,
  requiredRoles,
  requiredPermissions,
  permissionMode = 'all',
  fallback = null,
  requireAll = true
}: RoleGateProps) {
  const { data: session } = useSession()

  // If no session, show fallback
  if (!session) {
    return <>{fallback}</>
  }

  const userRole = session.role as UserRole

  // Check role requirements
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = requireAll
      ? requiredRoles.includes(userRole)
      : requiredRoles.some(role => role === userRole)

    if (!hasRequiredRole) {
      return <>{fallback}</>
    }
  }

  // Check permission requirements
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasRequiredPermissions = permissionMode === 'all'
      ? hasAllPermissions(userRole, requiredPermissions)
      : hasAnyPermission(userRole, requiredPermissions)

    if (!hasRequiredPermissions) {
      return <>{fallback}</>
    }
  }

  // All checks passed, render children
  return <>{children}</>
}

/**
 * Higher-order component version of RoleGate
 */
export function withRoleGate<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<RoleGateProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <RoleGate {...options}>
        <Component {...props} />
      </RoleGate>
    )
  }
}

/**
 * Hook to check if current user has specific permissions
 */
export function usePermissions() {
  const { data: session } = useSession()
  const userRole = session?.role as UserRole

  return {
    hasPermission: (permission: Permission) => hasPermission(userRole, permission),
    hasAnyPermission: (permissions: Permission[]) => hasAnyPermission(userRole, permissions),
    hasAllPermissions: (permissions: Permission[]) => hasAllPermissions(userRole, permissions),
    canOverride: (otherRole: UserRole) => {
      const { canOverrideRole } = require('@/lib/role-permissions')
      return canOverrideRole(userRole, otherRole)
    },
    role: userRole
  }
}