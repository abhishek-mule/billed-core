'use client'

import { CheckCircle2, CreditCard, RotateCcw, Send } from 'lucide-react'
import { applyWhatsAppStatus, createQuickInvoice, markPaid, repeatLastInvoice, sendReminder } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

export function Invoices() {
  const { state } = useBillzo()
  if (!state) return null

  const sorted = [...state.customers].sort((a, b) => b.invoiceCount - a.invoiceCount)
  const topProduct = state.products[0] ?? null

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">1 tap billing</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Invoices</h1>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <button className="action-tile bg-foreground text-white border-foreground hover:opacity-90" onClick={() => repeatLastInvoice()}>
          <RotateCcw className="h-5 w-5" />
          <span>Repeat Last</span>
        </button>
        {sorted.slice(0, 2).map((customer) => (
          <button key={customer.id} className="action-tile" onClick={() => createQuickInvoice(customer, topProduct)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <span>{customer.name}</span>
          </button>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Auto-suggested Customers</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {sorted.map((customer) => (
            <button key={customer.id} className="whitespace-nowrap rounded-full border border-border bg-white px-5 py-2 text-sm font-semibold text-foreground transition-all hover:border-primary/30 hover:bg-muted" onClick={() => createQuickInvoice(customer, topProduct)}>
              {customer.name}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Unpaid First</h2>
        <div className="space-y-3">
          {state.invoices.map((invoice) => (
            <div key={invoice.id} className="row-card">
              <div>
                <p className="font-semibold text-foreground">{invoice.customerName}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{money(invoice.total - invoice.paidAmount)}</span>
                  <span>•</span>
                  <span>{invoice.items[0]?.name || 'No items'}</span>
                  <span>•</span>
                  <span>{invoice.lastWhatsAppStatus || 'No status'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {invoice.status === 'paid' ? (
                  <span className="rounded-full bg-success-soft border border-success/20 px-3 py-1 text-[11px] font-bold text-success uppercase tracking-wide">paid</span>
                ) : (
                  <>
                    <button className="icon-button bg-primary text-primary-foreground border-primary hover:opacity-90" onClick={() => sendReminder(invoice)} title="Send Reminder">
                      <Send className="h-4 w-4" />
                    </button>
                    <button className="icon-button" onClick={() => applyWhatsAppStatus(invoice, 'read')} title="Simulate WhatsApp Read">
                      <span className="text-[10px] font-bold">RD</span>
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
        </div>
      </section>
    </div>
  )
}