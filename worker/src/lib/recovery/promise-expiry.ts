import { supabaseAdmin } from '../billzo/supabase-admin'
import { writeOutboxEvent } from '../billzo/outbox'

const SCANNER_INTERVAL_MS = 5 * 60 * 1000
const BATCH_SIZE = 50

let intervalHandle: ReturnType<typeof setInterval> | null = null

export function startPromiseExpiryScanner(): void {
  if (intervalHandle) return
  runExpiryScan().catch(err =>
    console.error('[PromiseExpiry] Initial scan failed:', err),
  )
  intervalHandle = setInterval(() => {
    runExpiryScan().catch(err =>
      console.error('[PromiseExpiry] Scan failed:', err),
    )
  }, SCANNER_INTERVAL_MS)
  console.log(`[PromiseExpiry] Scanner started (every ${SCANNER_INTERVAL_MS / 60000}min)`)
}

export function stopPromiseExpiryScanner(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[PromiseExpiry] Scanner stopped')
  }
}

export async function runExpiryScan(): Promise<void> {
  const now = new Date().toISOString()

  const { data: expired, error } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, tenant_id, customer_id')
    .eq('recovery_state_v2', 'promised')
    .lt('promise_to_pay_date', now)
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[PromiseExpiry] Query failed:', error)
    return
  }

  if (!expired || expired.length === 0) return

  console.log(`[PromiseExpiry] Found ${expired.length} expired promise(s)`)

  for (const rc of expired) {
    try {
      await writeOutboxEvent({
        type: 'promise.broken' as any,
        tenantId: rc.tenant_id,
        entityId: rc.id,
        payload: {
          caseId: rc.id,
          customerId: rc.customer_id,
          reason: 'Promise to pay date expired with no payment detected',
        },
        correlationId: `promise-expiry:${rc.id}`,
      })
    } catch (err: any) {
      console.error(`[PromiseExpiry] Failed to emit promise.broken for ${rc.id}:`, err.message)
    }
  }

  // Recurse if more than batch size
  if (expired.length >= BATCH_SIZE) {
    await runExpiryScan()
  }
}
