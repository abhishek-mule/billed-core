import type { QueueApiItem } from "./api-types"
import type { Invoice, CustomerPromise } from "./types"
import { formatINR } from "@/lib/utils"

export type PriorityCardType =
  | "recovery"
  | "batch_reminder"
  | "promise_followup"
  | "high_risk"

export interface PriorityCard {
  id: string
  type: PriorityCardType
  score: number
  customerId?: string
  customerName?: string
  amount: number
  overdueDays: number
  summary: string
  detail: string
  badge: { text: string; color: "red" | "amber" | "blue" | "green" | "slate" }
  recommendedAction: { id: string; label: string }
  linkHref?: string
}

interface EngineInput {
  queueItems: QueueApiItem[]
  unpaidInvoices: Invoice[]
  promises: CustomerPromise[]
}

function normalize(val: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.round((val / max) * 100))
}

function buildRecoveryCards(items: QueueApiItem[], maxAmount: number): PriorityCard[] {
  return items
    .filter(i => i.recommendedAction.id !== "wait" && i.recommendedAction.id !== "record_payment")
    .map(i => {
      const moneyImpact = normalize(i.amount, maxAmount) * 0.4
      const urgency = Math.min(100, i.overdue * 2) * 0.3
      const relationshipRisk = (
        i.engagementState === "ghosting" ? 100
        : i.promiseStatus === "broken" ? 90
        : i.overdue > 30 ? 70
        : 30
      ) * 0.2
      const successProb = (
        i.recommendedAction.id === "call" ? 70
        : i.recommendedAction.id === "send_reminder" ? 50
        : 40
      ) * 0.1
      const score = Math.round(moneyImpact + urgency + relationshipRisk + successProb)

      const isUrgent = i.overdue > 30 || i.promiseStatus === "broken" || i.engagementState === "ghosting"

      const detail = isUrgent
        ? "Customer at risk. A personal call works best for this case."
        : i.recommendedAction.id === "call"
          ? "Direct conversation improves recovery chances."
          : "Send a WhatsApp reminder to follow up."

      const badgeColor = isUrgent ? "red" as const : "amber" as const

      return {
        id: `recovery-${i.caseId}`,
        type: "recovery" as const,
        score,
        customerId: i.customerId,
        customerName: i.customer.name,
        amount: i.amount,
        overdueDays: i.overdue,
        summary: isUrgent
          ? `Recover ${formatINR(i.amount)} urgently`
          : `Recover ${formatINR(i.amount)}`,
        detail,
        badge: {
          text: isUrgent ? `${i.overdue}d overdue` : `${i.overdue}d overdue`,
          color: badgeColor,
        },
        recommendedAction: i.recommendedAction,
        linkHref: `/parties/${i.customerId}`,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function buildBatchReminderCard(invoices: Invoice[]): PriorityCard | null {
  const ready = invoices.filter(inv => {
    const outstanding = (inv.total || 0) - (inv.paidAmount || 0)
    if (outstanding <= 0) return false
    const dueAt = inv.dueAt ? new Date(inv.dueAt) : null
    if (!dueAt) return false
    const daysSinceDue = (Date.now() - dueAt.getTime()) / 86400000
    return daysSinceDue >= 7 && (!inv.lastReminderAt || (Date.now() - new Date(inv.lastReminderAt).getTime()) / 86400000 >= 7)
  })

  if (ready.length < 2) return null

  const totalAmount = ready.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.paidAmount || 0)), 0)
  const byCustomer = new Map<string, { name: string; amount: number }>()
  for (const inv of ready) {
    if (!byCustomer.has(inv.customerId)) {
      byCustomer.set(inv.customerId, { name: inv.customerName, amount: 0 })
    }
    byCustomer.get(inv.customerId)!.amount += (inv.total || 0) - (inv.paidAmount || 0)
  }

  return {
    id: "batch-reminder",
    type: "batch_reminder" as const,
    score: Math.min(80, normalize(totalAmount, 100000) * 0.6 + ready.length * 5),
    amount: totalAmount,
    overdueDays: 0,
    summary: `${ready.length} customers ready for reminders`,
    detail: `Potential collection: ${formatINR(totalAmount)}. Grace period completed, no recent communication.`,
    badge: { text: `${ready.length} pending`, color: "blue" as const },
    recommendedAction: { id: "send_reminder", label: "Review & Send" },
    linkHref: "/recovery/manage",
  }
}

function buildPromiseFollowupCards(promises: CustomerPromise[]): PriorityCard[] {
  return promises
    .filter(p => p.status === "active")
    .map(p => {
      const dueDate = new Date(p.dueDate)
      const overdueMs = Date.now() - dueDate.getTime()
      const overdueDays = Math.max(0, Math.floor(overdueMs / 86400000))
      const urgency = Math.min(100, overdueDays * 10) * 0.3
      const moneyImpact = normalize(p.amount, 100000) * 0.4
      const reliabilityRisk = 60 * 0.2
      const score = Math.round(moneyImpact + urgency + reliabilityRisk + 50 * 0.1)

      const label = overdueDays > 0
        ? `Follow up on payment promise`
        : `Promise due today`

      const promiseBadgeColor = overdueDays > 0 ? "red" as const : "amber" as const

      return {
        id: `promise-${p.id}`,
        type: "promise_followup" as const,
        score,
        customerId: p.customerId,
        amount: p.amount,
        overdueDays,
        summary: label,
        detail: `Promised ${formatINR(p.amount)}${overdueDays > 0 ? ` ${overdueDays}d ago` : " today"}. No payment received yet.`,
        badge: {
          text: overdueDays > 0 ? `${overdueDays}d overdue` : "Due today",
          color: promiseBadgeColor,
        },
        recommendedAction: { id: "send_reminder", label: "Send Reminder" },
        linkHref: p.customerId ? `/parties/${p.customerId}` : undefined,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function buildHighRiskCard(items: QueueApiItem[]): PriorityCard | null {
  const highValue = items.find(i => i.amount >= 100000 && i.overdue > 20)
  if (!highValue) return null
  return {
    id: `highrisk-${highValue.caseId}`,
    type: "high_risk" as const,
    score: 95,
    customerId: highValue.customerId,
    customerName: highValue.customer.name,
    amount: highValue.amount,
    overdueDays: highValue.overdue,
    summary: `High value customer at risk`,
    detail: `Pending ${formatINR(highValue.amount)} — do not send automated legal messages. Call personally.`,
    badge: { text: "High risk", color: "red" as const },
    recommendedAction: { id: "call", label: "Call Now" },
    linkHref: `/parties/${highValue.customerId}`,
  }
}

export function computePriorityCards(input: EngineInput): PriorityCard[] {
  const { queueItems, unpaidInvoices, promises } = input

  const amounts = queueItems.map(i => i.amount)
  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 100000

  const cards: PriorityCard[] = [
    ...buildRecoveryCards(queueItems, maxAmount),
    ...buildPromiseFollowupCards(promises),
  ]

  const batchCard = buildBatchReminderCard(unpaidInvoices)
  if (batchCard) cards.push(batchCard)

  const riskCard = buildHighRiskCard(queueItems)
  if (riskCard) {
    const existingIdx = cards.findIndex(c => c.customerId === riskCard.customerId)
    if (existingIdx >= 0) {
      cards[existingIdx] = { ...cards[existingIdx], score: Math.max(cards[existingIdx].score, riskCard.score), type: "high_risk" }
    } else {
      cards.push(riskCard)
    }
  }

  return cards.sort((a, b) => b.score - a.score)
}


