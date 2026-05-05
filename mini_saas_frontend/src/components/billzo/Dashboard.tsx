'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, Bell, CheckCircle2, IndianRupee, PackageMinus, RotateCcw, ScanLine, Send } from 'lucide-react'
import { applyWhatsAppStatus, createPurchaseFromScan, markPaid, repeatLastInvoice, sendReminder } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

const money = (value: number) => `Rs ${value.toLocaleString('en-IN')}`

export function Dashboard() {
  const router = useRouter()
  const { state } = useBillzo()

  if (!state) return <InstantShell />

  const unpaid = state.invoices.filter((invoice) => invoice.status !== 'paid')
  const lowStock = state.products.filter((product) => product.stock <= product.lowStockAt)
  const primaryUnpaid = unpaid[0]

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Auto-login active</p>
          <h1 className="text-2xl font-black">{state.session.businessName}</h1>
        </div>
        <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-black text-success">tenant locked</span>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <button onClick={() => router.push('/scan')} className="action-tile bg-foreground text-white sm:col-span-2">
          <ScanLine className="h-6 w-6" />
          <span>Scan Bill</span>
        </button>
        <button onClick={() => repeatLastInvoice()} className="action-tile">
          <RotateCcw className="h-6 w-6" />
          <span>Repeat Last</span>
        </button>
        <button onClick={() => primaryUnpaid && sendReminder(primaryUnpaid)} className="action-tile">
          <Send className="h-6 w-6" />
          <span>Remind</span>
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Needs Attention</h2>
        <Attention
          icon={<IndianRupee className="h-5 w-5" />}
          text={`${money(state.snapshot.pendingAmount)} pending`}
          cta="Collect Now"
          onClick={() => primaryUnpaid && sendReminder(primaryUnpaid)}
        />
        <Attention
          icon={<Bell className="h-5 w-5" />}
          text={`${state.snapshot.overdueCount} bills overdue`}
          cta="Send Reminder"
          onClick={() => primaryUnpaid && sendReminder(primaryUnpaid)}
        />
        <Attention
          icon={<PackageMinus className="h-5 w-5" />}
          text={`${state.snapshot.lowStockCount} low stock`}
          cta="Restock"
          onClick={() => createPurchaseFromScan()}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Collected today" value={money(state.snapshot.collectedToday)} />
        <Metric label="Invoices" value={String(state.snapshot.invoiceCount)} />
        <Metric label="Read reminders" value={String(state.snapshot.readReminderCount)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <h2 className="section-label">Recovery Queue</h2>
          {unpaid.slice(0, 4).map((invoice) => (
            <div key={invoice.id} className="row-card">
              <div>
                <p className="font-black">{invoice.customerName}</p>
                <p className="text-sm font-bold text-muted-foreground">
                  {money(invoice.total - invoice.paidAmount)} due - {invoice.lastWhatsAppStatus}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="icon-button bg-primary text-primary-foreground" onClick={() => sendReminder(invoice)} title="Send Reminder">
                  <Send className="h-4 w-4" />
                </button>
                <button className="icon-button" onClick={() => applyWhatsAppStatus(invoice, 'read')} title="Simulate Read">
                  <Bell className="h-4 w-4" />
                </button>
                <button className="icon-button" onClick={() => markPaid(invoice)} title="Mark Paid">
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="section-label">Activity</h2>
          {state.activity.slice(0, 6).map((item) => (
            <div key={item.id} className="row-card">
              <div>
                <p className="text-sm font-black">{item.label}</p>
                <p className="text-xs font-bold text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              {item.amount ? <span className="text-sm font-black">{money(item.amount)}</span> : null}
            </div>
          ))}
        </div>
      </section>

      {lowStock.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Living Inventory</h2>
          {lowStock.map((product) => (
            <div key={product.id} className="row-card border-warning/40 bg-warning-soft">
              <div>
                <p className="font-black">{product.name}</p>
                <p className="text-sm font-bold text-warning">{product.stock} left - min {product.lowStockAt}</p>
              </div>
              <button className="primary-button" onClick={() => createPurchaseFromScan()}>Restock</button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function Attention({ icon, text, cta, onClick }: { icon: React.ReactNode; text: string; cta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
      <span className="flex items-center gap-3 text-lg font-black">{icon}{text}</span>
      <span className="rounded-lg bg-foreground px-3 py-2 text-xs font-black text-white">{cta}</span>
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}

function InstantShell() {
  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-3 flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" /> Opening local vault</div>
      <p className="text-sm font-bold text-muted-foreground">Cached data renders from Dexie as soon as IndexedDB answers.</p>
    </div>
  )
}
