const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || ''

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
  })
}

export const initSentry = () => Sentry