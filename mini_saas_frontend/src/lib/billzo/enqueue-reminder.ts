import crypto from 'crypto'
import { writeOutboxEvent } from './outbox'
import { EventType } from '@billzo/shared'

export interface EnqueueReminderInput {
  tenantId: string
  invoiceId: string
  customerId: string
  caseId?: string
  trigger: 'manual' | 'scheduled' | 'retry' | 'auto'
  override?: boolean
  stage?: string
  dueDate?: string
}

export interface EnqueueReminderResult {
  reminderId: string
}

export async function enqueueReminder(
  input: EnqueueReminderInput,
): Promise<EnqueueReminderResult> {
  const reminderId = crypto.randomUUID()

  await writeOutboxEvent({
    type: EventType.SEND_MESSAGE_INTENDED,
    tenantId: input.tenantId,
    entityId: input.invoiceId,
    payload: {
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      caseId: input.caseId || null,
      messageType: 'reminder',
      trigger: input.trigger,
      override: input.override || false,
      reminderId,
      stage: input.stage || 't0_soft',
      dueDate: input.dueDate || null,
    },
    correlationId: `reminder:${input.invoiceId}:${reminderId}`,
  })

  return { reminderId }
}
