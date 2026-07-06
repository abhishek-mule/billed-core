"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search, RefreshCw, Send, Loader2, CheckCircle2,
  AlertCircle, Clock, MessageSquare, Pause, Hand,
  Bell, ChevronRight,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { PromiseModal } from "@/components/billzo/PromiseModal"
import { PauseModal } from "@/components/billzo/PauseModal"

interface QueueItem {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  openInvoiceCount: number
  nextActionType: string
  nextActionDueAt: string | null
  recoveryState: string
  engagementState: string
  promiseToPayDate: string | null
  automationMode: string
  attentionScore: number
}

interface ApiResponse {
  cases: QueueItem[]
  total: number
}

const ACTION_LABELS: Record<string, string> = {
  send_reminder: "Send gentle reminder",
  call: "Call customer",
  follow_up_call: "Follow up call",
  wait: "Waiting",
  merchant_review: "Review needed",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
}

function formatRelative(iso: string | null) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < -86400000) return { label: `${formatDate(iso)}`, overdue: true }
  if (diff < 0) return { label: "Today", overdue: false }
  if (diff < 86400000) return { label: "Today", overdue: false }
  if (diff < 172800000) return { label: "Tomorrow", overdue: false }
  if (diff < 604800000) return { label: new Date(iso).toLocaleDateString("en-IN", { weekday: "long" }), overdue: false }
  return { label: formatDate(iso), overdue: false }
}

function getNextActionClass(nextActionType: string) {
  switch (nextActionType) {
    case "send_reminder": return "bg-blue-50 text-blue-700 border-blue-200"
    case "call":
    case "follow_up_call": return "bg-amber-50 text-amber-700 border-amber-200"
    case "wait": return "bg-purple-50 text-purple-700 border-purple-200"
    case "merchant_review": return "bg-rose-50 text-rose-700 border-rose-200"
    default: return "bg-muted/50 text-muted-foreground border-border"
  }
}

function getGroupLabel(item: QueueItem): string {
  if (item.promiseToPayDate) return "Promises"
  if (!item.nextActionDueAt) return "Needs Review"
  const diff = new Date(item.nextActionDueAt).getTime() - Date.now()
  if (diff < 0) return "Overdue"
  if (diff < 86400000) return "Today"
  if (diff < 172800000) return "Tomorrow"
  if (diff < 604800000) return "This Week"
  return "Later"
}

const GROUP_ORDER = ["Overdue", "Today", "Tomorrow", "This Week", "Promises", "Needs Review", "Later"]

export default function RecoveryQueuePage() {
  const router = useRouter()
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sending, setSending] = useState<string | null>(null)
  const [promiseFor, setPromiseFor] = useState<QueueItem | null>(null)
  const [pauseFor, setPauseFor] = useState<QueueItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/schedule", { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: ApiResponse = await res.json()
      setItems(data.cases)
    } catch (err: any) {
      setError(err.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener("billzo:changed", load)
    return () => window.removeEventListener("billzo:changed", load)
  }, [load])

  const sendNow = async (item: QueueItem) => {
    setSending(item.caseId)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: item.caseId,
          action: "send_reminder",
          customerId: item.customerId,
        }),
      })
      if (res.ok) load()
    } catch { } finally {
      setSending(null)
    }
  }

  const filtered = items.filter(c =>
    !search || c.customerName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: filtered.filter(i => getGroupLabel(i) === group),
  })).filter(g => g.items.length > 0)

  const totalAtRisk = filtered.reduce((s, i) => s + i.totalOverdue, 0)
  const overdueCount = grouped.find(g => g.group === "Overdue")?.items.length || 0
  const todayCount = grouped.find(g => g.group === "Today")?.items.length || 0
  const promiseCount = grouped.find(g => g.group === "Promises")?.items.length || 0
  const promiseAmount = grouped
    .find(g => g.group === "Promises")?.items
    .reduce((s, i) => s + i.totalOverdue, 0) || 0

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{MerchantLanguage.recovery.manage}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{MerchantLanguage.recovery.manageSubtitle}</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {MerchantLanguage.common.refresh}
          </button>
        </div>

        {/* Summary cards */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{MerchantLanguage.recovery.totalCustomers}</p>
              <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{filtered.length}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{MerchantLanguage.recovery.atRisk}</p>
              <p className="text-xl font-bold text-foreground mt-1 tabular-nums">₹{totalAtRisk.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-card rounded-xl border border-rose-200 p-4">
              <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider">{MerchantLanguage.recovery.overdueToday}</p>
              <p className="text-xl font-bold text-rose-700 mt-1 tabular-nums">{overdueCount}</p>
            </div>
            <div className="bg-card rounded-xl border border-purple-200 p-4">
              <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider">{MerchantLanguage.recovery.promises}</p>
              <p className="text-xl font-bold text-purple-700 mt-1 tabular-nums">{promiseCount} · ₹{promiseAmount.toLocaleString('en-IN')}</p>
            </div>
          </div>
        )}

        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={MerchantLanguage.recovery.searchByNameOrPhone}
            className="w-full h-10 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && (
          <div className="border border-red-200 rounded-lg p-4 bg-card">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-card rounded-lg border border-border animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-lg p-12 text-center">
            <Bell className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No upcoming actions</p>
            <p className="text-xs text-muted-foreground mt-1">{MerchantLanguage.state.allCaughtUp} New reminders will appear here when scheduled.</p>
          </div>
        )}

        {!loading && grouped.map(({ group, items }) => (
          <section key={group} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                group === "Overdue" ? "bg-rose-100 text-rose-700" :
                group === "Today" ? "bg-blue-100 text-blue-700" :
                group === "Promises" ? "bg-purple-100 text-purple-700" :
                group === "Needs Review" ? "bg-amber-100 text-amber-700" :
                "bg-muted text-muted-foreground"
              }`}>
                {group === "Overdue" ? "⚠" : group === "Promises" ? "🤝" : group === "Needs Review" ? "👀" : "📅"} {group}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">{items.length} item{items.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2">
              {items.map(item => (
                <div key={item.caseId} className="bg-card border border-border rounded-xl p-4 hover:shadow-sm dark:hover:shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/parties/${item.customerId}`} className="hover:text-primary transition-colors">
                          <p className="font-semibold text-foreground">{item.customerName}</p>
                        </Link>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getNextActionClass(item.nextActionType)}`}>
                          {ACTION_LABELS[item.nextActionType] || item.nextActionType}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong className="text-foreground">{formatINR(item.totalOverdue)}</strong>
                        {" "}across {item.openInvoiceCount} invoice{item.openInvoiceCount !== 1 ? "s" : ""}
                      </p>
                      {item.nextActionDueAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <Clock size={11} className="inline mr-1" />
                          Scheduled: {formatDate(item.nextActionDueAt)} at {formatTime(item.nextActionDueAt)}
                        </p>
                      )}
                      {item.promiseToPayDate && (
                        <p className="text-xs text-purple-600 mt-1">
                          <Hand size={11} className="inline mr-1" />
                          Promise to pay by {formatDate(item.promiseToPayDate)}
                          {new Date(item.promiseToPayDate) < new Date() && (
                            <span className="text-rose-600"> (overdue)</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => sendNow(item)}
                        disabled={sending === item.caseId}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.97]"
                      >
                        {sending === item.caseId ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Send now
                      </button>
                      <button
                        onClick={() => setPromiseFor(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-all"
                      >
                        <Hand size={12} />
                        Promise
                      </button>
                      <button
                        onClick={() => setPauseFor(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all"
                      >
                        <Pause size={12} />
                        Pause
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {!loading && grouped.length > 0 && (
          <div className="border-t border-border pt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} action{filtered.length !== 1 ? "s" : ""} scheduled</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Send</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Call</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Wait</span>
            </div>
          </div>
        )}
      </div>

      {promiseFor && (
        <PromiseModal
          customerId={promiseFor.customerId}
          customerName={promiseFor.customerName}
          amount={promiseFor.totalOverdue}
          caseId={promiseFor.caseId}
          onClose={() => setPromiseFor(null)}
          onSuccess={() => { setPromiseFor(null); load() }}
        />
      )}

      {pauseFor && (
        <PauseModal
          customerId={pauseFor.customerId}
          customerName={pauseFor.customerName}
          caseId={pauseFor.caseId}
          onClose={() => setPauseFor(null)}
          onSuccess={() => { setPauseFor(null); load() }}
        />
      )}
    </div>
  )
}
