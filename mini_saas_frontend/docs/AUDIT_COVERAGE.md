# Audit Log Coverage Specification

## Required Events by Category

### Authentication Events
```sql
'login_success'     -- Successful login
'login_failure'   -- Failed login attempt
'logout'          -- Logout
'password_reset'   -- Password reset request
'password_changed' -- Password changed
'account_locked'   -- Account locked due to failures
```

### Invoice Events
```sql
'invoice_created'    -- New invoice created
'invoice_finalized'  -- Invoice marked as finalized
'invoice_modified'   -- Invoice modified (draft only)
'invoice_voided'     -- Invoice voided
'invoice_deleted'   -- Invoice deleted
'invoice_exported'  -- Invoice exported (GST, PDF)
```

### Payment Events
```sql
'payment_recorded'   -- Payment recorded
'payment_deleted'    -- Payment deleted
```

### User Management Events
```sql
'user_created'       -- New user created
'user_updated'     -- User details updated
'user_deactivated' -- User deactivated
'permission_changed' -- Role/permission change
```

### Credential Events
```sql
'credential_rotated' -- ERPNext credentials rotated
'api_key_regenerated' -- API key regenerated
```

### Tenant Events
```sql
'tenant_suspended'  -- Tenant suspended
'tenant_reactivated' -- Tenant reactivated
'plan_upgraded'   -- Plan upgraded
```

### System Events
```sql
'rate_limit_exceeded'   -- Rate limit hit
'csrf_rejected'      -- CSRF validation failed
'session_anomaly'   -- Session anomaly detected
'erp_circuit_open'  -- ERPNext circuit breaker triggered
```

## Coverage Verification

```typescript
import { query } from '@/lib/db/client'

export async function verifyAuditLogCoverage(): Promise<{
  covered: string[]
  missing: string[]
}> {
  const result = await query(`
    SELECT DISTINCT action 
    FROM audit_logs 
    WHERE created_at > NOW() - INTERVAL '7 days'
  `)
  
  const logged = new Set(result.map(r => r.action))
  const required = new Set(AUDIT_EVENTS)
  const covered: string[] = []
  const missing: string[] = []
  
  for (const event of required) {
    if (logged.has(event)) {
      covered.push(event)
    } else {
      missing.push(event)
    }
  }
  
  return { covered, missing }
}
```

## Usage in Code

```typescript
import { createAuditLog } from '@/lib/db/client'

async function logAuthSuccess(tenantId: string, userId: string) {
  await createAuditLog({
    tenant_id: tenantId,
    user_id: userId,
    action: 'login_success',
  })
}

async function logInvoiceCreate(tenantId: string, userId: string, invoiceId: string) {
  await createAuditLog({
    tenant_id: tenantId,
    user_id: userId,
    action: 'invoice_created',
    entity_type: 'invoice',
    entity_id: invoiceId,
  })
}
```

## Audit Log Queries

### Find user activity
```sql
SELECT * FROM audit_logs 
WHERE user_id = 'user_xxx' 
ORDER BY created_at DESC
```

### Find tenant security events
```sql
SELECT * FROM audit_logs 
WHERE tenant_id = 'tenant_xxx' 
AND action IN ('login_failure', 'account_locked', 'credential_rotated')
ORDER BY created_at DESC
```

### Find invoice timeline
```sql
SELECT action, user_id, created_at 
FROM audit_logs 
WHERE entity_id = 'invoice_xxx' 
ORDER BY created_at ASC
```