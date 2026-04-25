import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
}, isProduction ? undefined : pino.destination(1))

export function createTenantLogger(tenantId: string, userId?: string) {
  return logger.child({
    tenant: tenantId,
    user: userId,
    timestamp: new Date().toISOString(),
  })
}

export function logRequest(request: Request, meta: {
  tenantId?: string
  userId?: string
  route: string
  method: string
  requestId?: string
}) {
  logger.info({
    ...meta,
    type: 'request',
    url: request.url,
  })
}

export function logInvoiceAction(action: string, meta: {
  tenantId: string
  userId: string
  invoiceId: string
  requestId?: string
}) {
  logger.info({
    type: 'invoice',
    action,
    ...meta,
  })
}

export function logAuthAttempt(tenantId: string, meta: {
  phone?: string
  success: boolean
  reason?: string
  requestId?: string
}) {
  logger.info({
    type: 'auth',
    action: 'login_attempt',
    tenant: tenantId,
    ...meta,
  })
}

export function logErpCall(tenantId: string, meta: {
  method: string
  endpoint: string
  success: boolean
  duration: number
  statusCode?: number
  requestId?: string
}) {
  logger.info({
    type: 'erp',
    tenant: tenantId,
    ...meta,
  })
}

export function logSecurityEvent(meta: {
  type: 'rate_limit' | 'csrf_reject' | 'session_anomaly' | 'tenant_suspended'
  tenantId?: string
  userId?: string
  ip?: string
  details?: string
}) {
  logger.warn({
    ...meta,
    category: 'security',
    timestamp: new Date().toISOString(),
  })
}

export function logError(error: Error, meta: {
  tenantId?: string
  userId?: string
  route?: string
  requestId?: string
}) {
  logger.error({
    type: 'error',
    error: {
      message: error.message,
      stack: isProduction ? undefined : error.stack,
    },
    ...meta,
  })
}