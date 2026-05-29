import type { SituationCandidate, OperationalSituation, RecommendedAction, ResolutionCondition } from './types'
import { renderCashflowTemplate } from './templates/cashflow'
import { renderPaymentAnomalyTemplate } from './templates/paymentAnomaly'
import { renderCommunicationFailureTemplate } from './templates/communicationFailure'
import { PIPELINE_VERSION } from './types'

function computeFingerprint(candidate: SituationCandidate): string {
  const raw = `${candidate.correlationKey}:${candidate.situationType}:${PIPELINE_VERSION}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `${candidate.situationType}_${Math.abs(hash).toString(36)}`
}

export function synthesize(candidates: SituationCandidate[], tenantId: string): OperationalSituation[] {
  return candidates.map((c, i) => {
    const fingerprint = computeFingerprint(c)
    const seed = c.narrativeSeed

    const rendered = renderSituation(c)

    const action = determineAction(c)
    const resolution = determineResolution(c)
    const windowInfo = seed.windowInfo

    return {
      id: fingerprint,
      tenantId,
      situationType: c.situationType,
      situationFingerprint: fingerprint,
      priorityScore: c.priorityScore,
      urgency: seed.maxUrgency as any,
      headline: rendered.headline,
      narrative: rendered.narrative,
      affectedEntities: c.affectedEntities,
      recommendedAction: action,
      decisionWindowStart: windowInfo?.bestStart || null,
      decisionWindowEnd: windowInfo?.bestEnd || null,
      resolutionCondition: resolution,
      autoExecutable: action.type === 'send_reminder' || action.type === 'monitor',
      requiresApproval: action.type === 'escalate' || action.type === 'call',
      situationState: 'active',
      maxDisplayOrder: i,
      expiresAt: windowInfo?.bestEnd || null,
      lastSeenAt: null,
      dismissalCount: 0,
      pipelineVersion: PIPELINE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })
}

function renderSituation(candidate: SituationCandidate): { headline: string; narrative: string } {
  switch (candidate.situationType) {
    case 'cashflow_cluster':
      return renderCashflowTemplate(candidate.narrativeSeed)
    case 'payment_anomaly':
      return renderPaymentAnomalyTemplate(candidate.narrativeSeed)
    case 'communication_failure':
      return renderCommunicationFailureTemplate(candidate.narrativeSeed)
    default:
      return renderCashflowTemplate(candidate.narrativeSeed)
  }
}

function determineAction(candidate: SituationCandidate): RecommendedAction {
  const seed = candidate.narrativeSeed
  const { delayLikelihood } = seed.customerBehavior
  const isCritical = seed.maxUrgency === 'critical'

  switch (candidate.situationType) {
    case 'cashflow_cluster': {
      if (seed.stageLabel === 'Critical escalation') {
        return {
          type: 'escalate',
          reason: `${seed.customerName} has reached critical escalation stage. Manual intervention recommended.`,
          expectedOutcome: 'Direct contact may recover payment faster than automated reminders',
        }
      }
      if (isCritical && seed.entityCount >= 3) {
        return {
          type: 'call',
          reason: `${seed.entityCount} invoices totaling ₹${seed.totalAmount.toLocaleString('en-IN')} overdue. Call recommended.`,
          expectedOutcome: 'Phone call has highest conversion for high-value overdue accounts',
        }
      }
      if (delayLikelihood !== null && delayLikelihood > 0.6) {
        return {
          type: 'wait',
          reason: 'Customer shows strategic delay pattern — aggressive follow-up may reduce payment probability',
          expectedOutcome: 'Let 24-48h pass before next reminder',
        }
      }
      if (isCritical) {
        return {
          type: 'send_reminder',
          reason: `Send escalation reminder to ${seed.customerName}`,
          expectedOutcome: 'Customer likely to respond to urgency-based reminder',
        }
      }
      return {
        type: 'monitor',
        reason: `₹${seed.totalAmount.toLocaleString('en-IN')} outstanding — no urgent action needed`,
        expectedOutcome: 'Continue standard reminder cadence',
      }
    }

    case 'payment_anomaly': {
      if (!seed.customerName || seed.entityCount === 0) {
        return {
          type: 'review',
          reason: 'Orphan payment requires manual reconciliation',
          expectedOutcome: 'Identify sender and match to outstanding invoice or refund',
        }
      }
      return {
        type: 'send_reminder',
        reason: `${seed.customerName} has a stale partial payment of ₹${seed.totalAmount.toLocaleString('en-IN')}`,
        expectedOutcome: 'Remind customer of outstanding balance and request full payment',
      }
    }

    case 'communication_failure': {
      if (isCritical) {
        return {
          type: 'call',
          reason: `WhatsApp delivery failing for ${seed.customerName} — switch to phone call`,
          expectedOutcome: 'Direct call may recover contact and payment',
        }
      }
      return {
        type: 'monitor',
        reason: `${seed.customerName} is not reading WhatsApp reminders`,
        expectedOutcome: 'Evaluate if channel switch is needed',
      }
    }

    default:
      return {
        type: 'monitor',
        reason: 'Routine situation — no immediate action required',
        expectedOutcome: 'Continue monitoring',
      }
  }
}

function determineResolution(candidate: SituationCandidate): ResolutionCondition | null {
  switch (candidate.situationType) {
    case 'cashflow_cluster':
      return { field: 'status', table: 'invoices', value: 'paid' }
    case 'payment_anomaly':
      return { field: 'status', table: 'payments', value: 'reconciled' }
    case 'communication_failure': {
      // Resolves when a message is read (channel re-established)
      return { field: 'read_at', table: 'whatsapp_events', value: 'not_null' }
    }
    default:
      return null
  }
}
