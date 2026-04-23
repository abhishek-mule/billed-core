import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || ''

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    tracesSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
  })
}

export const sentryPerf = () => {
  if (typeof window !== 'undefined' && window.performance) {
    const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    if (navTiming) {
      Sentry.addEventProcessor((event) => {
        event.measurements = {
          ...event.measurements,
          'FCP': { value: navTiming.domContentLoadedEventEnd - navTiming.fetchStart },
          'TTI': { value: navTiming.domInteractive - navTiming.fetchStart },
          'LCP': { value: (performance.getEntriesByType('largest-contentful-p')[0] as any)?.startTime || 0 },
        }
        return event
      })
    }
  }
}