export type DecisionAction =
  | 'send_reminder'
  | 'call'
  | 'review'
  | 'wait'
  | 'escalate'
  | 'close'

export interface DecisionInput {
  caseId: string
  customerId: string
  tenantId: string
  totalOverdue: number
  oldestOverdueDays: number
  nextActionType: string
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
  lastReminderAt: string | null
  automationMode: string
}

export interface DecisionOutput {
  action: DecisionAction
  reason: string
  reminderStage?: string
  confidence: number
}

export interface DecisionEngine {
  evaluate(input: DecisionInput): Promise<DecisionOutput>
  name: string
}
