import { FakeOutboxPublisher } from './fake-outbox'
import { FakeRecoveryProjection } from './fake-recovery-projection'
import { FakeDashboardProjection } from './fake-dashboard-projection'
import { FakeTimeline } from './fake-timeline'
import { FakeDecisionEngine } from './fake-decision-engine'
import { FakeMessageTransport } from './fake-message'
import type { PipelineId } from '../system/pipelines'

export interface WorkerEvent {
  outboxEventId: string
  pipelineId: PipelineId
  processedAt: string
  success: boolean
  error?: string
}

export class FakeWorker {
  readonly name = 'fake'
  processed: WorkerEvent[] = []
  failNext = false
  simulateCrashOnNext = false

  private callbacks: Map<string, (event: { type: string; payload: Record<string, unknown> }) => Promise<void>> = new Map()

  constructor(
    private outbox: FakeOutboxPublisher,
    private recovery: FakeRecoveryProjection,
    private dashboard: FakeDashboardProjection,
    private timeline: FakeTimeline,
    private decisionEngine: FakeDecisionEngine,
    private message: FakeMessageTransport,
  ) {}

  onPipeline(id: string, handler: (event: { type: string; payload: Record<string, unknown> }) => Promise<void>) {
    this.callbacks.set(id, handler)
  }

  async processNext(): Promise<WorkerEvent | null> {
    const pending = this.outbox.getPending()
    if (pending.length === 0) return null

    const event = pending[0]
    this.outbox.markProcessed(event.id, 'processing')

    if (this.simulateCrashOnNext) {
      this.simulateCrashOnNext = false
      const crashEvent: WorkerEvent = {
        outboxEventId: event.id,
        pipelineId: event.type as PipelineId,
        processedAt: new Date().toISOString(),
        success: false,
        error: 'Simulated crash',
      }
      this.processed.push(crashEvent)
      // Leave status as 'processing' to simulate crash before finalizing
      return crashEvent
    }

    if (this.failNext) {
      this.failNext = false
      this.outbox.markProcessed(event.id, 'dead_letter')
      const failEvent: WorkerEvent = {
        outboxEventId: event.id,
        pipelineId: event.type as PipelineId,
        processedAt: new Date().toISOString(),
        success: false,
        error: 'Simulated processing failure',
      }
      this.processed.push(failEvent)
      return failEvent
    }

    try {
      const handler = this.callbacks.get(event.type)
      if (handler) {
        await handler({ type: event.type, payload: event.payload })
      }

      this.outbox.markProcessed(event.id, 'processed')
      const successEvent: WorkerEvent = {
        outboxEventId: event.id,
        pipelineId: event.type as PipelineId,
        processedAt: new Date().toISOString(),
        success: true,
      }
      this.processed.push(successEvent)
      return successEvent
    } catch (err) {
      this.outbox.markProcessed(event.id, 'dead_letter')
      const failEvent: WorkerEvent = {
        outboxEventId: event.id,
        pipelineId: event.type as PipelineId,
        processedAt: new Date().toISOString(),
        success: false,
        error: String(err),
      }
      this.processed.push(failEvent)
      return failEvent
    }
  }

  async processAll(): Promise<WorkerEvent[]> {
    const results: WorkerEvent[] = []
    let next = await this.processNext()
    while (next) {
      results.push(next)
      next = await this.processNext()
    }
    return results
  }

  getProcessedCount(): number {
    return this.processed.length
  }

  getSuccessCount(): number {
    return this.processed.filter(e => e.success).length
  }

  getFailureCount(): number {
    return this.processed.filter(e => !e.success).length
  }

  clear() {
    this.processed = []
    this.failNext = false
    this.simulateCrashOnNext = false
    this.callbacks.clear()
  }
}
