import type {
  ProjectionTransportState,
  ProjectionDeliveryHealth,
} from '@billzo/shared'

export { ProjectionTransportState, ProjectionDeliveryHealth }

export const TRANSPORT_PRECEDENCE: Record<ProjectionTransportState, number> = {
  queued: 1,
  sent: 2,
  server_ack: 3,
  delivered: 4,
  received: 4,
  read: 5,
  failed_terminal: 6,
}

export const LOCKED_STATES: ReadonlySet<ProjectionTransportState> = new Set([
  'failed_terminal',
])

export interface ProjectionState {
  transportState: ProjectionTransportState
  deliveryHealth: ProjectionDeliveryHealth
  latestEventSequence: bigint
  occurredAt: string
  lastEventId: string
  failureCount: number
  lastSuccessfulDeliveryAt: string | null
}

export interface IncomingEvent {
  transportState: ProjectionTransportState
  deliveryHealth: ProjectionDeliveryHealth
  eventSequence: bigint
  occurredAt: string
  eventId: string
}

export type RejectionReason =
  | 'higher_precedence'
  | 'newer_sequence'
  | 'stale'
  | 'duplicate'
  | 'terminal_failure_locked'

export interface ProjectionResolution {
  shouldApply: boolean
  reason: RejectionReason
  nextState: ProjectionState | null
}

export function resolveProjectionState(
  current: ProjectionState | null,
  incoming: IncomingEvent,
): ProjectionResolution {
  if (current === null) {
    return {
      shouldApply: true,
      reason: 'higher_precedence',
      nextState: buildNextState(null, incoming),
    }
  }

  if (LOCKED_STATES.has(current.transportState)) {
    return {
      shouldApply: false,
      reason: 'terminal_failure_locked',
      nextState: null,
    }
  }

  const incomingRank = TRANSPORT_PRECEDENCE[incoming.transportState]
  const currentRank = TRANSPORT_PRECEDENCE[current.transportState]

  if (incomingRank > currentRank) {
    return {
      shouldApply: true,
      reason: 'higher_precedence',
      nextState: buildNextState(current, incoming),
    }
  }

  if (incomingRank === currentRank) {
    if (incoming.eventSequence > current.latestEventSequence) {
      return {
        shouldApply: true,
        reason: 'newer_sequence',
        nextState: buildNextState(current, incoming),
      }
    }
    if (incoming.eventSequence === current.latestEventSequence) {
      return {
        shouldApply: false,
        reason: 'duplicate',
        nextState: null,
      }
    }
    return {
      shouldApply: false,
      reason: 'stale',
      nextState: null,
    }
  }

  return {
    shouldApply: false,
    reason: 'stale',
    nextState: null,
  }
}

function isFailure(incoming: IncomingEvent): boolean {
  return (
    incoming.transportState === 'failed_terminal' ||
    incoming.deliveryHealth === 'retrying' ||
    incoming.deliveryHealth === 'degraded'
  )
}

function isDeliverySuccess(state: ProjectionTransportState): boolean {
  return state === 'delivered' || state === 'read' || state === 'received'
}

function buildNextState(
  current: ProjectionState | null,
  incoming: IncomingEvent,
): ProjectionState {
  return {
    transportState: incoming.transportState,
    deliveryHealth: incoming.deliveryHealth,
    latestEventSequence: incoming.eventSequence,
    occurredAt: incoming.occurredAt,
    lastEventId: incoming.eventId,
    failureCount: current
      ? (isFailure(incoming) ? current.failureCount + 1 : current.failureCount)
      : (isFailure(incoming) ? 1 : 0),
    lastSuccessfulDeliveryAt:
      isDeliverySuccess(incoming.transportState)
        ? incoming.occurredAt
        : (current?.lastSuccessfulDeliveryAt ?? null),
  }
}
