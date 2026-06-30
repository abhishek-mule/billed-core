import { ScenarioRunner } from './scenario-runner'
import type { ScenarioStep } from './scenario-runner'
import type { SystemTestHarness } from '../transports/test-harness'

export function createCustomer(name: string): ScenarioStep {
  const customerId = `cust-${name.replace(/\s/g, '-').toLowerCase()}`
  return {
    label: `Create customer "${name}"`,
    run: async (h: SystemTestHarness) => {
      const caseId = `case-${customerId}`
      await h.recovery.createCase({
        caseId,
        customerId,
        tenantId: 'test',
        totalOverdue: 0,
        status: 'active',
        nextActionType: 'none',
        brokenPromises: 0,
        ignoredReminders: 0,
        automationMode: 'auto',
        updatedAt: new Date().toISOString(),
      })
    },
  }
}

export function createInvoice(customerName: string, amount: number): ScenarioStep {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const invoiceId = `inv-${ScenarioRunner.getNextId()}`
  return {
    label: `Create invoice ₹${amount} for "${customerName}"`,
    run: async (h: SystemTestHarness) => {
      const caseId = `case-${customerId}`
      await h.outbox.publish({
        id: invoiceId,
        type: 'invoice.created',
        tenantId: 'test',
        aggregateType: 'invoice',
        aggregateId: invoiceId,
        payload: { customerId, amount, tenantId: 'test', invoiceId },
      })
      await h.worker.processAll()
    },
  }
}

export function receivePayment(customerName: string, amount: number): ScenarioStep {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const paymentId = `pay-${ScenarioRunner.getNextId()}`
  return {
    label: `Receive payment ₹${amount} from "${customerName}"`,
    run: async (h: SystemTestHarness) => {
      await h.outbox.publish({
        id: paymentId,
        type: 'payment.completed',
        tenantId: 'test',
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: { customerId, amount, tenantId: 'test', paymentMethod: 'cash' },
      })
      await h.worker.processAll()
    },
  }
}

export function advanceClock(days: number): ScenarioStep {
  return {
    label: `Advance clock by ${days} day(s)`,
    run: async (h: SystemTestHarness) => {
      h.clock.advance(days * 24 * 60 * 60 * 1000)
      await h.outbox.publish({
        id: `tick-${ScenarioRunner.getNextId()}`,
        type: 'scheduler.tick',
        tenantId: 'test',
        aggregateType: 'scheduler',
        aggregateId: 'scheduler',
        payload: {},
      })
      await h.worker.processAll()
    },
  }
}

export function sendManualReminder(customerName: string): ScenarioStep {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `Send manual reminder to "${customerName}"`,
    run: async (h: SystemTestHarness) => {
      await h.outbox.publish({
        id: `remind-${ScenarioRunner.getNextId()}`,
        type: 'reminder.requested',
        tenantId: 'test',
        aggregateType: 'reminder',
        aggregateId: caseId,
        payload: { customerId, tenantId: 'test', caseId, trigger: 'manual', override: true },
      })
      await h.worker.processAll()
    },
  }
}

export function autoReminder(customerName: string): ScenarioStep {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `Automatic reminder fires for "${customerName}"`,
    run: async (h: SystemTestHarness) => {
      const case_ = h.recovery.getCase(caseId)
      if (!case_ || case_.totalOverdue <= 0 || case_.nextActionType === 'wait' || case_.status !== 'active') {
        return
      }
      const caseUpdated = new Date(case_.updatedAt)
      const now = h.clock.now()
      const sameDay = caseUpdated.toDateString() === now.toDateString()
      if (sameDay) {
        return
      }
      await h.outbox.publish({
        id: `remind-auto-${ScenarioRunner.getNextId()}`,
        type: 'reminder.requested',
        tenantId: 'test',
        aggregateType: 'reminder',
        aggregateId: caseId,
        payload: { customerId, tenantId: 'test', caseId, trigger: 'automatic', override: false },
      })
      await h.worker.processAll()
    },
  }
}

export function createPromise(customerName: string, daysFromNow: number): ScenarioStep {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `Create promise due in ${daysFromNow} day(s) for "${customerName}"`,
    run: async (h: SystemTestHarness) => {
      const promiseDate = new Date(h.clock.now().getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString()
      await h.outbox.publish({
        id: `promise-${ScenarioRunner.getNextId()}`,
        type: 'promise.created',
        tenantId: 'test',
        aggregateType: 'promise',
        aggregateId: caseId,
        payload: { customerId, tenantId: 'test', promiseDate, caseId },
      })
      await h.worker.processAll()
    },
  }
}

export function fulfillPromise(customerName: string): ScenarioStep {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `Fulfill promise for "${customerName}"`,
    run: async (h: SystemTestHarness) => {
      await h.outbox.publish({
        id: `promise-fulfill-${ScenarioRunner.getNextId()}`,
        type: 'promise.fulfilled',
        tenantId: 'test',
        aggregateType: 'promise',
        aggregateId: caseId,
        payload: { customerId, tenantId: 'test', caseId },
      })
      await h.worker.processAll()
    },
  }
}

export function simulateSync(): ScenarioStep {
  return {
    label: 'Simulate sync',
    run: async (h: SystemTestHarness) => {
      await h.outbox.publish({
        id: `sync-${ScenarioRunner.getNextId()}`,
        type: 'sync.completed',
        tenantId: 'test',
        aggregateType: 'sync',
        aggregateId: 'sync-status',
        payload: { status: 'synced' },
      })
      await h.outbox.publish({
        id: `sync-outbox-${ScenarioRunner.getNextId()}`,
        type: 'outbox.event.created',
        tenantId: 'test',
        aggregateType: 'outbox',
        aggregateId: 'outbox-status',
        payload: {},
      })
      await h.worker.processAll()
    },
  }
}

export function workerRestart(): ScenarioStep {
  return {
    label: 'Simulate worker restart',
    run: async (h: SystemTestHarness) => {
      h.worker.clear()
      await h.worker.processAll()
    },
  }
}
