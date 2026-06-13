// ============================================================
// API Request Types
// ============================================================

export type RecoveryActionPayload = Record<string, unknown> & {
  amount?: number
  method?: string
  dueDate?: string
  snoozeDays?: number
  notes?: string
  invoiceId?: string
}

export interface RecoveryActionRequest {
  caseId: string
  action: string
  payload?: RecoveryActionPayload
}

export interface RecordPaymentRequest {
  invoiceId: string
  amount: number
  source: string
  notes?: string
}

export interface OverrideRequest {
  invoiceId: string
  reason?: string
  warningAcked?: boolean
}

export interface CreateSubscriptionRequest {
  tenantName?: string
  plan: 'pro' | 'growth'
  customerEmail?: string
  customerPhone?: string
}

export interface WhatsAppPairRequest {
  phone: string
  otp: string
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiErrorResponse {
  error: string
}

export interface QueueApiItem {
  rank: number
  caseId: string
  customerId: string
  customer: { name: string; phone: string; tier?: string }
  amount: number
  overdue: number
  reminderCount: number
  recoveryState: string
  engagementState: string
  promiseStatus: string | null
  lastActivityAt: string | null
  attentionScore: number
  priority: number
  priorityReason: string
  recommendedAction: { id: string; label: string }
  secondaryActions: Array<{ id: string; label: string }>
}

export interface QueueApiSummary {
  collectibleToday: number
  outstanding: number
  activeCases: number
  recoveredToday: number
  recoveredThisWeek: number
  recoveredThisMonth: number
  recoveredAttributed: number
  totalCollectedToday: number
  dueToday: number
  queueSize: number
  todaySales: number
  monthSales: number
  lowStockItems: number
  totalCustomers: number
  vipCustomers: number
  blockedRemindersToday: number
}

export interface QueueApiResponse {
  items: QueueApiItem[]
  summary: QueueApiSummary
}

export interface RecoveryActionResponse {
  success?: boolean
  error?: string
  paymentId?: string
}

export interface RecordPaymentResponse {
  success: boolean
  paymentId: string
}

export interface OverrideResponse {
  requiresAck?: boolean
  success?: boolean
  error?: string
}

export interface CreateSubscriptionResponse {
  orderId: string
  amount: number
  currency: string
  plan: string
  keyId: string
}

export interface RecoveryMetricsResponse {
  today: number
  week: number
  month: number
  total: number
}

// ============================================================
// POS Types
// ============================================================

export interface POSSuccessResult {
  id: string
  number: string
  party: string
  partyPhone?: string
  amount: number
  status: string
  date: string
  method: string
  items: Array<{
    name: string
    hsn?: string
    qty: number
    price: number
    gstRate: number
  }>
}
