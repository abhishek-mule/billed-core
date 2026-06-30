import { createTestHarness } from '../transports/test-harness'
import type { SystemTestHarness } from '../transports/test-harness'

export type StepAction = (harness: SystemTestHarness) => Promise<void>

export interface ScenarioStep {
  label: string
  run: StepAction
}

export type ExpectAction = (harness: SystemTestHarness) => Promise<void>

export interface ScenarioExpectation {
  label: string
  check: ExpectAction
}

export interface ScenarioDefinition {
  name: string
  description?: string
  steps: ScenarioStep[]
  expect: ScenarioExpectation[]
}

export interface ScenarioResult {
  name: string
  success: boolean
  stepResults: Array<{ label: string; passed: boolean; error?: string }>
  expectResults: Array<{ label: string; passed: boolean; error?: string }>
  durationMs: number
}

let nextId = 1

export class ScenarioRunner {
  private results: ScenarioResult[] = []

  async run(scenario: ScenarioDefinition): Promise<ScenarioResult> {
    const start = performance.now()
    const harness = createTestHarness()

    const stepResults: ScenarioResult['stepResults'] = []
    const expectResults: ScenarioResult['expectResults'] = []

    try {
      for (const step of scenario.steps) {
        try {
          await step.run(harness)
          stepResults.push({ label: step.label, passed: true })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          stepResults.push({ label: step.label, passed: false, error: message })
          break
        }
      }

      for (const ex of scenario.expect) {
        try {
          await ex.check(harness)
          expectResults.push({ label: ex.label, passed: true })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          expectResults.push({ label: ex.label, passed: false, error: message })
        }
      }
    } finally {
      harness.reset()
    }

    const durationMs = performance.now() - start
    const success = stepResults.every(r => r.passed) && expectResults.every(r => r.passed)
    const result: ScenarioResult = { name: scenario.name, success, stepResults, expectResults, durationMs }
    this.results.push(result)
    return result
  }

  runAll(scenarios: ScenarioDefinition[]): Promise<ScenarioResult[]> {
    return Promise.all(scenarios.map(s => this.run(s)))
  }

  getResults(): ScenarioResult[] {
    return this.results
  }

  static getNextId(prefix = 'id'): string {
    return `${prefix}-${nextId++}`
  }
}

export function step(label: string, run: StepAction): ScenarioStep {
  return { label, run }
}

export function expect(label: string, check: ExpectAction): ScenarioExpectation {
  return { label, check }
}

