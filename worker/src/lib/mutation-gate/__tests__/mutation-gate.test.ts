import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MutationGate } from '../mutation-gate'
import { invoiceMarkPaid, reminderAdvanceStage, reminderUpdateCadence, invoiceUpdateRecoveryState } from '../handlers/invoice'
import { tenantUpdateSubscription, tenantUpdateWhatsappConfig, tenantUpdateOperationalHealth } from '../handlers/tenant'
import { recoveryRecordAttribution, recoveryUpsertCase } from '../handlers/recovery'
import { reconciliationLogAttribution } from '../handlers/reconciliation'
import { gstrSaveExport } from '../handlers/gstr'

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ limit: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
    })),
  },
}))

describe('MutationGate', () => {
  describe('shadow mode', () => {
    const gate = new MutationGate({ mode: 'shadow' })

    it('rejects requests without idempotencyKey', async () => {
      const res = await gate.submit({
        idempotencyKey: '',
        intentType: 'invoice.mark_paid.v1',
        tenantId: 't1',
        payload: {},
        mode: 'sync',
      })
      expect(res.accepted).toBe(false)
      expect(res.outcome).toBe('rejected')
      expect(res.error).toContain('idempotencyKey')
    })

    it('rejects requests without intentType', async () => {
      const res = await gate.submit({
        idempotencyKey: 'k1',
        intentType: '',
        tenantId: 't1',
        payload: {},
        mode: 'sync',
      })
      expect(res.accepted).toBe(false)
      expect(res.outcome).toBe('rejected')
      expect(res.error).toContain('intentType')
    })

    it('rejects requests without tenantId', async () => {
      const res = await gate.submit({
        idempotencyKey: 'k1',
        intentType: 'invoice.mark_paid.v1',
        tenantId: '',
        payload: {},
        mode: 'sync',
      })
      expect(res.accepted).toBe(false)
      expect(res.outcome).toBe('rejected')
      expect(res.error).toContain('tenantId')
    })

    it('rejects unknown intentType', async () => {
      const res = await gate.submit({
        idempotencyKey: 'k1',
        intentType: 'nonexistent.v1',
        tenantId: 't1',
        payload: {},
        mode: 'sync',
      })
      expect(res.accepted).toBe(false)
      expect(res.outcome).toBe('rejected')
      expect(res.error).toContain('No handler')
    })

    it('accepts valid invoice.mark_paid.v1 and returns touchedRows', async () => {
      const res = await gate.submit({
        idempotencyKey: 'k2',
        intentType: 'invoice.mark_paid.v1',
        tenantId: 't1',
        payload: { invoiceId: 'inv-1', status: 'paid', paidAmount: 1000 },
        mode: 'sync',
      })
      expect(res.accepted).toBe(true)
      expect(res.outcome).toBe('accepted')
      expect(res.result?.outcome).toBe('success')
      expect(res.result?.touchedRows).toHaveLength(1)
      expect(res.result?.touchedRows[0].table).toBe('invoices')
      expect(res.result?.touchedRows[0].changedFields).toContain('status')
    })

    it('returns transitionTraces for invoice updates', async () => {
      const res = await gate.submit({
        idempotencyKey: 'k3',
        intentType: 'reminder.advance_stage.v1',
        tenantId: 't1',
        payload: { invoiceId: 'inv-2', recoveryStage: 'outreach_2', lastWhatsappStatus: 'sent' },
        mode: 'sync',
      })
      expect(res.accepted).toBe(true)
      expect(res.result?.transitionTraces.length).toBeGreaterThan(0)
      expect(res.result?.transitionTraces[0].entity).toBe('invoice')
    })
  })

  describe('handlers', () => {
    it('invoiceMarkPaid requires invoiceId', async () => {
      const r = await invoiceMarkPaid.execute({}, 't1')
      expect(r.outcome).toBe('failure')
      expect(r.error).toContain('invoiceId')
    })

    it('reminderAdvanceStage requires invoiceId', async () => {
      const r = await reminderAdvanceStage.execute({}, 't1')
      expect(r.outcome).toBe('failure')
    })

    it('reconciliationLogAttribution requires invoiceId', async () => {
      const r = await reconciliationLogAttribution.execute({}, 't1')
      expect(r.outcome).toBe('failure')
    })

    it('gstrSaveExport requires month and year', async () => {
      const r = await gstrSaveExport.execute({}, 't1')
      expect(r.outcome).toBe('failure')
    })

    it('recoveryRecordAttribution requires invoiceId and reminderEventId', async () => {
      const r = await recoveryRecordAttribution.execute({}, 't1')
      expect(r.outcome).toBe('failure')
    })

    it('recoveryUpsertCase requires customerId', async () => {
      const r = await recoveryUpsertCase.execute({}, 't1')
      expect(r.outcome).toBe('failure')
    })

    it('tenantUpdateSubscription succeeds with valid payload', async () => {
      const r = await tenantUpdateSubscription.execute({ plan: 'pro' }, 't-1')
      expect(r.outcome).toBe('success')
      expect(r.touchedRows[0].table).toBe('tenants')
    })

    it('tenantUpdateWhatsappConfig succeeds', async () => {
      const r = await tenantUpdateWhatsappConfig.execute({ whatsappConfig: { provider: 'twilio' } }, 't-1')
      expect(r.outcome).toBe('success')
    })

    it('tenantUpdateOperationalHealth succeeds', async () => {
      const r = await tenantUpdateOperationalHealth.execute({ whatsappReputation: 0.85 }, 't-1')
      expect(r.outcome).toBe('success')
    })

    it('invoiceUpdateRecoveryState succeeds', async () => {
      const r = await invoiceUpdateRecoveryState.execute({ invoiceId: 'inv-1', recoveryFlag: true }, 't-1')
      expect(r.outcome).toBe('success')
    })

    it('reminderUpdateCadence succeeds', async () => {
      const r = await reminderUpdateCadence.execute({ invoiceId: 'inv-1', nextRecoveryAt: '2026-06-01T00:00:00Z' }, 't-1')
      expect(r.outcome).toBe('success')
    })
  })
})
