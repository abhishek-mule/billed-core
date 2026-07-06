import type { QueueCaseInput } from '../work-engine/buildTodayWork'
import type { TimelineEventInput } from '../work-engine/buildTimeline'

export type LoadQueueCases = () => Promise<QueueCaseInput[]>
export type LoadTimeline = (customerId: string) => Promise<TimelineEventInput[]>

export interface UpcomingReminder {
  invoiceId: string
  customerName: string
  amount: number
  nextRecoveryAt: string | null
  isPending: boolean
}

export type LoadUpcomingReminders = () => Promise<UpcomingReminder[]>
