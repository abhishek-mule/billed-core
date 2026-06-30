import type { CheckResult, PipelineValidator, ValidationContext, InfraStatus } from './types'
import { checkInfra } from './infra'

export interface ValidationReport {
  timestamp: string
  infra: InfraStatus
  pipelines: Array<{
    name: string
    description: string
    checks: CheckResult[]
    allPassed: boolean
    durationMs: number
  }>
  summary: {
    total: number
    pass: number
    fail: number
    warn: number
    skip: number
    durationMs: number
  }
}

export class ValidationRunner {
  private validators: PipelineValidator[] = []
  private results: CheckResult[] = []

  register(validator: PipelineValidator): void {
    this.validators.push(validator)
  }

  async run(opts: {
    supabaseUrl: string
    supabaseKey: string
    workerUrl: string
    redisUrl: string
  }): Promise<ValidationReport> {
    const start = performance.now()

    const infra = await checkInfra({
      ...opts,
      infra: { supabase: false, redis: false, worker: false, bullmq: false },
      reportStep: () => {},
    })

    const ctx: ValidationContext = {
      ...opts,
      infra,
      reportStep: (r) => { this.results.push(r) },
    }

    const pipelineReports: ValidationReport['pipelines'] = []

    for (const validator of this.validators) {
      const pipelineStart = performance.now()
      const checks = await validator.run(ctx)
      const durationMs = Math.round(performance.now() - pipelineStart)
      pipelineReports.push({
        name: validator.name,
        description: validator.description,
        checks,
        allPassed: checks.every(c => c.status === 'pass'),
        durationMs,
      })
    }

    const allChecks = pipelineReports.flatMap(p => p.checks)
    const durationMs = Math.round(performance.now() - start)

    return {
      timestamp: new Date().toISOString(),
      infra,
      pipelines: pipelineReports,
      summary: {
        total: allChecks.length,
        pass: allChecks.filter(c => c.status === 'pass').length,
        fail: allChecks.filter(c => c.status === 'fail').length,
        warn: allChecks.filter(c => c.status === 'warn').length,
        skip: allChecks.filter(c => c.status === 'skip').length,
        durationMs,
      },
    }
  }
}

export function printReport(report: ValidationReport): void {
  const { summary } = report

  console.log()
  console.log('═══════════════════════════════════════════')
  console.log('  System Validation Report')
  console.log(`  ${report.timestamp}`)
  console.log('═══════════════════════════════════════════')
  console.log()

  // Infra status
  console.log('  Infrastructure')
  printInfraRow('Supabase', report.infra.supabase)
  printInfraRow('Redis', report.infra.redis)
  printInfraRow('Worker', report.infra.worker)
  printInfraRow('BullMQ Queues', report.infra.bullmq)
  console.log()

  // Pipeline results
  for (const pipeline of report.pipelines) {
    const icon = pipeline.allPassed ? '✅' : '❌'
    console.log(`  ${icon} ${pipeline.name}`)
    console.log(`     ${pipeline.description}`)
    if (pipeline.checks.length > 0) {
      const maxStepLen = Math.max(...pipeline.checks.map(c => c.name.length))
      for (const check of pipeline.checks) {
        const label = check.name.padEnd(maxStepLen + 2)
        const statusIcon = statusToIcon(check.status)
        const time = `${check.durationMs}ms`.padStart(8)
        console.log(`     ${statusIcon} ${label} ${time}`)
        if (check.error) {
          console.log(`        ${check.error}`)
        }
      }
    }
    console.log(`     ${pipeline.allPassed ? '✓ All checks passed' : '✗ Some checks failed'} (${pipeline.durationMs}ms)`)
    console.log()
  }

  // Summary
  console.log('  ───────────────────────────────────────')
  console.log(`  Total:  ${summary.total}`)
  console.log(`  Pass:   ${summary.pass}`)
  console.log(`  Fail:   ${summary.fail}`)
  console.log(`  Warn:   ${summary.warn}`)
  console.log(`  Skip:   ${summary.skip}`)
  console.log(`  Time:   ${summary.durationMs}ms`)
  console.log('─────────────────────────────────────────')
  console.log()
  console.log(`  Overall: ${summary.fail === 0 ? '✅ ALL PASS' : '❌ SOME FAILED'}`)
  console.log()
}

function printInfraRow(name: string, ok: boolean): void {
  const icon = ok ? '✅' : '❌'
  console.log(`  ${icon} ${name}`)
}

function statusToIcon(status: string): string {
  switch (status) {
    case 'pass': return '✅'
    case 'fail': return '❌'
    case 'warn': return '⚠️'
    case 'skip': return '⏭️'
    default: return '❓'
  }
}

export function check(name: string, fn: () => Promise<void>, timeoutMs = 10_000): Promise<CheckResult> {
  const start = performance.now()
  return fn()
    .then(() => ({
      name,
      status: 'pass' as const,
      durationMs: Math.round(performance.now() - start),
    }))
    .catch((err) => ({
      name,
      status: 'fail' as const,
      durationMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    }))
}
