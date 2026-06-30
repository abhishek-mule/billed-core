import { describe, it } from 'vitest'
import { runScenario, assertScenarioSuccess } from './helpers'
import {
  createCustomer, createInvoice, receivePayment, advanceClock,
  createPromise, fulfillPromise,
} from '../../scenarios/steps'
import {
  outstanding, timelineEventCount, timelineContains,
  noErrorState, recoveryStatus, nextAction,
  brokenPromises, messagesSent,
} from '../../scenarios/expectations'

describe('Scenario: Promise Lifecycle', () => {
  it('active promise suppresses reminders', async () => {
    const result = await runScenario({
      name: 'Active promise suppresses reminders',
      steps: [
        createCustomer('Promise1'),
        createInvoice('Promise1', 5000),
        createPromise('Promise1', 5),
      ],
      expect: [
        outstanding('Promise1', 5000),
        nextAction('Promise1', 'wait'),
        messagesSent(0),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('fulfilled promise keeps case open but re-enables reminders', async () => {
    const result = await runScenario({
      name: 'Fulfilled promise re-enables reminders',
      steps: [
        createCustomer('Promise2'),
        createInvoice('Promise2', 5000),
        createPromise('Promise2', 5),
        fulfillPromise('Promise2'),
      ],
      expect: [
        outstanding('Promise2', 5000),
        nextAction('Promise2', 'reminder'),
        messagesSent(0),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('broken promise escalates to call', async () => {
    const result = await runScenario({
      name: 'Broken promise escalates to call',
      steps: [
        createCustomer('Promise3'),
        createInvoice('Promise3', 5000),
        createPromise('Promise3', 1),
        advanceClock(2),
      ],
      expect: [
        outstanding('Promise3', 5000),
        nextAction('Promise3', 'call'),
        brokenPromises('Promise3', 1),
        timelineContains('promise.broken'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('broken promise → payment resolves case', async () => {
    const result = await runScenario({
      name: 'Broken promise then payment resolves',
      steps: [
        createCustomer('Promise4'),
        createInvoice('Promise4', 8000),
        createPromise('Promise4', 1),
        advanceClock(2),
        receivePayment('Promise4', 8000),
      ],
      expect: [
        outstanding('Promise4', 0),
        nextAction('Promise4', 'closed'),
        recoveryStatus('Promise4', 'recovered'),
        brokenPromises('Promise4', 1),
        timelineEventCount(4),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('promise due today gets followed up', async () => {
    const result = await runScenario({
      name: 'Promise due today gets follow-up',
      steps: [
        createCustomer('Promise5'),
        createInvoice('Promise5', 3000),
        createPromise('Promise5', 0),
      ],
      expect: [
        outstanding('Promise5', 3000),
        nextAction('Promise5', 'wait'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })
})
