import type { ClaimedWebhookInboxRow } from '@billzo/shared/whatsapp'

/**
 * Minimal supabase-js-shaped fake for the webhook consumer tests.
 *
 * Supports the operators the shared server/domain layer and the drain use:
 * select/eq/or/not/filter/limit/maybeSingle for reads, insert/upsert/update
 * for writes, and rpc for claim_next_webhook_events. Table contents are
 * seeded in-memory and every call is appended to `calls` for ordering
 * assertions.
 */

export interface FakeSupabasePlan {
  tables?: Record<string, unknown[]>
  claimRows?: ClaimedWebhookInboxRow[]
  rpcError?: { message: string }
}

type Call = {
  table?: string
  op: string
  rows?: unknown
  options?: unknown
  patch?: unknown
  args?: unknown
  ops?: Array<{ kind: string; col?: string; val?: unknown; n?: number }>
}

export function makeFakeClient(plan: FakeSupabasePlan = {}) {
  const data = new Map<string, unknown[]>()
  for (const [table, rows] of Object.entries(plan.tables ?? {})) {
    data.set(table, rows)
  }

  const calls: Call[] = []

  const applyOps = (table: string, ops: Call['ops']): unknown[] => {
    let out = data.get(table) ?? []
    for (const op of ops ?? []) {
      if (op.kind === 'eq') out = out.filter((r) => String((r as any)[op.col!]) === String(op.val))
      if (op.kind === 'not') out = out.filter((r) => (r as any)[op.col!] != null)
      if (op.kind === 'limit') out = out.slice(0, op.n)
    }
    return out
  }

  const makeReadChain = (table: string) => {
    const chain: any = {}
    const ops: Call['ops'] = []
    chain.select = () => {
      ops.push({ kind: 'select' })
      return chain
    }
    chain.eq = (col: string, val: unknown) => {
      ops.push({ kind: 'eq', col, val })
      return chain
    }
    chain.not = (col: string, _op: string, val: unknown) => {
      ops.push({ kind: 'not', col, val })
      return chain
    }
    chain.or = () => chain
    chain.filter = () => chain
    chain.limit = (n: number) => {
      ops.push({ kind: 'limit', n })
      return chain
    }
    chain.maybeSingle = async () => {
      calls.push({ table, op: 'maybeSingle', ops: [...(ops ?? [])] })
      const rows = applyOps(table, ops)
      return { data: rows[0] ?? null, error: null }
    }
    return chain
  }

  const client: any = {
    from(table: string) {
      const chain = makeReadChain(table)

      chain.insert = (rows: unknown) => {
        calls.push({ table, op: 'insert', rows })
        const s = makeReadChain(table)
        s.maybeSingle = async () => {
          calls.push({ table, op: 'maybeSingle-after-insert' })
          const first = Array.isArray(rows) ? (rows as unknown[])[0] : rows
          return { data: first ? { ...(first as object), id: (first as any).id ?? `${table}_1` } : null, error: null }
        }
        s.select = () => s
        return s
      }

      chain.upsert = (rows: unknown, options: unknown) => {
        calls.push({ table, op: 'upsert', rows, options })
        return chain
      }

      chain.update = (patch: unknown) => {
        calls.push({ table, op: 'update', patch })
        const conds: Array<{ col: string; val: unknown }> = []
        const tail: any = {}
        tail.eq = (col: string, val: unknown) => {
          conds.push({ col, val })
          calls.push({ table, op: 'update-eq', patch, args: { col, val } })
          return tail
        }
        tail.select = (_cols?: unknown) => {
          calls.push({ table, op: 'update-select' })
          return tail
        }
        tail.maybeSingle = async () => {
          calls.push({ table, op: 'update-maybeSingle' })
          const rows = data.get(table) ?? []
          const matched = rows.filter((r) =>
            conds.every((c) => String((r as any)[c.col]) === String(c.val)),
          )
          for (const m of matched) Object.assign(m as any, patch)
          return { data: (matched[0] as any) ?? null, error: null }
        }
        tail.then = (onFulfilled: (v: unknown) => unknown) => onFulfilled({ error: null })
        return tail
      }

      return chain
    },
    rpc(fn: string, args: unknown) {
      if (fn !== 'claim_next_webhook_events') {
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } })
      }
      calls.push({ op: 'rpc', args })
      if (plan.rpcError) return Promise.resolve({ data: null, error: plan.rpcError })
      return Promise.resolve({ data: plan.claimRows ?? [], error: null })
    },
  }

  return { client, calls, data }
}

export type FakeClientResult = ReturnType<typeof makeFakeClient>

/** A connection row the server returns for a known phone_number_id. */
export function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wa_1',
    tenant_id: 't1',
    waba_id: 'waba_1',
    phone_number_id: 'ph_1',
    display_name: 'BillZo',
    provider: 'gupshup',
    status: 'connected',
    last_error: null,
    ...overrides,
  }
}

/** A claimed inbox row as the RPC returns per batch. */
export function claimedRow(overrides: Partial<ClaimedWebhookInboxRow> = {}): ClaimedWebhookInboxRow {
  return {
    id: 'inbox_1',
    provider: 'gupshup',
    provider_event_id: 'm_1',
    provider_event_type: 'customer_message',
    phone_number_id: 'ph_1',
    status: 'queued',
    attempts: 1,
    available_at: new Date().toISOString(),
    last_error: null,
    payload: {
      eventType: 'customer_message',
      phoneNumberId: 'ph_1',
      wabaId: 'waba_1',
      messages: [{ id: 'm_1', from: '919371343891', timestamp: '1700000000', type: 'text', text: 'hi' }],
    },
    payload_raw: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}