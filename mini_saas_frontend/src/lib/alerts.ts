import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

export interface Alert {
  id: string
  type: 'high_failure_ratio' | 'high_latency' | 'circuit_open' | 'manual_retry_spike'
  severity: 'critical' | 'warning'
  tenantId?: string
  message: string
  triggeredAt: number
}

const ALERT_THRESHOLDS = {
  maxFailedSyncRatio: 0.05,
  maxLatencyP95: 2000,
  maxManualRetriesPerHour: 3,
}

export async function checkAlerts(): Promise<Alert[]> {
  const redis = getRedis()
  const alerts: Alert[] = []
  const now = Date.now()

  const failedKeys = await redis.keys('erp_attempt:*')
  const failedAttempts: { tenantId: string; status: string }[] = []

  for (const key of failedKeys) {
    const attempt = await redis.get(key)
    if (attempt && typeof attempt !== 'string' && attempt.status === 'FAILED') {
      failedAttempts.push({
        tenantId: attempt.tenantId,
        status: attempt.status,
      })
    }
  }

  if (failedAttempts.length > 0) {
    const totalAttempts = failedAttempts.length
    const failedCount = failedAttempts.filter(a => a.status === 'FAILED').length
    const ratio = failedCount / Math.max(totalAttempts, 1)

    if (ratio > ALERT_THRESHOLDS.maxFailedSyncRatio) {
      alerts.push({
        id: `alert_${now}_failures`,
        type: 'high_failure_ratio',
        severity: ratio > 0.2 ? 'critical' : 'warning',
        message: `Failed sync ratio ${Math.round(ratio * 100)}% exceeds ${ALERT_THRESHOLDS.maxFailedSyncRatio * 100}%`,
        triggeredAt: now,
      })
    }
  }

  const circuitKeys = await redis.keys('circuit:*')
  for (const key of circuitKeys) {
    const circuit = await redis.get(key)
    if (circuit && typeof circuit !== 'string' && circuit.isOpen) {
      const tenantId = key.replace('circuit:', '')
      alerts.push({
        id: `alert_${now}_circuit_${tenantId}`,
        type: 'circuit_open',
        severity: 'critical',
        tenantId,
        message: `ERP circuit breaker open for tenant ${tenantId}`,
        triggeredAt: now,
      })
    }
  }

  const latencyP95 = await redis.get('latency:p95')
  if (latencyP95 && typeof latencyP95 === 'number' && latencyP95 > ALERT_THRESHOLDS.maxLatencyP95) {
    alerts.push({
      id: `alert_${now}_latency`,
      type: 'high_latency',
      severity: 'warning',
      message: `P95 latency ${latencyP95}ms exceeds ${ALERT_THRESHOLDS.maxLatencyP95}ms`,
      triggeredAt: now,
    })
  }

  return alerts
}

export async function getActiveAlerts(): Promise<Alert[]> {
  const redis = getRedis()
  const keys = await redis.keys('alert:*')
  const alerts: Alert[] = []
  const now = Date.now()

  for (const key of keys) {
    const alert = await redis.get<Alert>(key)
    if (alert && typeof alert !== 'string') {
      const age = now - alert.triggeredAt
      if (age < 3600000) {
        alerts.push(alert)
      }
    }
  }

  return alerts.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1 }
    return sevOrder[a.severity] - sevOrder[b.severity]
  })
}

export async function triggerAlert(alert: Omit<Alert, 'id' | 'triggeredAt'>): Promise<void> {
  const redis = getRedis()
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  
  await redis.set(id, JSON.stringify({
    ...alert,
    id,
    triggeredAt: Date.now(),
  }), { ex: 3600 })
}

export async function clearAlert(alertId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(alertId)
}

export async function checkAndTriggerAlerts(): Promise<Alert[]> {
  const alerts = await checkAlerts()
  
  for (const alert of alerts) {
    const existing = await getActiveAlerts()
    const alreadyExists = existing.find(a => a.type === alert.type && a.tenantId === alert.tenantId)
    
    if (!alreadyExists) {
      await triggerAlert(alert)
    }
  }
  
  return alerts
}

setInterval(async () => {
  try {
    await checkAndTriggerAlerts()
  } catch (error) {
    console.error('[Alerts] Check failed:', error)
  }
}, 60000)