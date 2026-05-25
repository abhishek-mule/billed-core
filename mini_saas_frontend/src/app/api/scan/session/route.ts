import { NextRequest, NextResponse } from 'next/server'
import { createScanJob, getScanJob, pushScanEvent } from '@/lib/billzo/scan-job-store'
import { validateCapture } from '@/lib/billzo/scan-capture-service'
import { detectInvoiceType } from '@/lib/billzo/scan-classifier-service'
import { buildPreprocessSummary, selectPreprocessRecipe } from '@/lib/billzo/scan-preprocess-service'
import { buildFastHeaderPayload, buildTotalsPayload, runExtractionPasses } from '@/lib/billzo/scan-extraction-service'
import { reconstructCommerce } from '@/lib/billzo/scan-reconstruction-service'
import { projectReview } from '@/lib/billzo/scan-review-service'
import type { ScanSessionPayload } from '@/lib/billzo/scan-types'

export const dynamic = 'force-dynamic'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function processScanJob(scanJobId: string) {
  const job = getScanJob(scanJobId)
  if (!job) return

  try {
    const assessment = validateCapture(job.input)
    pushScanEvent(scanJobId, 'capture_assessment', 'stage', { assessment })

    let latestJob = getScanJob(scanJobId)
    for (let attempt = 0; attempt < 10 && latestJob && !latestJob.input.rawText; attempt++) {
      await delay(200)
      latestJob = getScanJob(scanJobId)
    }

    const input = latestJob?.input || job.input
    const receiptType = detectInvoiceType(input, assessment)
    const recipe = selectPreprocessRecipe(receiptType, assessment)
    const preprocess = buildPreprocessSummary(recipe, assessment, input.preprocessMetadata)
    const passes = await runExtractionPasses(input)

    pushScanEvent(scanJobId, 'fast_header_extraction', 'partial', {
      receiptType,
      preprocess,
      header: buildFastHeaderPayload(passes),
    })

    pushScanEvent(scanJobId, 'totals_locked', 'partial', {
      totals: buildTotalsPayload(passes),
      totalsZoneFound: passes.geometryPass.totalsZoneFound,
    })

    const itemChunks = []
    for (let i = 0; i < passes.productPass.items.length; i += 3) {
      itemChunks.push(passes.productPass.items.slice(i, i + 3))
    }

    if (itemChunks.length === 0) {
      pushScanEvent(scanJobId, 'items_streaming', 'partial', { items: [] })
    } else {
      for (const items of itemChunks) {
        pushScanEvent(scanJobId, 'items_streaming', 'partial', { items })
      }
    }

    const reconstructed = reconstructCommerce(passes, input.merchantMemory)
    pushScanEvent(scanJobId, 'reconstruction_applied', 'partial', {
      supplier: reconstructed.supplier,
      itemCount: reconstructed.items.length,
    })

    const review = projectReview(reconstructed)
    pushScanEvent(scanJobId, 'review_ready', 'final', {
      receiptType,
      preprocess,
      passes,
      review,
      assessment,
    })
  } catch (error: any) {
    pushScanEvent(scanJobId, 'failed', 'error', {
      error: error?.message || 'Scan processing failed',
    })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as ScanSessionPayload

  if (!body?.croppedCompressedImage) {
    return NextResponse.json({ error: 'croppedCompressedImage is required' }, { status: 400 })
  }

  const job = createScanJob(body)
  void processScanJob(job.id)
  return NextResponse.json({ scanJobId: job.id })
}
