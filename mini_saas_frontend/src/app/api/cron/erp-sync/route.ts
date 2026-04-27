import { NextRequest, NextResponse } from 'next/server'
import { getRedis, popJob, QUEUES, Job } from '@/lib/queue'
import { processErpSyncJob } from '@/lib/orchestration/erp-sync-worker'

export const dynamic = 'force-dynamic'

const MAX_JOBS_PER_RUN = 10
const POLL_INTERVAL_MS = 500

async function processJob(job: Job): Promise<{ success: boolean; error?: string }> {
  console.log(`[Cron] Processing job ${job.id} for ${job.queue}`)
  
  try {
    const result = await processErpSyncJob(job.payload as any)
    
    if (result.success) {
      console.log(`[Cron] Job ${job.id} succeeded`)
    } else {
      console.warn(`[Cron] Job ${job.id} failed: ${result.error}`)
    }
    
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Cron] Job ${job.id} error: ${message}`)
    return { success: false, error: message }
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  
  // Simple auth check (in production, use proper auth)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'cron-secret-change-me'}`) {
    console.warn('[Cron] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const redis = getRedis()
  
  if (!redis) {
    console.warn('[Cron] Redis not configured, skipping')
    return NextResponse.json({ skipped: true, reason: 'Redis not configured' })
  }

  let processed = 0
  let succeeded = 0
  let failed = 0
  const startTime = Date.now()

  console.log(`[Cron] Starting job processing (max ${MAX_JOBS_PER_RUN})`)

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const job = await popJob(QUEUES.erpSync)
    
    if (!job) {
      console.log(`[Cron] No more jobs in queue`)
      break
    }

    processed++
    const result = await processJob(job)
    
    if (result.success) {
      succeeded++
    } else {
      failed++
      // Re-queue with backoff delay
      try {
        const { requeueWithBackoff } = await import('@/lib/queue')
        await requeueWithBackoff(QUEUES.erpSync, job, result.error || 'Job failed')
        console.log(`[Cron] Job ${job.id} requeued with backoff`)
      } catch (requeueError) {
        console.error(`[Cron] Failed to requeue job ${job.id}:`, requeueError)
      }
    }
  }

  const duration = Date.now() - startTime

  const response = {
    processed,
    succeeded,
    failed,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  }

  console.log(`[Cron] Completed:`, response)

  return NextResponse.json(response)
}

export async function POST(request: NextRequest) {
  return GET(request)
}