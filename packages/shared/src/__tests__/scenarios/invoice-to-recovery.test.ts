import { describe, it } from 'vitest'
import { runScenario, assertScenarioSuccess } from './helpers'
import {
  createCustomer, createInvoice, receivePayment, advanceClock,
  sendManualReminder,
} from '../../scenarios/steps'
import {
  outstanding, timelineEventCount, timelineContains,
  recoveryStatus, nextAction, cashMetric, noErrorState,
  workerEventsProcessed, dashboardRefreshed, messagesSent,
} from '../../scenarios/expectations'

describe('Scenario: Invoice → Recovery', () => {
  it('creates invoice → recovery case → today work', async () => {
    const result = await runScenario({
      name: 'Invoice creates recovery case and today work',
      steps: [
        createCustomer('Raj'),
        createInvoice('Raj', 5000),
      ],
      expect: [
        outstanding('Raj', 5000),
        recoveryStatus('Raj', 'active'),
        nextAction('Raj', 'reminder'),
        cashMetric('outstanding', 5000),
        dashboardRefreshed(1),
        workerEventsProcessed(1),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('full payment clears recovery case and updates dashboard', async () => {
    const result = await runScenario({
      name: 'Full payment clears debt',
      steps: [
        createCustomer('Priya'),
        createInvoice('Priya', 3000),
        receivePayment('Priya', 3000),
      ],
      expect: [
        outstanding('Priya', 0),
        recoveryStatus('Priya', 'recovered'),
        cashMetric('cash_received', 3000),
        timelineEventCount(2),
        timelineContains('payment.completed'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('partial payment reduces outstanding without closing case', async () => {
    const result = await runScenario({
      name: 'Partial payment reduces debt',
      steps: [
        createCustomer('Amit'),
        createInvoice('Amit', 10000),
        receivePayment('Amit', 4000),
      ],
      expect: [
        outstanding('Amit', 6000),
        recoveryStatus('Amit', 'active'),
        nextAction('Amit', 'review'),
        cashMetric('cash_received', 4000),
        cashMetric('outstanding', 10000),
        timelineEventCount(2),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('invoice + manual reminder sends message and updates timeline', async () => {
    const result = await runScenario({
      name: 'Manual reminder sends message',
      steps: [
        createCustomer('Sunita'),
        createInvoice('Sunita', 2000),
        sendManualReminder('Sunita'),
      ],
      expect: [
        outstanding('Sunita', 2000),
        messagesSent(1),
        timelineEventCount(2),
        timelineContains('reminder'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('multiple steps — invoice, payment, reminder — all project consistently', async () => {
    const result = await runScenario({
      name: 'Multi-step consistency',
      steps: [
        createCustomer('Vikram'),
        createInvoice('Vikram', 8000),
        receivePayment('Vikram', 3000),
        sendManualReminder('Vikram'),
      ],
      expect: [
        outstanding('Vikram', 5000),
        recoveryStatus('Vikram', 'active'),
        cashMetric('cash_received', 3000),
        cashMetric('outstanding', 8000),
        timelineEventCount(3),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })
})
