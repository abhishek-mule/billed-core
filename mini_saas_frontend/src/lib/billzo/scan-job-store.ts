import type { ScanJob, ScanSessionPayload, ScanStageEvent, ScanStage } from './scan-types'

type ScanJobMap = Map<string, ScanJob>

declare global {
  // eslint-disable-next-line no-var
  var __billzoScanJobs: ScanJobMap | undefined
}

function getStore(): ScanJobMap {
  if (!globalThis.__billzoScanJobs) {
    globalThis.__billzoScanJobs = new Map<string, ScanJob>()
  }
  return globalThis.__billzoScanJobs
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createScanJob(input: ScanSessionPayload): ScanJob {
  const now = new Date().toISOString()
  const job: ScanJob = {
    id: makeId(),
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    input,
    events: [],
  }
  getStore().set(job.id, job)
  return job
}

export function getScanJob(scanJobId: string) {
  return getStore().get(scanJobId)
}

export function updateScanJob(scanJobId: string, updates: Partial<ScanJob>) {
  const job = getStore().get(scanJobId)
  if (!job) return null
  const next = { ...job, ...updates, updatedAt: new Date().toISOString() }
  getStore().set(scanJobId, next)
  return next
}

export function updateScanJobInput(scanJobId: string, updates: Partial<ScanSessionPayload>) {
  const job = getStore().get(scanJobId)
  if (!job) return null
  const next = {
    ...job,
    input: {
      ...job.input,
      ...updates,
    },
    updatedAt: new Date().toISOString(),
  }
  getStore().set(scanJobId, next)
  return next
}

export function pushScanEvent(
  scanJobId: string,
  stage: ScanStage,
  type: ScanStageEvent['type'],
  payload: Record<string, unknown>
) {
  const job = getStore().get(scanJobId)
  if (!job) return null
  const event: ScanStageEvent = {
    id: makeId(),
    scanJobId,
    stage,
    type,
    payload,
    timestamp: Date.now(),
  }
  job.events.push(event)
  job.updatedAt = new Date().toISOString()
  if (stage === 'failed') {
    job.status = 'failed'
  }
  if (type === 'final') {
    job.status = 'completed'
  } else if (job.status === 'pending') {
    job.status = 'processing'
  }
  getStore().set(scanJobId, job)
  return event
}
