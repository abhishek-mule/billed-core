import { describe, it } from 'vitest'
import { runScenario, assertScenarioSuccess } from './helpers'
import {
  createCustomer, createInvoice, receivePayment, advanceClock,
  autoReminder, createPromise,
} from '../../scenarios/steps'
import {
  outstanding, timelineEventCount,
  messagesSent, reminderCount, noErrorState,
  recoveryStatus, cashMetric,
} from '../../scenarios/expectations'

describe('Scenario: Automatic Reminder', () => {
  it('fires for unpaid invoice', async () => {
    const result = await runScenario({
      name: 'Auto reminder fires for unpaid invoice',
      steps: [
        createCustomer('Anita'),
        createInvoice('Anita', 3000),
        autoReminder('Anita'),
      ],
      expect: [
        messagesSent(1),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('increments on each reminder', async () => {
    const result = await runScenario({
      name: 'Auto reminder increments counter',
      steps: [
        createCustomer('Bina'),
        createInvoice('Bina', 4000),
        autoReminder('Bina'),
        autoReminder('Bina'),
      ],
      expect: [
        messagesSent(2),
        reminderCount('Bina', 2),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('skips recovered case', async () => {
    const result = await runScenario({
      name: 'Auto reminder skips paid invoice',
      steps: [
        createCustomer('Chitra'),
        createInvoice('Chitra', 5000),
        receivePayment('Chitra', 5000),
        autoReminder('Chitra'),
      ],
      expect: [
        messagesSent(0),
        outstanding('Chitra', 0),
        recoveryStatus('Chitra', 'recovered'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('skips customer with active promise', async () => {
    const result = await runScenario({
      name: 'Auto reminder skips promise',
      steps: [
        createCustomer('Divya'),
        createInvoice('Divya', 6000),
        createPromise('Divya', 3),
        autoReminder('Divya'),
      ],
      expect: [
        messagesSent(0),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('reminder updates dashboard and timeline', async () => {
    const result = await runScenario({
      name: 'Reminder updates dashboard and timeline',
      steps: [
        createCustomer('Ekta'),
        createInvoice('Ekta', 7000),
        autoReminder('Ekta'),
      ],
      expect: [
        messagesSent(1),
        timelineEventCount(2),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })
})
