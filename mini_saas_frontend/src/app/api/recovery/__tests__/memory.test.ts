import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1', userId: 'u1' })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { GET, POST, PATCH, DELETE } from '@/app/api/recovery/memory/route'

const { supabaseAdmin } = await import('@/lib/billzo/supabase-admin')

let store: any[] = []
let nextId = 1
function chain(opts: { method: string; body?: any; queryId?: string } = { method: 'GET' }) {
  const builder: any = {}
  const passthrough = () => builder
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order', 'limit', 'single', 'maybeSingle']) builder[m] = passthrough
  if (opts.method === 'GET') {
    builder.then = (resolve: any) => {
      const sorted = store
        .filter((s) => !s.archived_at)
        .sort((a, b) => (Number(b.is_pinned) - Number(a.is_pinned)) || (+new Date(b.created_at) - +new Date(a.created_at)))
      return Promise.resolve({ data: sorted, error: null }).then(resolve)
    }
    return builder
  }
  if (opts.method === 'POST') {
    builder.insert = (row: any) => {
      const rec = { id: 'n' + nextId++, ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      store.push(rec)
      builder._result = { data: rec, error: null }
      return builder
    }
    builder.then = (resolve: any) => Promise.resolve(builder._result).then(resolve)
    return builder
  }
  if (opts.method === 'PATCH') {
    builder.then = (resolve: any) => {
      const rec = store.find((s) => s.id === opts.body?.id)
      if (rec) Object.assign(rec, opts.body, { updated_at: new Date().toISOString() })
      return Promise.resolve({ data: rec || null, error: null }).then(resolve)
    }
    return builder
  }
  if (opts.method === "DELETE") {
    builder.then = (resolve: any) => {
      const rec = store.find((s) => s.id === opts.queryId)
      if (rec) rec.archived_at = new Date().toISOString()
      return Promise.resolve({ error: null }).then(resolve)
    }
    return builder
  }
  builder.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
  return builder
}

let pendingReq: { method: string; queryId?: string; body?: any } = { method: 'GET' }
function makeReq(method: string, query = '', body?: any) {
  pendingReq = { method, queryId: query.startsWith('?id=') ? query.slice(4) : undefined, body }
  const req: any = {
    method,
    nextUrl: new URL('http://localhost/api/recovery/memory' + query),
    json: async () => body,
  }
  return req
}

describe('merchant memory route', () => {
  beforeEach(() => { vi.clearAllMocks(); store = []; ;(supabaseAdmin.from as any).mockImplementation((t: string) => chain(pendingReq)) })

  it('rejects without customerId on GET', async () => {
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(400)
  })

  it('creates, lists pinned-first, patches pin, and soft-deletes', async () => {
    // create two notes
    const p1 = await POST(makeReq('POST', '', { customerId: 'cu1', note: 'Only answers after 7PM' }))
    expect(p1.status).toBe(201)
    const p2 = await POST(makeReq('POST', '', { customerId: 'cu1', note: 'Wife approves payments' }))
    expect(p2.status).toBe(201)

    // pin the second
    const created2 = (await p2.json()).note
    const patch = await PATCH(makeReq('PATCH', '', { id: created2.id, is_pinned: true }))
    expect(patch.status).toBe(200)

    // GET returns pinned first
    ;(supabaseAdmin.from as any).mockImplementation((t: string) => chain(pendingReq))
    const list = await GET(makeReq('GET', '?customerId=cu1'))
    const json = await list.json()
    expect(json.notes).toHaveLength(2)
    expect(json.notes[0].is_pinned).toBe(true)
    expect(json.notes[0].note).toBe('Wife approves payments')

    // delete (soft archive)
    const del = await DELETE(makeReq('DELETE', `?id=${created2.id}`))
    expect(del.status).toBe(200)
    // archived note excluded
    ;(supabaseAdmin.from as any).mockImplementation((t: string) => chain(pendingReq))
    const list2 = await GET(makeReq('GET', '?customerId=cu1'))
    const j2 = await list2.json()
    expect(j2.notes.find((n: any) => n.id === created2.id)).toBeUndefined()
  })

  it('rejects empty note on POST', async () => {
    const res = await POST(makeReq('POST', '', { customerId: 'cu1', note: '   ' }))
    expect(res.status).toBe(400)
  })
})
