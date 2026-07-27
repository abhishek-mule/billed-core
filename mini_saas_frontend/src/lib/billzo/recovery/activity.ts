'use client'

import type { RecoveryActivityType } from '../types'

export async function logRecoveryActivity({
  invoiceId,
  type,
  actor,
  customerId,
  metadata,
}: {
  invoiceId: string
  type: RecoveryActivityType
  actor: 'merchant' | 'customer' | 'system'
  customerId?: string
  metadata?: Record<string, unknown>
}) {
  try {
    const res = await fetch('/api/recovery/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, type, actor, customerId, metadata }),
    })
    if (!res.ok) {
      console.error('[RecoveryActivity] Failed:', type, invoiceId, res.status, await res.text())
    }
  } catch (err) {
    console.error('[RecoveryActivity] Error:', type, invoiceId, err)
  }
}
