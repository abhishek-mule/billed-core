import { vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-for-vitest'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const mockSubmitIntent = vi.fn(async (intent: any) => {
  if (intent.intentType === 'recovery.record_attribution') {
    const { supabaseAdmin } = await import('../supabase-admin')
    const { invoiceId, paymentId, reminderEventId, attributionType, attributionWindowHours, confidenceScore } = intent.payload
    await supabaseAdmin.from('recovery_attributions').insert({
      invoice_id: invoiceId,
      payment_id: paymentId ?? null,
      reminder_event_id: reminderEventId,
      attribution_type: attributionType ?? 'last_touch',
      attribution_window_hours: attributionWindowHours ?? 48,
      confidence_score: confidenceScore ?? 1.0,
    })
  }
  return { accepted: true, intentId: `mock-${intent.intentId || 'intent'}`, error: undefined }
})

vi.mock('@/lib/authority/transport', () => ({
  submitIntent: mockSubmitIntent,
  submitAuthorityIntent: mockSubmitIntent,
  getAuthorityTransport: vi.fn().mockReturnValue(null),
}))
