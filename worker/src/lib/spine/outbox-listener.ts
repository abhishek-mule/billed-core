// ============================================================
// Outbox Listener — Push-Based Event Processing via LISTEN/NOTIFY
// ============================================================
// Replaces the 10s polling loop with Postgres LISTEN/NOTIFY.
// When an event is inserted into the outbox table, the
// NOTIFY trigger fires and this listener picks it up.
// Events are processed through the entity queue for FIFO
// ordering per (entity_type, entity_id).
// ============================================================

import postgres from 'postgres'
import { EntityQueue } from './entity-queue'
import { claimOutboxEvent, markEventCompleted, markEventFailed } from '../billzo/outbox'

const entityQueue = new EntityQueue()

export { entityQueue }

export class OutboxListener {
  private sql: postgres.Sql | null = null
  private unlisten: (() => Promise<void>) | null = null
  private processEvent: ((event: any) => Promise<void>) | null = null

  async start(
    databaseUrl: string,
    processor: (event: any) => Promise<void>,
  ): Promise<void> {
    this.processEvent = processor

    this.sql = postgres(databaseUrl, {
      max: 1,
      connection: { application_name: 'outbox-listener' },
    })

    const { unlisten } = await this.sql.listen('outbox_event', async (payload) => {
      if (!payload) return
      try {
        await this.handleNotification(payload)
      } catch {
        // Notification handling errors are logged inside handleNotification
      }
    })

    this.unlisten = unlisten
    console.log('[OutboxListener] Listening for outbox notifications via LISTEN/NOTIFY')
  }

  async stop(): Promise<void> {
    if (this.unlisten) {
      await this.unlisten()
    }
    if (this.sql) {
      await this.sql.end()
    }
    console.log('[OutboxListener] Stopped')
  }

  private async handleNotification(payload: string): Promise<void> {
    const eventId = payload.trim()

    // B-05b: the push path claims through the same atomic gate as the poll
    // path. Losers (already claimed/completed/failed) drop silently here —
    // this is what stops the systematic push+poll double-processing.
    const event = await claimOutboxEvent(eventId)
    if (!event) return

    await entityQueue.enqueue(event, async (evt) => {
      if (!this.processEvent) return
      try {
        await this.processEvent(evt)
        await markEventCompleted(evt.id)
      } catch (err: any) {
        console.error(`[OutboxListener] Event ${evt.id} processing failed: ${err.message}`)
        await markEventFailed(evt.id, (evt.attempts || 0) + 1)
      }
    })
  }
}
