import { ScenarioRunner } from '../../scenarios/scenario-runner'
import type { ScenarioDefinition, ScenarioResult } from '../../scenarios/scenario-runner'

export function runScenario(scenario: ScenarioDefinition): Promise<ScenarioResult> {
  const runner = new ScenarioRunner()
  return runner.run(scenario)
}

export function assertScenarioSuccess(result: ScenarioResult): void {
  const failedSteps = result.stepResults.filter(r => !r.passed)
  const failedExpect = result.expectResults.filter(r => !r.passed)

  if (failedSteps.length > 0 || failedExpect.length > 0) {
    const lines: string[] = [`Scenario "${result.name}" FAILED (${result.durationMs.toFixed(0)}ms)`]

    for (const s of failedSteps) {
      lines.push(`  Step: ${s.label}`)
      lines.push(`    ${s.error}`)
    }
    for (const e of failedExpect) {
      lines.push(`  Expect: ${e.label}`)
      lines.push(`    ${e.error}`)
    }

    throw new Error(lines.join('\n'))
  }
}
