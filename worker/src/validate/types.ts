export interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  message?: string
  durationMs: number
  error?: string
}

export interface PipelineValidator {
  name: string
  description: string
  dependencies: string[]
  run(ctx: ValidationContext): Promise<CheckResult[]>
}

export interface InfraStatus {
  supabase: boolean
  redis: boolean
  worker: boolean
  bullmq: boolean
}

export interface ValidationContext {
  supabaseUrl: string
  supabaseKey: string
  workerUrl: string
  redisUrl: string
  infra: InfraStatus
  reportStep: (result: CheckResult) => void
}

export type ValidatorModule = () => PipelineValidator
