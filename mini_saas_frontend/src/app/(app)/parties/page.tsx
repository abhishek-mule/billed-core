"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Users, Phone, MessageSquare, Plus, Search, AlertTriangle,
  UserPlus, Download, Upload, ArrowLeft, Clock, CreditCard,
  CalendarDays, Receipt, MoreHorizontal, Wallet,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { EmptyState } from "@/components/billzo/EmptyState"
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
  return (inv.total || 0) - (inv.paidAmount || 0)
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
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  clear: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const STATUS_LABELS: Record<string, string> = {
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  clear: 'Clear',
}

function FinancialHero({ totalReceivables, totalPayables, activeParties }: {
  totalReceivables: number
  totalPayables: number
  activeParties: number
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 lg:p-5">
      <div className="grid grid-cols-3 gap-4 lg:gap-6">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{MerchantLanguage.customer.totalReceivables}</p>
          <p className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums">
            {formatINR(totalReceivables)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{MerchantLanguage.customer.totalPayables}</p>
          <p className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums">
            {formatINR(totalPayables)}
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

function PartyCard({ party, isSelected, onSelect }: {
  party: PartyWithBalance
  isSelected: boolean
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
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? 'bg-muted border-border'
          : 'bg-card border-border hover:border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-sm font-semibold text-muted-foreground">
            {party.name.charAt(0).toUpperCase()}
          </span>
        </div>
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
              party.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'
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

function PartyDetail({ party, onBack }: {
  party: PartyWithBalance
  onBack?: () => void
}) {
  const router = useRouter()
  const pendingInvoices = (party.invoices || [])
    .filter(i => getOutstanding(i) > 0)
    .sort((a, b) => new Date(a.dueAt || a.dueDate || a.createdAt).getTime() - new Date(b.dueAt || b.dueDate || b.createdAt).getTime())

  const avgPaymentTime = useMemo(() => {
    if (party.paymentCount === 0) return null
    return '—'
  }, [party.paymentCount])

  return (
    <div className="space-y-4">
      {/* Back button (mobile) */}
      {onBack && (
        <button onClick={onBack} className="lg:hidden flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to customers
        </button>
      )}

      {/* Party header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-muted-foreground">
              {party.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{party.name}</h2>
            <p className="text-sm text-muted-foreground">{party.phone}</p>
            {party.gstin && (
              <p className="text-xs text-muted-foreground">GST: {party.gstin}</p>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex gap-2">
        {party.phone && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open(`tel:${party.phone}`, '_blank')}
          >
            <Phone className="w-4 h-4 mr-1.5" /> {MerchantLanguage.customer.call}
          </Button>
        )}
        {(party.whatsapp_number || party.phone) && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const num = party.whatsapp_number || party.phone
              window.open(`https://wa.me/${num?.replace(/[^0-9]/g, '')}`, '_blank')
            }}
          >
            <MessageSquare className="w-4 h-4 mr-1.5" /> WhatsApp
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => router.push(`/parties/${party.id}`)}
        >
          <MoreHorizontal className="w-4 h-4 mr-1.5" /> {MerchantLanguage.customer.profile}
        </Button>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-base font-semibold text-rose-600 tabular-nums">{formatINR(party.outstanding)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Total Sales</p>
          <p className="text-base font-semibold text-foreground tabular-nums">{formatINR(party.totalSales)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Avg Payment</p>
          <p className="text-base font-semibold text-foreground tabular-nums">
            {avgPaymentTime || '—'}
          </p>
        </div>
      </div>

      {/* Pending Invoices */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            {MerchantLanguage.customer.pendingInvoices} {pendingInvoices.length > 0 && `(${pendingInvoices.length})`}
          </h3>
        </div>
        {pendingInvoices.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No pending invoices</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingInvoices.map(inv => {
              const status = getOutstandingStatus(inv)
              return (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground truncate">
                        {inv.invoiceNumber || `#${inv.id.slice(0, 8)}`}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${STATUS_STYLES[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Due {inv.dueAt || inv.dueDate ? new Date(inv.dueAt || inv.dueDate!).toLocaleDateString() : '—'} · {formatINR(getOutstanding(inv))}
                    </p>
                  </div>
                  <div className="flex gap-1.5 ml-3 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/parties/${party.id}`)}
                      className="text-xs px-2.5 py-1.5 rounded bg-muted border border-border text-muted-foreground hover:bg-muted font-medium"
                    >
                      Remind
                    </button>
                    <button
                      onClick={() => router.push(`/pulse?payInvoice=${inv.id}`)}
                      className="text-xs px-2.5 py-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-medium"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
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
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null)
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

  // Compute parties with balances
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
      const outstanding = invs.reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0)
      const totalSales = invs.reduce((s, i) => s + (i.total || 0), 0)
      const overdueAmount = invs
        .filter(i => {
          const o = (i.total || 0) - (i.paidAmount || 0)
          const d = i.dueAt || i.dueDate
          return o > 0 && d && new Date(d) < new Date()
        })
        .reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0)

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

  // Selected party
  const selectedParty = useMemo(
    () => parties.find(p => p.id === selectedPartyId) || null,
    [parties, selectedPartyId]
  )

  // Financial aggregates
  const totalReceivables = useMemo(
    () => parties.reduce((s, p) => s + p.outstanding, 0),
    [parties]
  )
  const totalPayables = useMemo(
    () => parties.reduce((s, p) => s + p.overdueAmount, 0),
    [parties]
  )
  const activeParties = useMemo(
    () => parties.filter(p => p.outstanding > 0).length,
    [parties]
  )

  const handleSelectParty = useCallback((id: string) => {
    setSelectedPartyId(id)
  }, [])

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
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-24 bg-card border border-border rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="hidden lg:block">
              <div className="h-96 bg-card border border-border rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-card border border-rose-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-rose-600 mb-4">{error}</p>
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
      <div className="min-h-screen bg-muted/50 pb-8">
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
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* Financial Hero */}
        <FinancialHero
          totalReceivables={totalReceivables}
          totalPayables={totalPayables}
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

        {/* Master-Detail Layout (Desktop) / List (Mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">

          {/* Left Panel — Party List */}
          <div className="space-y-2">
            {/* Mobile search + add */}
            <div className="lg:hidden flex items-center gap-2">
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
                className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center flex-shrink-0"
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
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">No customers match your search</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                {filtered.map(party => (
                  <PartyCard
                    key={party.id}
                    party={party}
                    isSelected={selectedPartyId === party.id}
                    onSelect={() => {
                      if (window.innerWidth < 1024) {
                        router.push(`/parties/${party.id}`)
                      } else {
                        handleSelectParty(party.id)
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Panel — Selected Party Detail (Desktop only) */}
          <div className="hidden lg:block">
            {selectedParty ? (
              <PartyDetail party={selectedParty} />
            ) : (
              <div className="bg-card border border-border rounded-lg p-8 lg:p-12 text-center h-full flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{MerchantLanguage.customer.selectACustomer}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-20 right-4 z-10">
        <button
          onClick={() => router.push('/parties/add')}
          className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
