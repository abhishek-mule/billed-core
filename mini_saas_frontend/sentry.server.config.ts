const SENTRY_DSN = process.env.SENTRY_DSN || ''

let Sentry: any = null

if (SENTRY_DSN) {
  try {
    Sentry = require('@sentry/nextjs')
  } catch (e) {
    console.log('[Sentry] Package not installed, skipping')
  }
}

if (Sentry && SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 1.0,
    beforeSend(event: any) {
      const tenantId = (globalThis as any).tenantId
      if (tenantId) {
        event.tags = { ...event.tags, tenant_id: tenantId }
      }
      return event
    },
  })
}

export const captureInvoiceFailure = (error: Error, tenantId?: string) => {
  if (Sentry) {
    try {
      Sentry.captureException(error)
    } catch {}
  }
  console.error(`[Invoice Error] ${error.message}`, { tenantId })
}

export const captureWhatsAppFailure = (error: Error, tenantId?: string) => {
  if (Sentry) {
    try {
      Sentry.captureException(error)
    } catch {}
  }
  console.error(`[WhatsApp Error] ${error.message}`, { tenantId })
}