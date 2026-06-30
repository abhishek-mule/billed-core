import { describe, it, expect, beforeEach } from 'vitest'
import { createTestHarness, type SystemTestHarness } from '../../../transports/test-harness'

describe('Payment Pipeline — recovery', () => {
  let harness: SystemTestHarness

  const customerId = 'cust-004'
  const tenantId = 'tenant-test'
  const caseId = `case-${customerId}`

  beforeEach(() => {
    harness = createTestHarness()
  })

  it('full payment clears recovery case when fully paid', async () => {
    await harness.recovery.createCase({
      caseId,
      customerId,
      tenantId,
      totalOverdue: 2000,
      status: 'active',
      nextActionType: 'send_reminder',
      brokenPromises: 0,
      ignoredReminders: 0,
      automationMode: 'auto',
      updatedAt: new Date().toISOString(),
    })

    await harness.outbox.publish({
      id: 'pay-full-001',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-full-001',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })

    const result = await harness.worker.processNext()
    expect(result!.success).toBe(true)

    const recoveryCase = harness.recovery.getCase(caseId)
    expect(recoveryCase).toBeDefined()
    expect(recoveryCase!.totalOverdue).toBe(0)
    expect(recoveryCase!.status).toBe('recovered')

    expect(harness.dashboard.getMetric('cash_received')!.value).toBe(2000)
    expect(harness.dashboard.refreshCallCount).toBe(1)

    const timelineEvents = harness.timeline.getEventsForCustomer(customerId)
    expect(timelineEvents).toHaveLength(1)
    expect(timelineEvents[0].type).toBe('payment.completed')
  })

  it('partial payment reduces overdue without closing case', async () => {
    await harness.recovery.createCase({
      caseId,
      customerId,
      tenantId,
      totalOverdue: 10000,
      status: 'active',
      nextActionType: 'send_reminder',
      brokenPromises: 0,
      ignoredReminders: 0,
      automationMode: 'auto',
      updatedAt: new Date().toISOString(),
    })

    await harness.outbox.publish({
      id: 'pay-part-001',
      type: 'payment.completed',
      tenantId,
      aggregateType: 'payment',
      aggregateId: 'pay-part-001',
      payload: { customerId, amount: 3000, tenantId, paymentMethod: 'cash' },
    })

    await harness.worker.processNext()

    const recoveryCase = harness.recovery.getCase(caseId)
    expect(recoveryCase!.totalOverdue).toBe(7000)
    expect(recoveryCase!.status).toBe('active')
    expect(recoveryCase!.nextActionType).toBe('review_payment')
  })

  it('multiple partial payments eventually close case', async () => {
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
      id: 'pay-mult-001', type: 'payment.completed', tenantId,
      aggregateType: 'payment', aggregateId: 'pay-mult-001',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })
    await harness.outbox.publish({
      id: 'pay-mult-002', type: 'payment.completed', tenantId,
      aggregateType: 'payment', aggregateId: 'pay-mult-002',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })
    await harness.outbox.publish({
      id: 'pay-mult-003', type: 'payment.completed', tenantId,
      aggregateType: 'payment', aggregateId: 'pay-mult-003',
      payload: { customerId, amount: 1000, tenantId, paymentMethod: 'cash' },
    })

    await harness.worker.processAll()

    const recoveryCase = harness.recovery.getCase(caseId)
    expect(recoveryCase!.totalOverdue).toBe(0)
    expect(recoveryCase!.status).toBe('recovered')

    expect(harness.dashboard.getMetric('cash_received')!.value).toBe(5000)
    expect(harness.dashboard.refreshCallCount).toBe(3)
    expect(harness.timeline.getEventCount()).toBe(3)
  })

  it('multiple payments across different customers project independently', async () => {
    const customerB = 'cust-005'
    const caseB = `case-${customerB}`

    await harness.recovery.createCase({
      caseId, customerId, tenantId, totalOverdue: 5000,
      status: 'active', nextActionType: 'send_reminder',
      brokenPromises: 0, ignoredReminders: 0, automationMode: 'auto',
      updatedAt: new Date().toISOString(),
    })
    await harness.recovery.createCase({
      caseId: caseB, customerId: customerB, tenantId, totalOverdue: 3000,
      status: 'active', nextActionType: 'send_reminder',
      brokenPromises: 0, ignoredReminders: 0, automationMode: 'auto',
      updatedAt: new Date().toISOString(),
    })

    await harness.outbox.publish({
      id: 'pay-mc-001', type: 'payment.completed', tenantId,
      aggregateType: 'payment', aggregateId: 'pay-mc-001',
      payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
    })
    await harness.outbox.publish({
      id: 'pay-mc-002', type: 'payment.completed', tenantId,
      aggregateType: 'payment', aggregateId: 'pay-mc-002',
      payload: { customerId: customerB, amount: 3000, tenantId, paymentMethod: 'cash' },
    })

    await harness.worker.processAll()

    expect(harness.recovery.getCase(caseId)!.totalOverdue).toBe(3000)
    expect(harness.recovery.getCase(caseB)!.totalOverdue).toBe(0)
    expect(harness.recovery.getCase(caseB)!.status).toBe('recovered')

    expect(harness.dashboard.getMetric('cash_received')!.value).toBe(5000)
    expect(harness.dashboard.refreshCallCount).toBe(2)
    expect(harness.timeline.getEventCount()).toBe(2)
  })

  it('recovery projection matches dashboard and timeline', async () => {
    await harness.recovery.createCase({
      caseId, customerId, tenantId, totalOverdue: 5000,
      status: 'active', nextActionType: 'send_reminder',
      brokenPromises: 0, ignoredReminders: 0, automationMode: 'auto',
      updatedAt: new Date().toISOString(),
    })

    await harness.outbox.publish({
      id: 'pay-proj-001', type: 'payment.completed', tenantId,
      aggregateType: 'payment', aggregateId: 'pay-proj-001',
      payload: { customerId, amount: 5000, tenantId, paymentMethod: 'cash' },
    })
    await harness.worker.processNext()

    const recoveryOverdue = harness.recovery.getCase(caseId)!.totalOverdue
    const cashReceived = harness.dashboard.getMetric('cash_received')!.value
    const timelineCount = harness.timeline.getEventCount()

    expect(recoveryOverdue).toBe(0)
    expect(cashReceived).toBe(5000)
    expect(timelineCount).toBe(1)

    expect(recoveryOverdue === 0 && cashReceived === 5000).toBe(true)
  })
})
