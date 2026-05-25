import type { CaptureAssessment, ScanSessionPayload } from './scan-types'

export function validateCapture(input: ScanSessionPayload): CaptureAssessment {
  const assessment = input.captureAssessment
  const guidance = [...assessment.guidance]

  if (!assessment.receiptDetected) guidance.push('Receipt not clearly detected')
  if (assessment.blurScore < 45) guidance.push('Hold steady')
  if (assessment.brightnessScore < 40) guidance.push('Low light detected')
  if (assessment.tiltScore < 40) guidance.push('Keep receipt straight')

  return {
    ...assessment,
    guidance: Array.from(new Set(guidance)).slice(0, 4),
  }
}
