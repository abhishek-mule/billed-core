import { describe, it, expect } from 'vitest'
import { evaluateReadiness } from '@/lib/recovery/readiness'

describe('evaluateReadiness', () => {
  it('Scenario 1 — no customers → add customer', () => {
    const r = evaluateReadiness({ customers: 0, invoices: 0, overdueInvoices: 0, whatsappConnected: true })
    expect(r.customers).toBe(false)
    expect(r.action.kind).toBe('add_customer')
    expect(r.ready).toBe(false)
  })

  it('Scenario 2 — customers but no invoices → create invoice', () => {
    const r = evaluateReadiness({ customers: 3, invoices: 0, overdueInvoices: 0, whatsappConnected: true })
    expect(r.invoices).toBe(false)
    expect(r.action.kind).toBe('create_invoice')
    expect(r.action.href).toBe('/pos')
  })

  it('Scenario 3 — invoices, no overdue, healthy → monitoring', () => {
    const r = evaluateReadiness({ customers: 2, invoices: 5, overdueInvoices: 0, whatsappConnected: true })
    expect(r.action.kind).toBe('healthy')
    expect(r.ready).toBe(true)
  })

  it('Scenario 4 — overdue invoices + WhatsApp → send reminder', () => {
    const r = evaluateReadiness({ customers: 6, invoices: 8, overdueInvoices: 6, whatsappConnected: true })
    expect(r.action.kind).toBe('send_reminder')
    if (r.action.kind === 'send_reminder') {
      expect(r.action.overdueCount).toBe(6)
    }
    expect(r.ready).toBe(true)
  })

  it('WhatsApp gate — overdue but no WhatsApp → connect whatsapp first', () => {
    const r = evaluateReadiness({ customers: 2, invoices: 4, overdueInvoices: 3, whatsappConnected: false })
    expect(r.action.kind).toBe('connect_whatsapp')
    expect(r.ready).toBe(false)
  })

  it('is pure and deterministic', () => {
    const input = { customers: 1, invoices: 1, overdueInvoices: 0, whatsappConnected: false }
    expect(evaluateReadiness(input)).toEqual(evaluateReadiness(input))
  })
})
