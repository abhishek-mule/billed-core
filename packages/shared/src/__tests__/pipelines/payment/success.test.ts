import { describe, it, expect, beforeEach } from 'vitest'
import { createTestHarness, type SystemTestHarness } from '../../../transports/test-harness'

describe('Payment Pipeline — success', () => {
  let harness: SystemTestHarness

  const customerId = 'cust-001'
  const tenantId = 'tenant-test'
  const caseId = `case-${customerId}`

  beforeEach(() => {
    harness = createTestHarness()
  })

  it('processes payment.completed end-to-end', async () => {
    await harness.recovery.createCase({
      caseId,
      customerId,
      tenantId,
      totalOverdue: 5000,
      status: 'active',
      nextActionType: 'send_reminder',
      brokenPromises: 0,
      ignoredReminders: 0,
      automationMode: 'auto',
      updatedAt: new Date().toISOString(),
    })

    const eventId = await harness.outbox.publish({
      id: 'pay-001',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-001',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    const result = await harness.worker.processNext()

    expect(result).not.toBeNull()
    expect(result!.success).toBe(true)
    expect(result!.outboxEventId).toBe(eventId)
    expect(result!.pipelineId).toBe('payment.completed')

    const updatedCase = harness.recovery.getCase(caseId)
    expect(updatedCase).toBeDefined()
    expect(updatedCase!.totalOverdue).toBe(3000)

    const cashMetric = harness.dashboard.getMetric('cash_received')
    expect(cashMetric).toBeDefined()
    expect(cashMetric!.value).toBe(2000)

    expect(harness.dashboard.refreshCallCount).toBe(1)

    const timelineEvents = harness.timeline.getEventsForCustomer(customerId)
    expect(timelineEvents).toHaveLength(1)
    expect(timelineEvents[0].type).toBe('payment.completed')

    const outboxEvent = await harness.outbox.getStatus(eventId)
    expect(outboxEvent).toBeDefined()
    expect(outboxEvent!.status).toBe('processed')

    const processed = harness.worker.processed
    expect(processed).toHaveLength(1)
    expect(processed[0].success).toBe(true)

    harness.expectPipeline('payment.completed')
      .toProduce('outbox')
      .toBeConsumedBy('worker')
      .toUpdate('recovery')
      .toUpdate('invoice')
      .toProject('dashboard')
      .verify()
  })
})
