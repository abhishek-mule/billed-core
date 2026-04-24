import { randomUUID } from 'crypto'

export interface TraceSpan {
  id: string
  parentId?: string
  operation: string
  startTime: number
  endTime?: number
  tags?: Record<string, string | number>
  error?: string
}

const TRACE_STORAGE_KEY = 'trace:spans'

export function generateTraceId(): string {
  return `tr_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export function generateSpanId(): string {
  return `sp_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export class Trace {
  id: string
  spans: TraceSpan[]
  tenantId?: string
  userId?: string
  
  constructor(tenantId?: string, userId?: string) {
    this.id = generateTraceId()
    this.spans = []
    this.tenantId = tenantId
    this.userId = userId
  }
  
  startSpan(operation: string, parentId?: string): TraceSpan {
    const span: TraceSpan = {
      id: generateSpanId(),
      parentId,
      operation,
      startTime: Date.now(),
    }
    this.spans.push(span)
    return span
  }
  
  endSpan(span: TraceSpan, tags?: Record<string, string | number>, error?: string): void {
    span.endTime = Date.now()
    span.tags = tags
    span.error = error
  }
  
  getDuration(): number {
    if (this.spans.length === 0) return 0
    const first = this.spans[0]
    const last = this.spans[this.spans.length - 1]
    return (last.endTime || Date.now()) - first.startTime
  }
  
  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      userId: this.userId,
      duration: this.getDuration(),
      spans: this.spans.map(s => ({
        ...s,
        duration: s.endTime ? s.endTime - s.startTime : undefined,
      })),
    }
  }
}

export async function withTrace<T>(
  operation: string,
  fn: (trace: Trace) => Promise<T>,
  tenantId?: string,
  userId?: string
): Promise<T> {
  const trace = new Trace(tenantId, userId)
  const span = trace.startSpan(operation)
  
  try {
    const result = await fn(trace)
    trace.endSpan(span, { status: 'success' })
    return result
  } catch (error) {
    trace.endSpan(span, { status: 'error' }, error instanceof Error ? error.message : String(error))
    throw error
  }
}

export interface TraceMetrics {
  operation: string
  count: number
  totalDuration: number
  p50: number
  p95: number
  p99: number
  errors: number
}

export function calculateTraceMetrics(spans: TraceSpan[]): TraceMetrics[] {
  const byOperation = new Map<string, number[]>()
  
  for (const span of spans) {
    if (!span.endTime) continue
    const duration = span.endTime - span.startTime
    const existing = byOperation.get(span.operation) || []
    existing.push(duration)
    byOperation.set(span.operation, existing)
  }
  
  const metrics: TraceMetrics[] = []
  
  for (const [operation, durations] of byOperation) {
    const sorted = durations.sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0
    const errors = spans.filter(s => s.operation === operation && s.error).length
    
    metrics.push({
      operation,
      count: sorted.length,
      totalDuration: sorted.reduce((a, b) => a + b, 0),
      p50,
      p95,
      p99,
      errors,
    })
  }
  
  return metrics
}