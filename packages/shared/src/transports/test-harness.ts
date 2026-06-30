import { FakeMessageTransport } from './fake-message'
import { FakeScheduler } from './fake-scheduler'
import { FakeClock } from './fake-clock'
import { FakeOutboxPublisher } from './fake-outbox'
import { FakeDecisionEngine } from './fake-decision-engine'
import { FakeRecoveryProjection } from './fake-recovery-projection'
import { FakeDashboardProjection } from './fake-dashboard-projection'
import { FakeTimeline } from './fake-timeline'
import { FakeWorker } from './fake-worker'
import { PipelineRegistry } from '../system/pipeline-registry'
import type { PipelineId } from '../system/pipelines'

export interface TestHarnessDeps {
  message?: FakeMessageTransport
  scheduler?: FakeScheduler
  clock?: FakeClock
  outbox?: FakeOutboxPublisher
  decisionEngine?: FakeDecisionEngine
  recovery?: FakeRecoveryProjection
  dashboard?: FakeDashboardProjection
  timeline?: FakeTimeline
  worker?: FakeWorker
}

export class SystemTestHarness {
  readonly message: FakeMessageTransport
  readonly scheduler: FakeScheduler
  readonly clock: FakeClock
  readonly outbox: FakeOutboxPublisher
  readonly decisionEngine: FakeDecisionEngine
  readonly recovery: FakeRecoveryProjection
  readonly dashboard: FakeDashboardProjection
  readonly timeline: FakeTimeline
  readonly worker: FakeWorker
  readonly pipelineRegistry = PipelineRegistry

  private pipelineEvents: Array<{ pipelineId: PipelineId; type: string; payload: Record<string, unknown> }> = []
  private msgIndex = 0

  constructor(deps?: TestHarnessDeps) {
    this.message = deps?.message ?? new FakeMessageTransport()
    this.scheduler = deps?.scheduler ?? new FakeScheduler()
    this.clock = deps?.clock ?? new FakeClock()
    this.outbox = deps?.outbox ?? new FakeOutboxPublisher()
    this.decisionEngine = deps?.decisionEngine ?? new FakeDecisionEngine()
    this.recovery = deps?.recovery ?? new FakeRecoveryProjection()
    this.dashboard = deps?.dashboard ?? new FakeDashboardProjection()
    this.timeline = deps?.timeline ?? new FakeTimeline()
    this.worker = deps?.worker
      ?? new FakeWorker(this.outbox, this.recovery, this.dashboard, this.timeline, this.decisionEngine, this.message)

    this.registerDefaultHandlers()
  }

  private registerDefaultHandlers() {
    this.worker.onPipeline('payment.completed', async (event) => {
      const { customerId, amount, tenantId } = event.payload as { customerId: string; amount: number; tenantId: string }
      const caseId = `case-${customerId}`

      const existing = this.recovery.getCase(caseId)
      if (existing) {
        const newTotal = Math.max(0, existing.totalOverdue - amount)
        if (newTotal <= 0) {
          await this.recovery.updateCase(caseId, { totalOverdue: newTotal, status: 'recovered', nextActionType: 'closed' })
        } else {
          await this.recovery.updateCase(caseId, { totalOverdue: newTotal, status: 'active', nextActionType: 'review_payment' })
        }
      }
      const cashMetric = this.dashboard.getMetric('cash_received')
      const cumulative = (cashMetric?.value ?? 0) + amount
      await this.dashboard.updateMetric('cash_received', cumulative)
      await this.dashboard.updateSection('today', 1)
      await this.dashboard.refresh()
      await this.timeline.addEvent({
        id: `tl-${event.type}-${Date.now()}`,
        type: event.type,
        customerId,
        tenantId,
        payload: event.payload,
      })
    })

    this.worker.onPipeline('reminder.requested', async (event) => {
      const { customerId, tenantId, caseId } = event.payload as { customerId: string; tenantId: string; caseId: string }
      const case_ = this.recovery.getCase(caseId)
      if (!case_ || case_.status === 'recovered' || case_.status === 'closed' || case_.totalOverdue <= 0) {
        return
      }
      if (case_) {
        await this.recovery.updateCase(caseId, { ignoredReminders: case_.ignoredReminders + 1 })
      }
      const result = await this.decisionEngine.evaluate({
        caseId,
        customerId,
        tenantId,
        totalOverdue: case_?.totalOverdue ?? 0,
        oldestOverdueDays: 0,
        nextActionType: 'send_reminder',
        promiseToPayDate: null,
        ignoredReminders: case_?.ignoredReminders ?? 0,
        brokenPromises: case_?.brokenPromises ?? 0,
        lastReminderAt: null,
        automationMode: case_?.automationMode ?? 'auto',
      })
      if (result.action === 'send_reminder' || result.action === 'call') {
        await this.message.send({
          id: `msg-${caseId}-${this.msgIndex++}`,
          to: customerId,
          body: result.reason,
        })
      }
      await this.timeline.addEvent({
        id: `tl-reminder-${Date.now()}`,
        type: 'reminder.sent',
        customerId,
        tenantId,
        payload: { ...event.payload, decision: result },
      })
    })

    this.worker.onPipeline('invoice.created', async (event) => {
      const { customerId, tenantId, amount, invoiceId } = event.payload as {
        customerId: string; tenantId: string; amount: number; invoiceId: string
      }
      const caseId = `case-${customerId}`
      if (!this.recovery.getCase(caseId)) {
        await this.recovery.createCase({
          caseId,
          customerId,
          tenantId,
          totalOverdue: amount,
          status: 'active',
          nextActionType: 'send_reminder',
          brokenPromises: 0,
          ignoredReminders: 0,
          automationMode: 'auto',
          updatedAt: new Date().toISOString(),
        })
      } else {
        const existing = this.recovery.getCase(caseId)!
        await this.recovery.updateCase(caseId, {
          totalOverdue: existing.totalOverdue + amount,
          nextActionType: 'send_reminder',
          status: 'active',
        })
      }
      await this.dashboard.updateMetric('outstanding', amount)
      await this.dashboard.refresh()
      await this.timeline.addEvent({
        id: `tl-invoice-${Date.now()}`,
        type: 'invoice.created',
        customerId,
        tenantId,
        payload: event.payload,
      })
    })

    this.worker.onPipeline('promise.created', async (event) => {
      const { customerId, tenantId, promiseDate, caseId } = event.payload as {
        customerId: string; tenantId: string; promiseDate: string; caseId: string
      }
      await this.scheduler.schedule({
        id: `promise-${caseId}`,
        name: 'promise.broken',
        runAt: new Date(promiseDate),
        payload: { customerId, tenantId, caseId },
      })
      const case_ = this.recovery.getCase(caseId)
      if (case_) {
        await this.recovery.updateCase(caseId, { nextActionType: 'wait' })
      }
      await this.timeline.addEvent({
        id: `tl-promise-created-${Date.now()}`,
        type: 'promise.created',
        customerId,
        tenantId,
        payload: event.payload,
      })
    })

    this.worker.onPipeline('promise.fulfilled', async (event) => {
      const { customerId, caseId } = event.payload as {
        customerId: string; caseId: string; tenantId: string
      }
      const case_ = this.recovery.getCase(caseId)
      if (case_) {
        await this.recovery.updateCase(caseId, { nextActionType: 'send_reminder' })
      }
      await this.scheduler.cancel(`promise-${caseId}`)
    })

    this.worker.onPipeline('promise.broken', async (event) => {
      const { customerId, tenantId, caseId } = event.payload as {
        customerId: string; tenantId: string; caseId: string
      }
      const case_ = this.recovery.getCase(caseId)
      if (case_) {
        await this.recovery.updateCase(caseId, {
          brokenPromises: case_.brokenPromises + 1,
          nextActionType: 'call',
          status: 'active',
        })
      }
      await this.timeline.addEvent({
        id: `tl-promise-broken-${Date.now()}`,
        type: 'promise.broken',
        customerId,
        tenantId,
        payload: event.payload,
      })
    })

    this.worker.onPipeline('scheduler.tick', async (event) => {
      const pending = this.scheduler.getPending()
      for (const job of pending) {
        if (job.runAt <= this.clock.now()) {
          await this.scheduler.fire(job.id)
          if (job.name === 'promise.broken') {
            const { customerId, tenantId, caseId } = job.payload as {
              customerId: string; tenantId: string; caseId: string
            }
            const case_ = this.recovery.getCase(caseId)
            if (case_) {
              await this.recovery.updateCase(caseId, {
                brokenPromises: case_.brokenPromises + 1,
                nextActionType: 'call',
                status: 'active',
              })
            }
            await this.timeline.addEvent({
              id: `tl-promise-broken-${Date.now()}`,
              type: 'promise.broken',
              customerId,
              tenantId,
              payload: job.payload,
            })
          }
        }
      }
    })
  }

  getPipeline(id: PipelineId) {
    const entry = this.pipelineRegistry[id]
    if (!entry) throw new Error(`Unknown pipeline: ${id}`)
    return entry
  }

  recordEvent(pipelineId: PipelineId, type: string, payload: Record<string, unknown>) {
    this.pipelineEvents.push({ pipelineId, type, payload })
  }

  getRecordedEvents() {
    return this.pipelineEvents
  }

  getEventsForPipeline(id: PipelineId) {
    return this.pipelineEvents.filter(e => e.pipelineId === id)
  }

  clearRecordedEvents() {
    this.pipelineEvents = []
  }

  expectPipeline(id: PipelineId): PipelineExpectation {
    return new PipelineExpectation(this, id)
  }

  reset() {
    this.message.clear()
    this.scheduler.clear()
    this.outbox.clear()
    this.clock.setTime(new Date('2026-06-01T00:00:00Z'))
    this.decisionEngine.clear?.()
    this.recovery.clear()
    this.dashboard.clear()
    this.timeline.clear()
    this.worker.clear()
    this.clearRecordedEvents()
  }
}

export class PipelineExpectation {
  private produceChecks: string[] = []
  private consumeChecks: string[] = []
  private updateChecks: string[] = []
  private projectChecks: string[] = []
  private withDuplicate: boolean | null = null
  private withRetry: boolean | null = null

  constructor(
    private harness: SystemTestHarness,
    private pipelineId: PipelineId,
  ) {}

  toProduce(component: string): this {
    this.produceChecks.push(component)
    return this
  }

  toBeConsumedBy(component: string): this {
    this.consumeChecks.push(component)
    return this
  }

  toUpdate(entity: string): this {
    this.updateChecks.push(entity)
    return this
  }

  toProject(target: string): this {
    this.projectChecks.push(target)
    return this
  }

  verify(): void {
    const pipeline = this.harness.getPipeline(this.pipelineId)

    for (const component of this.produceChecks) {
      const found = pipeline.expectedSideEffects.some(s => s.toLowerCase().includes(component.toLowerCase()))
      if (!found) {
        throw new Error(
          `Pipeline ${this.pipelineId}: expected to produce "${component}" but not in contract.\n` +
          `Expected side effects: ${pipeline.expectedSideEffects.join(', ')}`
        )
      }
    }

    for (const component of this.consumeChecks) {
      const found = pipeline.consumers.some(c => c.toLowerCase().includes(component.toLowerCase()))
      if (!found) {
        throw new Error(
          `Pipeline ${this.pipelineId}: expected to be consumed by "${component}" but not in contract.\n` +
          `Consumers: ${pipeline.consumers.join(', ')}`
        )
      }
    }

    for (const entity of this.updateChecks) {
      const found = pipeline.expectedSideEffects.some(s => s.toLowerCase().includes(entity.toLowerCase()))
      if (!found) {
        throw new Error(
          `Pipeline ${this.pipelineId}: expected to update "${entity}" but not in contract.\n` +
          `Expected side effects: ${pipeline.expectedSideEffects.join(', ')}`
        )
      }
    }

    for (const target of this.projectChecks) {
      const found = pipeline.expectedSideEffects.some(s => s.toLowerCase().includes(target.toLowerCase()))
      if (!found) {
        throw new Error(
          `Pipeline ${this.pipelineId}: expected to project to "${target}" but not in contract.\n` +
          `Expected side effects: ${pipeline.expectedSideEffects.join(', ')}`
        )
      }
    }
  }
}

export function createTestHarness(deps?: TestHarnessDeps): SystemTestHarness {
  return new SystemTestHarness(deps)
}
