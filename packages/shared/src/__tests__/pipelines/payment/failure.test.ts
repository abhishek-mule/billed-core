import { describe, it, expect, beforeEach } from 'vitest'
import { createTestHarness, type SystemTestHarness } from '../../../transports/test-harness'

describe('Payment Pipeline — failure', () => {
  let harness: SystemTestHarness

  const customerId = 'cust-003'
  const tenantId = 'tenant-test'
  const caseId = `case-${customerId}`

  beforeEach(() => {
    harness = createTestHarness()
  })

  it('sends payment to dead letter when worker fails', async () => {
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
      id: 'pay-fail-001',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-fail-001',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    harness.worker.failNext = true
    const result = await harness.worker.processNext()

    expect(result).not.toBeNull()
    expect(result!.success).toBe(false)
    expect(result!.error).toBe('Simulated processing failure')

    const outboxEvent = await harness.outbox.getStatus(eventId)
    expect(outboxEvent).toBeDefined()
    expect(outboxEvent!.status).toBe('dead_letter')

    const updatedCase = harness.recovery.getCase(caseId)
    expect(updatedCase!.totalOverdue).toBe(5000)

    expect(harness.dashboard.refreshCallCount).toBe(0)

    expect(harness.worker.getSuccessCount()).toBe(0)
    expect(harness.worker.getFailureCount()).toBe(1)
  })

  it('recovers from worker crash during processing', async () => {
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
      id: 'pay-crash-001',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-crash-001',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    harness.worker.simulateCrashOnNext = true
    const crashResult = await harness.worker.processNext()
    expect(crashResult!.success).toBe(false)
    expect(crashResult!.error).toBe('Simulated crash')

    const crashedEvent = await harness.outbox.getStatus(eventId)
    expect(crashedEvent!.status).toBe('processing')

    harness.worker.simulateCrashOnNext = false
    harness.worker.failNext = false

    harness.outbox.setStatus(eventId, 'pending')

    const retryResult = await harness.worker.processNext()

    expect(retryResult).not.toBeNull()
    expect(retryResult!.success).toBe(true)

    const recoveredEvent = await harness.outbox.getStatus(eventId)
    expect(recoveredEvent!.status).toBe('processed')

    const updatedCase = harness.recovery.getCase(caseId)
    expect(updatedCase!.totalOverdue).toBe(3000)

    expect(harness.dashboard.refreshCallCount).toBe(1)
    expect(harness.timeline.getEventCount()).toBe(1)
  })
})
