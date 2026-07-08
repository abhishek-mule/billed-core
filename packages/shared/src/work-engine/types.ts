export type WorkAction =
  | 'receive_payment'
  | 'send_reminder'
  | 'call'
  | 'review'
  | 'wait'

export interface ActionTarget {
  entity: 'customer' | 'invoice' | 'payment' | 'promise'
  id: string
}

export interface Action {
  type: WorkAction
  label: string
  target?: ActionTarget
}

export type MemoryCategory = 'timing' | 'channel' | 'payment' | 'response' | 'reliability'

export interface MerchantMemory {
  category: MemoryCategory
  confidence: number
  observation: string
  customerName?: string
  observedPayments?: number
}

export interface BusinessInsight {
  observation: string
  type?: 'trend' | 'pattern' | 'improvement' | 'alert'
}

export type Severity = 'critical' | 'high' | 'normal' | 'low'

export const SeverityWeight: Record<Severity, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
}

export interface WorkItem {
  id: string
  customerId: string
  customerName: string
  customerPhone?: string
  headline: string
  reason: string
  severity: Severity
  primaryAction: Action
  secondaryAction?: Action
  moneyImpact: number
  dueAt?: string
}

export interface WorkContext {
  now: Date
  timezone: string
  locale: string
}

export interface CashMetric {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
  subtitle?: string
  emptyLabel?: string
}

export interface TodaySectionPayload {
  items: WorkItem[]
  empty?: {
    headline: string
    subtitle?: string
    checklist?: string[]
    autoActions?: string[]
    nextAction?: { when: string; label: string; customerName?: string; type: 'reminder' | 'call' | 'review' | 'wait'; status: string; reason?: string }
    scheduleLink?: string
    action?: Action
  }
}

export interface CashSectionPayload {
  metrics: CashMetric[]
}

export interface ActivityEvent {
  occurredAt: string
  label: string
  detail: string
}

export interface ActivitySectionPayload {
  events: ActivityEvent[]
  hasWorkItems?: boolean
}

export interface DashboardSection<T = unknown> {
  type: 'today' | 'cash' | 'activity' | 'memories'
  priority: number
  title: string
  payload: T
  collapsible?: boolean
}

export type AnyDashboardSection =
  | DashboardSection<TodaySectionPayload>
  | DashboardSection<CashSectionPayload>
  | DashboardSection<ActivitySectionPayload>
  | DashboardSection<MemoriesSectionPayload>

export interface CashPosition {
  outstanding: number
  collectedToday: number
  expectedToday: number
  customerCount: number
}

export interface AutomationPlanItem {
  customerId: string
  customerName: string
  status: 'scheduled' | 'waiting' | 'manual_required' | 'completed'
  nextAction: {
    type: 'reminder' | 'call' | 'review' | 'wait'
    scheduledAt?: string
    reason: string
  }
}

export interface DashboardView {
  work: WorkItem[]
  cash: CashPosition
  activity: ActivityItem[]
  memories?: MerchantMemory[]
  insights?: BusinessInsight[]
  automationPlan: AutomationPlanItem[]
}

export interface MemoriesSectionPayload {
  memories: MerchantMemory[]
  insights?: BusinessInsight[]
}

export interface CustomerView {
  header: {
    name: string
    headline: string
    today: string
  }
  money: {
    outstanding: number
    lifetimePurchases: number
    lastPayment?: string
  }
  actions: WorkItem[]
  evidence: {
    invoices: InvoiceSummary[]
    payments: PaymentSummary[]
    timeline: TimelineItem[]
  }
}

export interface InvoiceSummary {
  id: string
  invoiceNumber?: string
  total: number
  paidAmount: number
  status: string
  dueAt?: string
  createdAt: string
}

export interface PaymentSummary {
  id: string
  amount: number
  method?: string
  createdAt: string
}

export interface TimelineItem {
  date: string
  type: 'reminder' | 'promise' | 'payment' | 'call' | 'system'
  label: string
  detail: string
  amount?: number
}

export interface ActivityItem {
  occurredAt: string
  label: string
  detail: string
}