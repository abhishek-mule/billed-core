import type { CaptureAssessment, PreprocessRecipe, ReceiptType } from './scan-types'

export function selectPreprocessRecipe(receiptType: ReceiptType, assessment: CaptureAssessment): PreprocessRecipe {
  if (receiptType === 'thermal') return 'thermal_receipt'
  if (receiptType === 'gst_invoice' || receiptType === 'printed') return 'printed_invoice'
  if (receiptType === 'screenshot' || receiptType === 'whatsapp_forward') return 'screenshot_whatsapp'
  if (assessment.brightnessScore < 45 && assessment.blurScore < 45) return 'thermal_receipt'
  return 'default_receipt'
}

export function buildPreprocessSummary(recipe: PreprocessRecipe, assessment: CaptureAssessment, metadata?: Record<string, unknown>) {
  const qualityDelta = Math.max(0, Math.round((assessment.cropConfidence + assessment.brightnessScore + assessment.blurScore) / 3))
  return {
    recipe,
    elapsedMs: Number(metadata?.elapsedMs || 0),
    qualityDelta,
    improved: qualityDelta >= 55,
    metadata: metadata || {},
  }
}
