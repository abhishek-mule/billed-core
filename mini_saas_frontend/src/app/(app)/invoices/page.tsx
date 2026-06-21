"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Search, Plus, ChevronRight,
  TrendingUp, AlertCircle, ArrowRight, Download, FileSpreadsheet,
  FileText, Receipt,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import type { Invoice } from "@/lib/billzo/types"

// ── helpers ──
function daysSince(s: string): number {
  return Math.floor((Date.now() - new Date(s).getTime()) / (1000 * 60 * 60 * 24))
}

function getOutstanding(inv: Invoice): number {
  return (inv.total || 0) - (inv.paidAmount || 0)
}

function getStatusBadge(inv: Invoice) {
  if (inv.status === "paid") return { label: "Paid", cls: "bg-emerald-600 text-white" }
  if (inv.status === "overdue") return { label: "Overdue", cls: "bg-rose-600 text-white" }
  if (inv.status === "partial") return { label: "Partial", cls: "bg-amber-500 text-white" }
  return { label: "Unpaid", cls: "bg-muted-foreground/20 text-foreground" }
}

function getRisk(inv: Invoice): { label: string; cls: string } | null {
  if (inv.status !== "overdue" && inv.status !== "partial") return null
  const d = daysSince(inv.dueAt)
  if (d > 30) return { label: "High Risk", cls: "text-rose-600 bg-rose-50" }
  if (d > 15) return { label: "Medium Risk", cls: "text-amber-600 bg-amber-50" }
  if (d > 7) return { label: "At Risk", cls: "text-orange-600 bg-orange-50" }
  return null
}

// ── component ──
export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [visibleCount, setVisibleCount] = useState(25)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  const PAGE_SIZE = 25

  useEffect(() => {
    loadInvoices()
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const loadInvoices = async () => {
    try {
      setError(null)
      setLoading(true)
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) { router.push("/auth"); return }
      const data = await db().invoices.where("tenantId").equals(tenantId).reverse().sortBy("createdAt")
      setInvoices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices")
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim()
    if (!query) return invoices
    return invoices.filter(i =>
      i.customerName?.toLowerCase().includes(query) ||
      i.invoiceNumber?.toLowerCase().includes(query) ||
      i.id?.toLowerCase().includes(query)
    )
  }, [invoices, q])

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [q])

  // ── revenue dashboard metrics ──
  const todaySales = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return invoices
      .filter(i => new Date(i.createdAt) >= t)
      .reduce((s, i) => s + i.total, 0)
  }, [invoices])

  const monthSales = useMemo(() => {
    const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0)
    return invoices
      .filter(i => new Date(i.createdAt) >= m)
      .reduce((s, i) => s + i.total, 0)
  }, [invoices])

  const collectionStats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.total, 0)
    const paidAmt = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0)
    const overdueAmt = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + getOutstanding(i), 0)
    const partialAmt = invoices.filter(i => i.status === "partial").reduce((s, i) => s + getOutstanding(i), 0)
    return { total, paidAmt, overdueAmt, partialAmt }
  }, [invoices])

  const attentionInvs = useMemo(() =>
    invoices.filter(i => i.status === "overdue").sort((a, b) => daysSince(b.dueAt) - daysSince(a.dueAt)),
    [invoices]
  )

  // ── export (moved to secondary actions) ──
  const exportExcel = () => {
    import("xlsx").then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
        ID: i.invoiceNumber || i.id.slice(0, 8),
        Date: new Date(i.createdAt).toLocaleDateString(),
        Customer: i.customerName,
        Phone: i.customerPhone,
        Amount: i.total,
        Status: i.status,
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Invoices")
      XLSX.writeFile(wb, "Invoices_Export.xlsx")
    })
    setActionsOpen(false)
  }

  const exportPDF = () => {
    import("jspdf").then(({ default: JSPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new JSPDF()
        doc.text("Invoices Report", 14, 15)
        autoTable(doc, {
          startY: 20,
          head: [["ID", "Date", "Customer", "Amount", "Status"]],
          body: filtered.map(i => [
            i.invoiceNumber || i.id.slice(0, 8),
            new Date(i.createdAt).toLocaleDateString(),
            i.customerName,
            formatINR(i.total),
            i.status,
          ]),
        })
        doc.save("Invoices_Export.pdf")
      })
    })
    setActionsOpen(false)
  }

  // ── loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-6 bg-muted animate-pulse rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
          </div>
          <div className="h-10 bg-muted animate-pulse rounded-lg" />
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="border border-red-200 rounded-lg p-8 text-center bg-card">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-900 mb-1">Something went wrong</p>
            <p className="text-xs text-red-600 mb-4">{error}</p>
            <button onClick={loadInvoices} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">Retry</button>
          </div>
        </div>
      </div>
    )
  }

  // ── render ──
  return (
    <div className="min-h-screen bg-muted/50 pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* ═══════════════════════════
           HEADER
           ═══════════════════════════ */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {invoices.length} total &middot; {formatINR(monthSales)} this month
            </p>
          </div>
          <Link
            href="/pos"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> Create Invoice
          </Link>
        </div>

        {/* ═══════════════════════════
           REVENUE DASHBOARD (Hero)
           ═══════════════════════════ */}
        <div className="bg-card border border-border rounded-lg">
          {/* Top row: KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border border-b border-border">
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Today&apos;s sales</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR(todaySales)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {invoices.filter(i => new Date(i.createdAt) >= new Date(new Date().setHours(0, 0, 0, 0))).length} invoices
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">This month</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR(monthSales)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> {invoices.filter(i => new Date(i.createdAt) >= new Date(new Date().setDate(1))).length} invoices
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Collection rate</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {collectionStats.total > 0 ? Math.round((collectionStats.paidAmt / collectionStats.total) * 100) : 0}%
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{
                  width: `${collectionStats.total > 0 ? (collectionStats.paidAmt / collectionStats.total) * 100 : 0}%`
                }} />
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Attention required</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {attentionInvs.length}
              </p>
              <p className="text-[10px] text-rose-600 mt-0.5">
                {formatINR(attentionInvs.reduce((s, i) => s + getOutstanding(i), 0))} overdue
              </p>
            </div>
          </div>

          {/* Bottom row: Collection status bars + Action */}
          <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
            <div className="px-4 py-3 space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Collection breakdown</p>
              <div className="space-y-1">
                {[
                  { label: "Paid", amt: collectionStats.paidAmt, cls: "bg-emerald-500" },
                  { label: "Overdue", amt: collectionStats.overdueAmt, cls: "bg-rose-500" },
                  { label: "Partial", amt: collectionStats.partialAmt, cls: "bg-amber-500" },
                ].map(b => {
                  const pct = collectionStats.total > 0 ? (b.amt / collectionStats.total) * 100 : 0
                  if (pct === 0) return null
                  return (
                    <div key={b.label} className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-muted-foreground">{b.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right font-medium tabular-nums text-foreground">{pct.toFixed(0)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-rose-700">
                  {attentionInvs.length} overdue invoice{attentionInvs.length !== 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatINR(attentionInvs.reduce((s, i) => s + getOutstanding(i), 0))} collectable
                </p>
              </div>
              <Link
                href="/cashflow"
                className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted"
              >
                Open Recovery <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════
           TOOLBAR
           ═══════════════════════════ */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by party or invoice #"
              className="w-full h-10 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="relative" ref={actionsRef}>
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> Actions
            </button>
            {actionsOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] z-20 py-1">
                <button onClick={exportExcel} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
                </button>
                <button onClick={exportPDF} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted">
                  <FileText className="h-3.5 w-3.5 text-red-600" /> Export PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════
           INVOICE EXPLORER (card list)
           ═══════════════════════════ */}
        {filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-lg px-5 py-10 text-center">
            <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">
              {q ? "No invoices match" : "No invoices yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-5">
              {q ? "Try a different search term" : "Create your first invoice to get started"}
            </p>
            {!q && (
              <Link
                href="/pos"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-xs font-medium rounded-lg hover:bg-foreground/90"
              >
                <Plus className="h-3.5 w-3.5" /> Create Invoice
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visible.map(inv => {
              const badge = getStatusBadge(inv)
              const risk = getRisk(inv)
              const outstanding = getOutstanding(inv)
              return (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3 hover:border-border transition-colors group"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                    {inv.customerName?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{inv.customerName}</span>
                      {inv.customerPhone && (
                        <span className="text-[12px] text-muted-foreground font-mono">{inv.customerPhone}</span>
                      )}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {risk && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${risk.cls}`}>
                          {risk.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground font-medium">{inv.invoiceNumber || inv.id.slice(0, 8)}</span>
                      <span className="text-[10px] text-slate-300">&middot;</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} {new Date(inv.createdAt).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-slate-300">&middot;</span>
                      <span className="text-[11px] text-muted-foreground">Due {new Date(inv.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      {inv.paymentMode && (inv.status === "paid" || inv.status === "partial") && (
                        <>
                          <span className="text-[10px] text-slate-300">&middot;</span>
                          <span className="text-[11px] text-muted-foreground font-medium capitalize">{inv.paymentMode}</span>
                        </>
                      )}
                      {inv.status !== "paid" && outstanding !== inv.total && (
                        <>
                          <span className="text-[10px] text-slate-300">&middot;</span>
                          <span className="text-[11px] text-amber-600 font-medium tabular-nums">{formatINR(outstanding)} due</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className="text-base font-bold tabular-nums tracking-tight text-foreground">{formatINR(inv.total)}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </Link>
              )
            })}

            {hasMore && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="px-4 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Show more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════
           FAB — mobile
           ═══════════════════════════ */}
        <Link
          href="/pos"
          className="fixed bottom-6 right-5 lg:hidden z-40 h-14 w-14 rounded-full bg-foreground text-background shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] flex items-center justify-center hover:bg-foreground/90 active:scale-95 transition-all"
          aria-label="Create invoice"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </div>
    </div>
  )
}