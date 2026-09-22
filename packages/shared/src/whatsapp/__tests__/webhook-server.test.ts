import { describe, it, expect } from 'vitest'
import { createWhatsAppServer } from '..'

type Outcome = { data?: unknown; error?: { message?: string; code?: string } | null }

function makeFakeClient(plan: { lookup?: Outcome; upsert?: Outcome; insert?: Outcome } = {}) {
  const calls: any[] = []
  const chain: any = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.limit = () => chain
  chain.maybeSingle = async () => {
    calls.push({ op: 'maybeSingle' })
    return plan.lookup ?? { data: null, error: null }
  }
  chain.upsert = (rows: unknown, options?: unknown) => {
    calls.push({ op: 'upsert', rows, options })
    const s: any = chain
    s.maybeSingle = async () => {
      calls.push({ op: 'maybeSingle-after-upsert' })
      return plan.upsert ?? { data: rows, error: null }
    }
    return s
  }
  chain.insert = (rows: unknown) => {
    calls.push({ op: 'insert', rows })
    const s: any = chain
    s.maybeSingle = async () => {
      calls.push({ op: 'maybeSingle-after-insert' })
      return plan.insert ?? { data: { id: 'pilot_1' }, error: null }
    }
    return s
  }
  return { from: () => chain, calls }
}

describe('createWhatsAppServer — tenant resolution', () => {
  it('resolves a connection row strictly by phone_number_id', async () => {
    const row = {
      id: 'wa_1',
      tenant_id: 't1',
      waba_id: 'waba_1',
      phone_number_id: 'ph_1',
      display_name: 'BillZo',
      provider: 'gupshup',
      status: 'connected',
      last_error: null,
    }
    const fake = makeFakeClient({ lookup: { data: row } })
    const server = createWhatsAppServer(fake as any)
    const result = await server.resolveTenantByPhoneNumberId('ph_1')
    expect(result).toEqual(row)
    expect(fake.calls).toEqual([{ op: 'maybeSingle' }])
  })

  it('returns null when no connection row exists', async () => {
    const fake = makeFakeClient({ lookup: { data: null } })
    const server = createWhatsAppServer(fake as any)
    expect(await server.resolveTenantByPhoneNumberId('unknown')).toBeNull()
  })

  it('returns null on query error (never guesses the tenant)', async () => {
    const fake = makeFakeClient({ lookup: { error: { message: 'boom' } } })
    const server = createWhatsAppServer(fake as any)
    expect(await server.resolveTenantByPhoneNumberId('ph_1')).toBeNull()
  })
})

describe('createWhatsAppServer — upsertWhatsAppConnection', () => {
  it('upserts keyed by phone_number_id and returns the row', async () => {
    const fake = makeFakeClient({ upsert: { data: { id: 'wa_1', tenant_id: 't1' } } })
    const server = createWhatsAppServer(fake as any)
    const result = await server.upsertWhatsAppConnection({
      tenantId: 't1',
      wabaId: 'waba_1',
      phoneNumberId: 'ph_1',
      displayName: 'BillZo',
    })
    expect(result).toMatchObject({ id: 'wa_1' })
    const upsertCall = fake.calls.find((c) => c.op === 'upsert')
    expect(upsertCall.options).toEqual({ onConflict: 'phone_number_id' })
    expect(upsertCall.rows).toMatchObject({
      tenant_id: 't1',
      waba_id: 'waba_1',
      phone_number_id: 'ph_1',
      display_name: 'BillZo',
      provider: 'gupshup',
      status: 'connected',
    })
  })

  it('returns null on persist failure', async () => {
    const fake = makeFakeClient({ upsert: { error: { message: 'constraint' } } })
    const server = createWhatsAppServer(fake as any)
    expect(
      await server.upsertWhatsAppConnection({ tenantId: 't1', wabaId: 'w', phoneNumberId: 'p' }),
    ).toBeNull()
  })
})

describe('createWhatsAppServer — recordPilotEvent', () => {
  it('maps input to a pilot_events row with provider/attribution defaults', async () => {
    const fake = makeFakeClient()
    const server = createWhatsAppServer(fake as any)
    const result = await server.recordPilotEvent({
      tenantId: 't1',
      eventKind: 'customer_replied',
      direction: 'inbound',
      providerMessageId: 'm1',
    })
    expect(result).toEqual({ recorded: true, duplicate: false })
    const ins = fake.calls.find((c) => c.op === 'insert')
    expect(ins.rows).toMatchObject({
      tenant_id: 't1',
      event_kind: 'customer_replied',
      direction: 'inbound',
      provider: 'gupshup',
      provider_message_id: 'm1',
      attribution_result: 'resolved',
      state_before: null,
      state_after: null,
      raw_payload: null,
    })
  })

  it('unattributed events default attribution_result to unattributed', async () => {
    const fake = makeFakeClient()
    const server = createWhatsAppServer(fake as any)
    await server.recordPilotEvent({ eventKind: 'unattributed_webhook' })
    const ins = fake.calls.find((c) => c.op === 'insert')
    expect(ins.rows.attribution_result).toBe('unattributed')
    expect(ins.rows.tenant_id).toBeNull()
  })

  it('reports unique-violation (23505) as a dedup duplicate, not a failure', async () => {
    const fake = makeFakeClient({ insert: { error: { code: '23505', message: 'dup' } } })
    const server = createWhatsAppServer(fake as any)
    expect(
      await server.recordPilotEvent({ tenantId: 't1', eventKind: 'reminder_sent' }),
    ).toEqual({ recorded: false, duplicate: true })
  })

  it('reports generic insert errors as unrecorded', async () => {
    const fake = makeFakeClient({ insert: { error: { message: 'connection reset' } } })
    const server = createWhatsAppServer(fake as any)
    expect(
      await server.recordPilotEvent({ tenantId: 't1', eventKind: 'reminder_sent' }),
    ).toEqual({ recorded: false, duplicate: false })
  })
})