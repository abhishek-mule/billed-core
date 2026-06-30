export interface ScheduledJob {
  id: string
  name: string
  runAt: Date
  payload: Record<string, unknown>
  fired: boolean
  firedAt?: string
}

export interface Scheduler {
  schedule(job: Omit<ScheduledJob, 'fired' | 'firedAt'>): Promise<void>
  cancel(jobId: string): Promise<void>
  list(): Promise<ScheduledJob[]>
  name: string
}
