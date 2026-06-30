import type { ScenarioExpectation } from './scenario-runner'
import type { SystemTestHarness } from '../transports/test-harness'

function fail(message: string): never {
  throw new Error(message)
}

export function outstanding(customerName: string, expected: number): ScenarioExpectation {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `"${customerName}" outstanding = ₹${expected}`,
    check: async (h: SystemTestHarness) => {
      const case_ = h.recovery.getCase(caseId)
      if (!case_) fail(`No recovery case for ${customerName}`)
      if (case_.totalOverdue !== expected) {
        fail(`Expected ${customerName} outstanding ₹${expected}, got ₹${case_.totalOverdue}`)
      }
    },
  }
}

export function workQueueCount(expected: number): ScenarioExpectation {
  return {
    label: `Work queue has ${expected} item(s)`,
    check: async (h: SystemTestHarness) => {
      const today = h.dashboard.getSection('today')
      const count = today?.itemCount ?? 0
      if (count !== expected) {
        fail(`Expected ${expected} work items in dashboard, got ${count}`)
      }
    },
  }
}

export function timelineEventCount(expected: number): ScenarioExpectation {
  return {
    label: `Timeline has ${expected} event(s)`,
    check: async (h: SystemTestHarness) => {
      const count = h.timeline.getEventCount()
      if (count !== expected) {
        fail(`Expected ${expected} timeline events, got ${count}`)
      }
    },
  }
}

export function timelineContains(text: string): ScenarioExpectation {
  return {
    label: `Timeline contains "${text}"`,
    check: async (h: SystemTestHarness) => {
      const events = h.timeline.events
      const found = events.some(e =>
        e.type.toLowerCase().includes(text.toLowerCase()) ||
        JSON.stringify(e.payload).toLowerCase().includes(text.toLowerCase())
      )
      if (!found) {
        fail(`Timeline does not contain "${text}". Events: ${events.map(e => e.type).join(', ')}`)
      }
    },
  }
}

export function reminderCount(customerName: string, expected: number): ScenarioExpectation {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `"${customerName}" has ${expected} reminder(s)`,
    check: async (h: SystemTestHarness) => {
      const case_ = h.recovery.getCase(caseId)
      if (!case_) fail(`No recovery case for ${customerName}`)
      if (case_.ignoredReminders !== expected) {
        fail(`Expected ${expected} reminders for ${customerName}, got ${case_.ignoredReminders}`)
      }
    },
  }
}

export function messagesSent(expected: number): ScenarioExpectation {
  return {
    label: `${expected} message(s) sent`,
    check: async (h: SystemTestHarness) => {
      const count = h.message.getSentCount()
      if (count !== expected) {
        fail(`Expected ${expected} messages sent, got ${count}`)
      }
    },
  }
}

export function recoveryStatus(customerName: string, status: string): ScenarioExpectation {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `"${customerName}" recovery status = "${status}"`,
    check: async (h: SystemTestHarness) => {
      const case_ = h.recovery.getCase(caseId)
      if (!case_) fail(`No recovery case for ${customerName}`)
      if (case_.status !== status) {
        fail(`Expected ${customerName} recovery status "${status}", got "${case_.status}"`)
      }
    },
  }
}

export function nextAction(customerName: string, action: string): ScenarioExpectation {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `"${customerName}" next action = "${action}"`,
    check: async (h: SystemTestHarness) => {
      const case_ = h.recovery.getCase(caseId)
      if (!case_) fail(`No recovery case for ${customerName}`)
      const normalized = case_.nextActionType.toLowerCase()
      if (!normalized.includes(action.toLowerCase())) {
        fail(`Expected ${customerName} next action to include "${action}", got "${case_.nextActionType}"`)
      }
    },
  }
}

export function cashMetric(name: string, expected: number): ScenarioExpectation {
  return {
    label: `Cash metric "${name}" = ₹${expected}`,
    check: async (h: SystemTestHarness) => {
      const metric = h.dashboard.getMetric(name)
      if (!metric) fail(`No cash metric "${name}"`)
      if (metric.value !== expected) {
        fail(`Expected cash metric "${name}" = ₹${expected}, got ₹${metric.value}`)
      }
    },
  }
}

export function brokenPromises(customerName: string, expected: number): ScenarioExpectation {
  const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`
  const caseId = `case-${customerId}`
  return {
    label: `"${customerName}" has ${expected} broken promise(s)`,
    check: async (h: SystemTestHarness) => {
      const case_ = h.recovery.getCase(caseId)
      if (!case_) fail(`No recovery case for ${customerName}`)
      if (case_.brokenPromises !== expected) {
        fail(`Expected ${expected} broken promises for ${customerName}, got ${case_.brokenPromises}`)
      }
    },
  }
}

export function workerEventsProcessed(expected: number): ScenarioExpectation {
  return {
    label: `Worker processed ${expected} event(s)`,
    check: async (h: SystemTestHarness) => {
      const count = h.worker.getProcessedCount()
      if (count !== expected) {
        fail(`Worker processed ${count} events, expected ${expected}`)
      }
    },
  }
}

export function dashboardRefreshed(expected: number): ScenarioExpectation {
  return {
    label: `Dashboard refreshed ${expected} time(s)`,
    check: async (h: SystemTestHarness) => {
      const count = h.dashboard.refreshCallCount
      if (count !== expected) {
        fail(`Dashboard refreshed ${count} times, expected ${expected}`)
      }
    },
  }
}

export function noErrorState(): ScenarioExpectation {
  return {
    label: 'No dead letters or failures',
    check: async (h: SystemTestHarness) => {
      const deadLetters = h.outbox.getEvents().filter(e => e.status === 'dead_letter')
      if (deadLetters.length > 0) {
        fail(`${deadLetters.length} dead letter(s) found: ${deadLetters.map(e => e.id).join(', ')}`)
      }
      const failures = h.worker.getFailureCount()
      if (failures > 0) {
        fail(`${failures} worker failure(s)`)
      }
    },
  }
}
