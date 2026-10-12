"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Users, Plus, Search, AlertTriangle, UserPlus, Download, Upload,
  ChevronRight, Banknote,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { EmptyState } from "@/components/billzo/EmptyState"
import { getDiceBearAvatarUrl } from "@/components/billzo/Avatar"
import { CustomersTable } from "@/components/ui/customers-table"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { getCookie } from "@/lib/cookies"

type Customer = {
  id: string
  tenantId: string
  name: string
  phone: string
  whatsapp_number?: string
  gstin?: string
  email?: string
  address?: string
  notes?: string
  automationMode?: string
  lastUsedAt: string
  invoiceCount: number
  createdAt: string
  updatedAt: string
}

type Invoice = {
  id: string
  tenantId: string
  customerId: string
  total: number
  paidAmount: number
  dueAt?: string
  dueDate?: string
  status: string
  invoiceNumber?: string
  createdAt: string
  recoveryStage?: string
}

type Payment = {
  id: string
  invoiceId: string
  amount: number
  method?: string
  createdAt: string
}

type PartyWithBalance = Customer & {
  outstanding: number
  totalSales: number
  overdueAmount: number
  invoiceCount: number
  paymentCount: number
  invoices: Invoice[]
  lastPaymentAt: string | null
}

type PartyStatus = 'overdue' | 'due_soon' | 'clear'
type StatusFilter = 'all' | PartyStatus

function getPartyType(c: Customer): 'customer' | 'supplier' {
  return c.notes?.toLowerCase().includes('supplier') ? 'supplier' : 'customer'
}

function getOutstanding(inv: Invoice): number {
  const raw = (inv as any).outstandingAmount ?? (inv as any).outstanding_amount
  if (raw != null && Number(raw) >= 0) {
    const v = Number(raw)
    if (!isNaN(v)) return Math.max(0, v)
  }
  const t = Number((inv as any).grand_total ?? inv.total ?? 0)
  const p = Number((inv as any).paid_amount ?? inv.paidAmount ?? 0)
  return Math.max(0, t - p)
}

function getOutstandingStatus(inv: Invoice): 'overdue' | 'due_soon' | 'clear' {
  if (getOutstanding(inv) <= 0) return 'clear'
  const dueAt = inv.dueAt || inv.dueDate
  if (!dueAt) return 'clear'
  const due = new Date(dueAt)
  const now = new Date()
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / 86400000)
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 3) return 'due_soon'
  return 'clear'
}

function getPartyMaxStatus(party: PartyWithBalance): PartyStatus {
  const invoices = party.invoices || []
  if (invoices.some(i => getOutstandingStatus(i) === 'overdue')) return 'overdue'
  if (invoices.some(i => getOutstandingStatus(i) === 'due_soon')) return 'due_soon'
  return 'clear'
}

const STATUS_STYLES: Record<string, string> = {
  overdue: 'bg-danger-soft text-danger border-danger/30',
  due_soon: 'bg-warning-soft text-warning border-warning/30',
  clear: 'bg-success-soft text-success border-success/30',
}

const STATUS_LABELS: Record<string, string> = {
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  clear: 'Clear',
}

const FILTER_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'clear', label: 'Clear' },
]

function FinancialHero({ totalReceivables, overdueAmount, activeParties }: {
  totalReceivables: number
  overdueAmount: number
  activeParties: number
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-card p-5 lg:p-6">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
            <Banknote size={13} className="text-primary" />
            <span className="uppercase tracking-wider font-semibold">{MerchantLanguage.customer.totalReceivables}</span>
          </div>
          <p className="text-2xl lg:text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formatINR(totalReceivables)}
          </p>
        </div>
        <div className="sm:border-l sm:border-border sm:pl-5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5">Overdue Amount</p>
          <p className="text-2xl lg:text-3xl font-bold tabular-nums tracking-tight text-danger">
            {formatINR(overdueAmount)}
          </p>
        </div>
        <div className="sm:border-l sm:border-border sm:pl-5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5">{MerchantLanguage.customer.activeCustomers}</p>
          <p className="text-2xl lg:text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {activeParties}
          </p>
        </div>
      </div>
    </div>
  )
}

function PartyCard({ party, onSelect }: {
  party: PartyWithBalance
  onSelect: () => void
}) {
  const type = getPartyType(party)
  const maxStatus = getPartyMaxStatus(party)

  return (
    <button
      onClick={onSelect}
      className={`group w-full text-left p-3.5 rounded-2xl border bg-card hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99] ${
        maxStatus === 'overdue' ? 'border-danger/25 border-l-4 border-l-danger' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-3">
        <img src={getDiceBearAvatarUrl(party.name)} alt="" className="w-10 h-10 rounded-full shrink-0 bg-muted/20" loading="lazy" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground truncate text-[15px]">{party.name}</p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded">
              {type}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {party.phone || 'No phone'} · {party.invoiceCount} invoice{party.invoiceCount !== 1 ? 's' : ''}
            </p>
            <p className={`text-[15px] font-bold tabular-nums shrink-0 ${
              party.outstanding > 0 ? 'text-danger' : 'text-success'
            }`}>
              {formatINR(party.outstanding)}
            </p>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${STATUS_STYLES[maxStatus]}`}>
              {STATUS_LABELS[maxStatus]}
            </span>
            <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </button>
  )
}


export default function PartiesPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const tenantId = getCookie('bz_tenant')
        if (!tenantId) { router.push('/auth'); return }

        const [cs, invs, pays] = await Promise.all([
          db().customers.where('tenantId').equals(tenantId).toArray(),
          db().invoices.where('tenantId').equals(tenantId).toArray(),
          db().payments?.where('tenantId').equals(tenantId).toArray() || Promise.resolve([]),
        ])

        setCustomers(cs as unknown as Customer[])
        setInvoices(invs as unknown as Invoice[])
        setPayments(pays as unknown as Payment[])
      } catch (err) {
        setError(MerchantLanguage.customer.failedToLoad)
      } finally {
        setLoading(false)
      }
    }
    load()
    window.addEventListener("billzo:changed", load)
    return () => window.removeEventListener("billzo:changed", load)
  }, [router])

  // Compute parties with balances — canonical outstanding (outstanding_amount > total-paid fallback)
  const parties: PartyWithBalance[] = useMemo(() => {
    const invoiceMap = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      const cid = (inv as any).customerId || (inv as any).customer_id || ''
      if (!invoiceMap.has(cid)) invoiceMap.set(cid, [])
      invoiceMap.get(cid)!.push(inv)
    }

    const paymentMap = new Map<string, Payment[]>()
    for (const p of payments) {
      const iid = (p as any).invoiceId || (p as any).invoice_id || ''
      if (!paymentMap.has(iid)) paymentMap.set(iid, [])
      paymentMap.get(iid)!.push(p)
    }

    return customers.map(c => {
      const invs = invoiceMap.get(c.id) || []
      const outstanding = invs.reduce((s, i) => s + getOutstanding(i), 0)
      const totalSales = invs.reduce((s, i) => s + Number((i as any).grand_total ?? i.total ?? 0), 0)
      const overdueAmount = invs
        .filter(i => {
          const o = getOutstanding(i)
          const d = i.dueAt || i.dueDate
          return o > 0 && d && new Date(d) < new Date()
        })
        .reduce((s, i) => s + getOutstanding(i), 0)

      let paymentCount = 0
      let lastPaymentAt: string | null = null
      for (const inv of invs) {
        const invPayments = paymentMap.get(inv.id) || []
        paymentCount += invPayments.length
        for (const p of invPayments) {
          if (!lastPaymentAt || p.createdAt > lastPaymentAt) lastPaymentAt = p.createdAt
        }
      }

      return {
        ...c,
        outstanding,
        totalSales,
        overdueAmount,
        invoiceCount: invs.length,
        paymentCount,
        invoices: invs,
        lastPaymentAt,
      }
    })
  }, [customers, invoices, payments])

  // Filtered parties (search + status)
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return parties.filter(p => {
      if (statusFilter !== 'all' && getPartyMaxStatus(p) !== statusFilter) return false
      if (!query) return true
      return p.name.toLowerCase().includes(query) ||
        p.phone?.toLowerCase().includes(query) ||
        p.gstin?.toLowerCase().includes(query)
    })
  }, [parties, q, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: parties.length, overdue: 0, due_soon: 0, clear: 0 }
    for (const p of parties) counts[getPartyMaxStatus(p)]++
    return counts
  }, [parties])

  // Financial aggregates — canonical, matches Home/Recovery totalOutstanding (all open invoices, not just mapped parties).
  const totalReceivables = useMemo(() => {
    return invoices
      .filter(i => (i.status as string) !== 'paid' && (i.status as string) !== 'cancelled')
      .reduce((s, i) => s + getOutstanding(i), 0)
  }, [invoices])
  const totalPayables = useMemo(() => {
    return invoices
      .filter(i => {
        const o = getOutstanding(i)
        const d = (i as any).dueAt || (i as any).dueDate
        return o > 0 && d && new Date(d) < new Date()
      })
      .reduce((s, i) => s + getOutstanding(i), 0)
  }, [invoices])
  const activeParties = useMemo(() => parties.filter(p => p.outstanding > 0).length, [parties])

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Loading state ──
  if (loading) {
    return (
      <div className="bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4 animate-pulse">
          <div className="h-7 w-36 bg-muted rounded-lg" />
          <div className="h-36 bg-card border border-border rounded-3xl" />
          <div className="h-11 bg-card border border-border rounded-2xl" />
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-muted/60 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-card border border-danger-soft rounded-2xl p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-3" />
            <p className="text-sm text-danger mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              {MerchantLanguage.common.retry}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (customers.length === 0) {
    return (
      <div className="bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="animate-element bg-card border border-border rounded-3xl p-8 lg:p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">{MerchantLanguage.customer.noCustomersYet}</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Start managing your business relationships. Import from your contacts or add a party manually.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => router.push('/parties/import')}>
                <Download className="w-4 h-4 mr-1.5" /> {MerchantLanguage.common.import}
              </Button>
              <Button variant="outline" onClick={() => router.push('/parties/add')}>
                <UserPlus className="w-4 h-4 mr-1.5" /> Add Customer
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-muted/50 pb-24">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* Header */}
        <div className="animate-element flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {parties.length} {parties.length === 1 ? 'party' : 'parties'}
              {activeParties > 0 && <> · {activeParties} with balance due</>}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => router.push('/parties/import')}>
              <Upload className="w-4 h-4 mr-1.5" /> {MerchantLanguage.common.import}
            </Button>
            <Button size="sm" onClick={() => router.push('/parties/add')}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Customer
            </Button>
          </div>
        </div>

        {/* Financial Hero */}
        <div className="animate-element animate-delay-100">
          <FinancialHero
            totalReceivables={totalReceivables}
            overdueAmount={totalPayables}
            activeParties={activeParties}
          />
        </div>

        {/* Search */}
        <div className="animate-element animate-delay-200 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name, phone, or GST...  ( / )"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all shadow-sm"
          />
        </div>

        {/* Status filter chips */}
        <div className="animate-element animate-delay-200 flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
          {FILTER_CHIPS.map(({ key, label }) => {
            const active = statusFilter === key
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {label}
                <span className={`tabular-nums ${active ? 'opacity-70' : 'opacity-60'}`}>
                  {statusCounts[key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Desktop: customers table */}
        <div className="hidden lg:block animate-element animate-delay-300">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No customers match your filters"
            />
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <CustomersTable
                customers={filtered}
                onView={(id) => router.push(`/parties/${id}`)}
              />
            </div>
          )}
        </div>

        {/* Mobile: party list */}
        <div className="lg:hidden space-y-2 animate-element animate-delay-300">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground font-medium">
              {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
              {(q || statusFilter !== 'all') && filtered.length !== parties.length && ` (of ${parties.length})`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No customers match your filters"
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(party => (
                <PartyCard
                  key={party.id}
                  party={party}
                  onSelect={() => router.push(`/parties/${party.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-32 right-4 z-10">
        <button
          onClick={() => router.push('/parties/add')}
          aria-label="Add customer"
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] active:scale-95 transition-transform"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
