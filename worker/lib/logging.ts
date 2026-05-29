export interface WorkerLogEntry {
  event_id?: string
  tenant_id?: string
  entity_id?: string | null
  correlation_id?: string | null
  causation_id?: string | null
  queue_name?: string
  attempt?: number
  status?: 'success' | 'failed' | 'pending' | 'retry'
  duration_ms?: number
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  channel_id?: string
  provider?: string
  metadata?: Record<string, unknown>
}

export function logWorkerEvent(entry: WorkerLogEntry) {
  const full: WorkerLogEntry = {
    tenant_id: 'system',
    queue_name: 'bootstrap',
    attempt: 0,
    status: 'success',
    duration_ms: 0,
    ...entry,
  }
  console.log(JSON.stringify(full))
}

export function logWorkerError(error: Error, context: Record<string, unknown> = {}) {
  const entry: WorkerLogEntry = {
    tenant_id: (context.tenant_id as string) || 'system',
    queue_name: (context.queue_name as string) || 'unknown',
    attempt: (context.attempt as number) || 0,
    status: 'failed',
    duration_ms: (context.duration_ms as number) || 0,
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message,
    metadata: {
      stack: error.stack,
      ...context,
    },
  }

  console.error(JSON.stringify(entry))
}
