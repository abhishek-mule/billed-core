import type { QueueCaseInput } from '../work-engine/buildTodayWork'
import type { TimelineEventInput } from '../work-engine/buildTimeline'

export type LoadQueueCases = () => Promise<QueueCaseInput[]>
export type LoadTimeline = (customerId: string) => Promise<TimelineEventInput[]>
