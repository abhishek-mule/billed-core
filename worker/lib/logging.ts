export interface WorkerLogEntry {
  event_id?: string
  tenant_id: string
  entity_id?: string | null
  correlation_id?: string | null
  causation_id?: string | null
  queue_name: string
  attempt: number
  status: 'success' | 'failed' | 'pending' | 'retry'
  duration_ms: number
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  metadata?: Record<string, unknown>
}

export function logWorkerEvent(entry: WorkerLogEntry) {
  console.log(JSON.stringify(entry))
}

export function logWorkerError(error: Error, context: Partial<WorkerLogEntry>) {
  const entry: WorkerLogEntry = {
    tenant_id: context.tenant_id || 'unknown',
    queue_name: context.queue_name || 'unknown',
    attempt: context.attempt || 0,
    status: 'failed',
    duration_ms: context.duration_ms || 0,
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message,
    metadata: {
      stack: error.stack,
      ...context.metadata,
    },
  }

  console.error(JSON.stringify(entry))
}
