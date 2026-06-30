import type { Scheduler, ScheduledJob } from './scheduler'

export class FakeScheduler implements Scheduler {
  readonly name = 'fake'
  private jobs: Map<string, ScheduledJob> = new Map()
  autoFire = false

  setAutoFire(fire: boolean) {
    this.autoFire = fire
  }

  async schedule(job: Omit<ScheduledJob, 'fired' | 'firedAt'>): Promise<void> {
    this.jobs.set(job.id, { ...job, fired: false })
  }

  async cancel(jobId: string): Promise<void> {
    this.jobs.delete(jobId)
  }

  async list(): Promise<ScheduledJob[]> {
    return Array.from(this.jobs.values())
  }

  async fire(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return
    this.jobs.set(jobId, { ...job, fired: true, firedAt: new Date().toISOString() })
  }

  async fireAll(): Promise<void> {
    for (const [id] of this.jobs) {
      await this.fire(id)
    }
  }

  getPending(): ScheduledJob[] {
    return Array.from(this.jobs.values()).filter(j => !j.fired)
  }

  getFired(): ScheduledJob[] {
    return Array.from(this.jobs.values()).filter(j => j.fired)
  }

  clear() {
    this.jobs.clear()
    this.autoFire = false
  }
}
