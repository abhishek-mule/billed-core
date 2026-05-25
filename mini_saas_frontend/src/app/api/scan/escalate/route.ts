import { NextRequest, NextResponse } from 'next/server'
import { getScanJob, updateScanJobInput } from '@/lib/billzo/scan-job-store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json() as { scanJobId?: string; rawText?: string }
  if (!body.scanJobId) {
    return NextResponse.json({ error: 'scanJobId is required' }, { status: 400 })
  }

  const job = getScanJob(body.scanJobId)
  if (!job) {
    return NextResponse.json({ error: 'scan job not found' }, { status: 404 })
  }

  updateScanJobInput(body.scanJobId, {
    rawText: body.rawText || job.input.rawText,
  })

  return NextResponse.json({ ok: true })
}
