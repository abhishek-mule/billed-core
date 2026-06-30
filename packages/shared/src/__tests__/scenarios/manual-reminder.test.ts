import { describe, it } from 'vitest'
import { runScenario, assertScenarioSuccess } from './helpers'
import {
  createCustomer, createInvoice, receivePayment, sendManualReminder,
} from '../../scenarios/steps'
import {
  outstanding, timelineEventCount, timelineContains,
  messagesSent, reminderCount, nextAction,
  noErrorState, recoveryStatus,
} from '../../scenarios/expectations'

describe('Scenario: Manual Reminder', () => {
  it('sends exactly one reminder with override=true', async () => {
    const result = await runScenario({
      name: 'Single manual reminder sent',
      steps: [
        createCustomer('Deepa'),
        createInvoice('Deepa', 4000),
        sendManualReminder('Deepa'),
      ],
      expect: [
        messagesSent(1),
        timelineEventCount(2),
        timelineContains('reminder'),
        reminderCount('Deepa', 1),
        nextAction('Deepa', 'reminder'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('manual reminder fires even after automatic reminders were sent', async () => {
    const result = await runScenario({
      name: 'Manual override after auto reminders',
      steps: [
        createCustomer('Ravi'),
        createInvoice('Ravi', 6000),
        sendManualReminder('Ravi'),
        sendManualReminder('Ravi'),
      ],
      expect: [
        messagesSent(2),
        timelineEventCount(3),
        reminderCount('Ravi', 2),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('reminder on fully paid customer is skipped', async () => {
    const result = await runScenario({
      name: 'Reminder on paid customer is no-op',
      steps: [
        createCustomer('Empty'),
        createInvoice('Empty', 5000),
        receivePayment('Empty', 5000),
        sendManualReminder('Empty'),
      ],
      expect: [
        outstanding('Empty', 0),
        recoveryStatus('Empty', 'recovered'),
        messagesSent(0),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('reminder increments counter and appears in timeline', async () => {
    const result = await runScenario({
      name: 'Reminder counter and timeline',
      steps: [
        createCustomer('Neha'),
        createInvoice('Neha', 2000),
        sendManualReminder('Neha'),
      ],
      expect: [
        reminderCount('Neha', 1),
        timelineEventCount(2),
        timelineContains('reminder'),
      ],
    })
    assertScenarioSuccess(result)
  })
})
