// ============================================================
// Per-Entity FIFO Queue
// ============================================================
// Ensures events for the same (entity_type, entity_id) are
// processed in strict sequence_no order. If event N fails,
// event N+1 will not be processed until N is resolved.
// Events for different entities can be processed concurrently.
// ============================================================

export type ProcessFn = (event: any) => Promise<void>

interface QueuedItem {
  event: any
  resolve: () => void
  reject: (err: Error) => void
}

export class EntityQueue {
  private queues = new Map<string, QueuedItem[]>()
  private processing = new Set<string>()

  private entityKey(event: any): string {
    return `${event.entityType ?? event.entity_type ?? 'unknown'}:${event.entityId ?? event.entity_id ?? event.id}`
  }

  async enqueue(event: any, processFn: ProcessFn): Promise<void> {
    const key = this.entityKey(event)

    if (!this.processing.has(key)) {
      this.processing.add(key)
      try {
        await processFn(event)
      } finally {
        this.processing.delete(key)
        setImmediate(() => this.processNext(key, processFn))
      }
      return
    }

    return new Promise<void>((resolve, reject) => {
      const queue = this.queues.get(key) ?? []
      queue.push({ event, resolve, reject })
      this.queues.set(key, queue)
    })
  }

  private processNext(key: string, processFn: ProcessFn): void {
    const queue = this.queues.get(key)
    if (!queue || queue.length === 0) {
      this.queues.delete(key)
      return
    }

    queue.sort((a, b) => {
      const sa = a.event.sequence_no ?? a.event.sequenceNo ?? 0
      const sb = b.event.sequence_no ?? b.event.sequenceNo ?? 0
      return sa - sb
    })

    const next = queue.shift()!
    if (queue.length === 0) this.queues.delete(key)

    this.processing.add(key)
    processFn(next.event)
      .then(() => next.resolve())
      .catch((err: Error) => next.reject(err))
      .finally(() => {
        this.processing.delete(key)
        setImmediate(() => this.processNext(key, processFn))
      })
  }

  get activeProcessing(): number {
    return this.processing.size
  }

  get queuedCount(): number {
    let count = 0
    for (const q of this.queues.values()) {
      count += q.length
    }
    return count
  }
}
