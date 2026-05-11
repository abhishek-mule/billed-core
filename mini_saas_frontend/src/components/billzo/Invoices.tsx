'use client'

import { CheckCircle2, CreditCard, RotateCcw, Send } from 'lucide-react'
import { applyWhatsAppStatus, createQuickInvoice, markPaid, repeatLastInvoice, sendReminder } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

const money = (value: number) => `Rs ${value.toLocaleString('en-IN')}`

export function Invoices() {
  const { state } = useBillzo()
  if (!state) return null

  const sorted = [...state.customers].sort((a, b) => b.invoiceCount - a.invoiceCount)
  const topProduct = state.products[0] ?? null

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">1 tap billing</p>
        <h1 className="text-2xl font-black">Invoices</h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <button className="action-tile bg-foreground text-white" onClick={() => repeatLastInvoice()}>
          <RotateCcw className="h-6 w-6" />
          <span>Repeat Last</span>
        </button>
        {sorted.slice(0, 2).map((customer) => (
          <button key={customer.id} className="action-tile" onClick={() => createQuickInvoice(customer, topProduct)}>
            <span className="text-xl font-black">{customer.name.slice(0, 2)}</span>
            <span>{customer.name}</span>
          </button>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Auto-suggested Customers</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((customer) => (
            <button key={customer.id} className="rounded-full border bg-white px-4 py-2 text-sm font-black" onClick={() => createQuickInvoice(customer, topProduct)}>
              {customer.name}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Unpaid First</h2>
        {state.invoices.map((invoice) => (
          <div key={invoice.id} className="row-card">
            <div>
              <p className="font-black">{invoice.customerName}</p>
              <p className="text-sm font-bold text-muted-foreground">
                {money(invoice.total - invoice.paidAmount)} - {invoice.items[0]?.name} - {invoice.lastWhatsAppStatus}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {invoice.status === 'paid' ? (
                <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-black text-success">paid</span>
              ) : (
                <>
                  <button className="icon-button bg-primary text-primary-foreground" onClick={() => sendReminder(invoice)} title="Send Reminder">
                    <Send className="h-4 w-4" />
                  </button>
                  <button className="icon-button" onClick={() => applyWhatsAppStatus(invoice, 'read')} title="Simulate WhatsApp Read">
                    <span className="text-xs font-black">RD</span>
                  </button>
                  <button className="icon-button" onClick={() => markPaid(invoice)} title="Mark Paid">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <button className="icon-button" onClick={() => {}} title="More Actions">
                    <CreditCard className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}