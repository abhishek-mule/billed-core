import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.SENTRY_DSN || ''

Sentry.init({
  dsn: SENTRY_DSN,

  tracesSampleRate: 1.0,

  beforeSend(event, hint) {
    const error = hint.originalException
    if (error && (error as any).tenantId) {
      event.tags = {
        ...event.tags,
        tenant_id: (error as any).tenantId,
      }
    }

    if (globalThis.tenantId) {
      event.tags = {
        ...event.tags,
        tenant_id: globalThis.tenantId,
      }
    }

    console.log('[Sentry] Captured error:', event.exception?.values?.[0]?.type)
    return event
  },

  integrations: [
    Sentry.httpIntegration(),
  ],
})

export const withTenantScope = (tenantId: string, callback: () => void) => {
  Sentry.setTag('tenant_id', tenantId)
  try {
    callback()
  } finally {
    Sentry.setTag('tenant_id', null)
  }
}

export const captureERPFailure = (error: Error, tenantId?: string, context?: Record<string, any>) => {
  Sentry.setTag('source', 'erp')
  if (tenantId) Sentry.setTag('tenant_id', tenantId)
  if (context) Sentry.setExtra('context', context)
  Sentry.captureException(error)
  Sentry.setTag('source', null)
}

export const captureWhatsAppFailure = (error: Error, tenantId?: string, eventType?: string) => {
  Sentry.setTag('source', 'whatsapp')
  if (tenantId) Sentry.setTag('tenant_id', tenantId)
  if (eventType) Sentry.setTag('event_type', eventType)
  Sentry.captureException(error)
  Sentry.setTag('source', null)
}

export const captureInvoiceFailure = (error: Error, tenantId?: string, invoiceId?: string) => {
  Sentry.setTag('source', 'invoice')
  if (tenantId) Sentry.setTag('tenant_id', tenantId)
  if (invoiceId) Sentry.setTag('invoice_id', invoiceId)
  Sentry.captureException(error)
  Sentry.setTag('source', null)
}