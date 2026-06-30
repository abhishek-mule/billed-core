import { describe, it, expect, beforeEach } from 'vitest'
import { createTestHarness, type SystemTestHarness } from '../../../transports/test-harness'

describe('Payment Pipeline — duplicate', () => {
  let harness: SystemTestHarness

  const customerId = 'cust-002'
  const tenantId = 'tenant-test'
  const caseId = `case-${customerId}`

  beforeEach(() => {
    harness = createTestHarness()
  })

  it('ignores duplicate payment.completed events with same id', async () => {
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

    const eventId = 'pay-dup-001'

    await harness.outbox.publish({
      id: eventId,
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: eventId,
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    await harness.outbox.publish({
      id: eventId,
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: eventId,
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    const results = await harness.worker.processAll()

    const successResults = results.filter(r => r.success)
    expect(successResults).toHaveLength(1)

    const pending = harness.outbox.getPending()
    expect(pending).toHaveLength(0)

    const updatedCase = harness.recovery.getCase(caseId)
    expect(updatedCase!.totalOverdue).toBe(3000)

    expect(harness.dashboard.refreshCallCount).toBe(1)

    expect(harness.pipelineRegistry['payment.completed'].idempotent).toBe(true)
  })

  it('handles same payload delivered twice from different outbox ids', async () => {
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

    await harness.outbox.publish({
      id: 'pay-dup-a',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-dup-a',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })
    await harness.outbox.publish({
      id: 'pay-dup-b',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-dup-b',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    const results = await harness.worker.processAll()

    const successResults = results.filter(r => r.success)
    expect(successResults).toHaveLength(2)

    const updatedCase = harness.recovery.getCase(caseId)
    expect(updatedCase!.totalOverdue).toBe(1000)

    expect(harness.dashboard.getMetric('cash_received')!.value).toBe(4000)
    expect(harness.dashboard.refreshCallCount).toBe(2)
    expect(harness.timeline.getEventCount()).toBe(2)
  })
})
