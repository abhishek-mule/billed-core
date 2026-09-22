"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Users, Plus, Search, AlertTriangle, UserPlus, Download, Upload,
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

const STATUS_STYLES: Record<string, string> = {
  overdue: 'bg-danger-soft text-danger border-border',
  due_soon: 'bg-warning-soft text-warning border-border',
  clear: 'bg-success-soft text-success border-border',
}

const STATUS_LABELS: Record<string, string> = {
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  clear: 'Clear',
}

function FinancialHero({ totalReceivables, overdueAmount, activeParties }: {
  totalReceivables: number
  overdueAmount: number
  activeParties: number
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 lg:p-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{MerchantLanguage.customer.totalReceivables}</p>
          <p className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums">
            {formatINR(totalReceivables)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Overdue Amount</p>
          <p className="text-xl lg:text-2xl font-semibold text-danger tabular-nums">
            {formatINR(overdueAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{MerchantLanguage.customer.activeCustomers}</p>
          <p className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums">
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
  const invoices = party.invoices || []
  const overdueInvoices = invoices.filter(i => getOutstandingStatus(i) === 'overdue')
  const maxStatus = overdueInvoices.length > 0 ? 'overdue'
    : invoices.some(i => getOutstandingStatus(i) === 'due_soon') ? 'due_soon'
    : 'clear'

  return (
    <button
      onClick={onSelect}
      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-border transition-colors"
    >
      <div className="flex items-start gap-3">
        <img src={getDiceBearAvatarUrl(party.name)} alt="" className="w-9 h-9 rounded-full shrink-0 mt-0.5 bg-muted/20" loading="lazy" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-foreground truncate">{party.name}</p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {type}
            </span>
          </div>
          {party.phone && (
            <p className="text-xs text-muted-foreground truncate">{party.phone}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <p className={`text-sm font-semibold tabular-nums ${
              party.outstanding > 0 ? 'text-danger' : 'text-success'
            }`}>
              {formatINR(party.outstanding)}
            </p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${STATUS_STYLES[maxStatus]}`}>
              {STATUS_LABELS[maxStatus]}
            </span>
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

  // Filtered parties
  const filtered = useMemo(() => {
    if (!q.trim()) return parties
    const query = q.toLowerCase()
    return parties.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.phone?.toLowerCase().includes(query) ||
      p.gstin?.toLowerCase().includes(query)
    )
  }, [parties, q])

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
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-24 bg-card border border-border rounded-lg animate-pulse" />
          <div className="bg-card border border-border rounded-lg p-6 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-muted/60 rounded animate-pulse" />
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
          <div className="bg-card border border-danger-soft rounded-lg p-6 text-center">
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
          <div className="bg-card border border-border rounded-lg p-8 lg:p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">{MerchantLanguage.customer.noCustomersYet}</h2>
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

        {/* Financial Hero */}
        <FinancialHero
          totalReceivables={totalReceivables}
          overdueAmount={totalPayables}
          activeParties={activeParties}
        />

        {/* Search + Add (desktop) */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, phone, or GST... (/)"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/parties/import')}>
            <Upload className="w-4 h-4 mr-1.5" /> {MerchantLanguage.common.import}
          </Button>
          <Button size="sm" onClick={() => router.push('/parties/add')}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Customer
          </Button>
        </div>

        {/* Desktop: customers table */}
        <div className="hidden lg:block">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No customers match your search"
            />
          ) : (
            <div className="bg-card border border-border rounded-lg">
              <CustomersTable
                customers={filtered}
                onView={(id) => router.push(`/parties/${id}`)}
              />
            </div>
          )}
        </div>

        {/* Mobile: party list */}
        <div className="lg:hidden space-y-2">
          {/* Mobile search + add */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => router.push('/parties/add')}
              className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Party count */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground font-medium">
              {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
              {q && filtered.length !== parties.length && ` (of ${parties.length})`}
            </p>
          </div>

          {/* Party list */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No customers match your search"
            />
          ) : (
            <div className="space-y-1.5">
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
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
