import type { AttentionItem, CorrelationGroup } from './types'

export function correlate(items: AttentionItem[]): Map<string, CorrelationGroup> {
  const groups = new Map<string, CorrelationGroup>()

  for (const item of items) {
    const key = item.correlationKey || `uncategorized:${item.tenantId}:${item.entityType}:${item.entityId}`

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        situationType: key.startsWith('cashflow') ? 'cashflow_cluster'
          : key.startsWith('payment') ? 'payment_anomaly'
          : key.startsWith('inventory') ? 'inventory_risk'
          : key.startsWith('compliance') ? 'compliance_risk'
          : 'communication_failure',
        attentionIds: [],
        entities: { invoices: new Set(), customers: new Set(), payments: new Set() },
        signals: {
          totalAmount: 0,
          maxUrgency: 'low',
          avgConfidence: 0,
          maxDismissalCount: 0,
          stageLevels: [],
          customerIds: new Set(),
          readRate: null,
          delayLikelihood: null,
        },
      })
    }

    const group = groups.get(key)!
    group.attentionIds.push(item.id)

    if (item.entityType === 'invoice') group.entities.invoices.add(item.entityId)
    if (item.entityType === 'customer') group.entities.customers.add(item.entityId)
    if (item.entityType === 'payment') group.entities.payments.add(item.entityId)

    const urgencyRank = { critical: 4, high: 3, medium: 2, low: 1 }
    if (urgencyRank[item.urgency] > urgencyRank[group.signals.maxUrgency]) {
      group.signals.maxUrgency = item.urgency
    }

    group.signals.avgConfidence += item.confidence
    group.signals.totalAmount += (item.signalData?.total as number) || 0
    group.signals.stageLevels.push((item.signalData?.stage_score as number) || 0)

    const cid = item.signalData?.customer_id as string | undefined
    if (cid) group.signals.customerIds.add(cid)

    const dl = item.signalData?.delay_likelihood as number | undefined
    if (dl !== undefined && (group.signals.delayLikelihood === null || dl > group.signals.delayLikelihood)) {
      group.signals.delayLikelihood = dl
    }
  }

  // Finalize averages
  for (const group of groups.values()) {
    group.signals.avgConfidence = group.attentionIds.length > 0
      ? group.signals.avgConfidence / group.attentionIds.length
      : 0.5
  }

  return groups
}
