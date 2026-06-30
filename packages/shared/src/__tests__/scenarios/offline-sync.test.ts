import { describe, it } from 'vitest'
import { runScenario, assertScenarioSuccess } from './helpers'
import {
  createCustomer, createInvoice, receivePayment, simulateSync,
  workerRestart,
} from '../../scenarios/steps'
import {
  outstanding, timelineEventCount, timelineContains,
  cashMetric, noErrorState, recoveryStatus,
  nextAction,
} from '../../scenarios/expectations'

describe('Scenario: Offline Sync', () => {
  it('single offline invoice syncs to one recovery case', async () => {
    const result = await runScenario({
      name: 'Offline invoice creates one recovery case on sync',
      steps: [
        createCustomer('Offline1'),
        createInvoice('Offline1', 5000),
        simulateSync(),
      ],
      expect: [
        outstanding('Offline1', 5000),
        recoveryStatus('Offline1', 'active'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('multiple offline invoices sync to correct totals', async () => {
    const result = await runScenario({
      name: 'Multiple offline invoices sync correctly',
      steps: [
        createCustomer('Offline2'),
        createInvoice('Offline2', 3000),
        createInvoice('Offline2', 4000),
        simulateSync(),
      ],
      expect: [
        outstanding('Offline2', 7000),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('offline payment syncs and reduces outstanding', async () => {
    const result = await runScenario({
      name: 'Offline payment syncs and updates',
      steps: [
        createCustomer('Offline3'),
        createInvoice('Offline3', 10000),
        simulateSync(),
        receivePayment('Offline3', 4000),
        simulateSync(),
      ],
      expect: [
        outstanding('Offline3', 6000),
        cashMetric('cash_received', 4000),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('worker restart recovers events', async () => {
    const result = await runScenario({
      name: 'Worker restart recovers pending events',
      steps: [
        createCustomer('Restart1'),
        createInvoice('Restart1', 5000),
        workerRestart(),
      ],
      expect: [
        outstanding('Restart1', 5000),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })

  it('full offline → sync → worker → dashboard cycle', async () => {
    const result = await runScenario({
      name: 'Full offline cycle',
      steps: [
        createCustomer('FullCycle'),
        createInvoice('FullCycle', 8000),
        simulateSync(),
        receivePayment('FullCycle', 3000),
        simulateSync(),
        workerRestart(),
      ],
      expect: [
        outstanding('FullCycle', 5000),
        cashMetric('cash_received', 3000),
        nextAction('FullCycle', 'review'),
        noErrorState(),
      ],
    })
    assertScenarioSuccess(result)
  })
})
