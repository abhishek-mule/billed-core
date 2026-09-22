import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OutboxListener } from '../../spine/outbox-listener'

// B-05b: the push listener must consume through the same atomic claim as the
// poll worker. Losers drop silently; winners process AND complete (the old
// code never marked completion, causing systematic push+poll reprocessing).
const mocks = vi.hoisted(() => ({
  claimOutboxEvent: vi.fn(),
  markEventCompleted: vi.fn(),
  markEventFailed: vi.fn(),
}))

vi.mock('../outbox', () => ({
  claimOutboxEvent: mocks.claimOutboxEvent,
  markEventCompleted: mocks.markEventCompleted,
  markEventFailed: mocks.markEventFailed,
}))

const { claimOutboxEvent, markEventCompleted, markEventFailed } = mocks

const EVENT: any = { id: 'evt1', type: 'test.event', tenantId: 't1', attempts: 0 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OutboxListener routing (B-05b)', () => {
  it('drops silently when the claim is lost (no process, no completion)', async () => {
    claimOutboxEvent.mockResolvedValue(null)
    const processEvent = vi.fn()
    const listener = new OutboxListener()
    ;(listener as any).processEvent = processEvent
    await (listener as any).handleNotification('evt1')
    expect(claimOutboxEvent).toHaveBeenCalledWith('evt1')
    expect(processEvent).not.toHaveBeenCalled()
    expect(markEventCompleted).not.toHaveBeenCalled()
    expect(markEventFailed).not.toHaveBeenCalled()
    await listener.stop().catch(() => {})
  })

  it('processes and completes when the claim is won', async () => {
    claimOutboxEvent.mockResolvedValue(EVENT)
    const processEvent = vi.fn().mockResolvedValue(undefined)
    const listener = new OutboxListener()
    ;(listener as any).processEvent = processEvent
    await (listener as any).handleNotification('evt1')
    expect(processEvent).toHaveBeenCalledWith(EVENT)
    expect(markEventCompleted).toHaveBeenCalledWith('evt1')
    expect(markEventFailed).not.toHaveBeenCalled()
    await listener.stop().catch(() => {})
  })

  it('marks failed (not completed) when processing throws', async () => {
    claimOutboxEvent.mockResolvedValue(EVENT)
    const listener = new OutboxListener()
    ;(listener as any).processEvent = vi.fn().mockRejectedValue(new Error('boom'))
    await (listener as any).handleNotification('evt1')
    expect(markEventCompleted).not.toHaveBeenCalled()
    expect(markEventFailed).toHaveBeenCalledWith('evt1', 1)
    await listener.stop().catch(() => {})
  })
})
