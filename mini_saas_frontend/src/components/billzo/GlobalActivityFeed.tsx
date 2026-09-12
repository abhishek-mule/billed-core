'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Banknote, MessageSquare, Zap, FileText, Clock, AlertTriangle,
  RefreshCw, ArrowUpRight,
} from 'lucide-react'
import { cn, formatINR } from '@/lib/utils'

type FeedItem = {
  id: string
  type: string
  actor: 'merchant' | 'customer' | 'system'
  title: string
  timestamp: string
  customerId: string | null
  customerName: string | null
  amount: number | null
  detail: string | null
  category: 'payments' | 'recovery' | 'customers' | 'invoices'
  invoiceId: string | null
  invoiceNumber: string | null
  invoiceOverdue: number | null
  channel: string | null
  promiseDate: string | null
}

type FilterKey = 'all' | FeedItem['category']

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'payments', label: 'Payments' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'customers', label: 'Customers' },
  { key: 'invoices', label: 'Invoices' },
]

const CAT_META: Record<FeedItem['category'], { icon: any; soft: string; solid: string }> = {
  payments: {
    icon: Banknote,
    soft: 'hsl(var(--success) / 0.12)',
    solid: 'hsl(var(--success))',
  },
  recovery: {
    icon: Zap,
    soft: 'hsl(210 80% 50% / 0.1)',
    solid: 'hsl(210 80% 45%)',
  },
  customers: {
    icon: MessageSquare,
    soft: 'hsl(var(--warning) / 0.13)',
    solid: 'hsl(var(--warning))',
  },
  invoices: {
    icon: FileText,
    soft: 'hsl(var(--muted) / 0.55)',
    solid: 'hsl(var(--muted-foreground))',
  },
}

const INVOICE_TARGET = new Set([
  'payment_received',
  'payment_confirmed',
  'payment_failed',
  'customer_payment_reported',
  'promise_fulfilled',
  'invoice_created',
  'invoice_sent',
  'customer_viewed',
  'payment_link_opened',
])

function targetOf(it: FeedItem): string | null {
  if (INVOICE_TARGET.has(it.type) && it.invoiceId) return `/invoices/${encodeURIComponent(it.invoiceId)}`
  if (it.customerId) return `/recovery/customer/${encodeURIComponent(it.customerId)}`
  if (it.invoiceId) return `/invoices/${encodeURIComponent(it.invoiceId)}`
  return null
}

function dayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  const diff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= 7) return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()]
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function groupByDay(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const map = new Map<string, FeedItem[]>()
  for (const it of items) {
    const d = new Date(it.timestamp).toISOString().slice(0, 10)
    const arr = map.get(d) || []
    arr.push(it)
    map.set(d, arr)
  }
  return [...map.entries()]
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .map(([date, list]) => ({
      label: dayLabel(new Date(date + 'T00:00:00')),
      items: list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    }))
}

function fmt(n: number): string {
  return formatINR(n)
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function timeText(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    const diff = Math.floor(now.getTime() - d.getTime())
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    return `${Math.floor(diff / 3_600_000)}h ago`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const clock = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${clock}`
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${clock}`
}

function sentence(it: FeedItem): ReactNode {
  const who = it.customerName
  const inv = it.invoiceNumber ? ` for ${it.invoiceNumber}` : ''

  switch (it.type) {
    case 'payment_received':
    case 'payment_confirmed':
    case 'customer_payment_reported':
      if (who && it.amount != null) return <>{who} paid <b>{fmt(it.amount)}</b>{inv}</>
      if (it.amount != null) return <>received <b>{fmt(it.amount)}</b>{inv}</>
      if (who) return <>{who} made a payment{inv}</>
      return <>a payment was received{inv}</>

    case 'promise_received': {
      const by = it.promiseDate ? ` by ${fmtDate(it.promiseDate)}` : ''
      if (who && it.amount != null) return <>{who} promised to pay <b>{fmt(it.amount)}</b>{by}</>
      if (it.amount != null) return <>a payment of <b>{fmt(it.amount)}</b> was promised{by}</>
      return <>{who || 'A customer'} made a promise{by}</>
    }

    case 'promise_fulfilled':
      return <>{who || 'The customer'} kept the promise{it.amount != null ? <> — <b>{fmt(it.amount)}</b> paid</> : ''}</>

    case 'promise_broken':
      return <>{who || 'The customer'} missed the promised payment date{it.amount != null ? <> — <b>{fmt(it.amount)}</b> still due</> : ''}</>

    case 'customer.reply':
      return <>{who || 'A customer'} replied to your WhatsApp reminder</>

    case 'reminder_sent':
      return (
        <>BillZo sent a WhatsApp reminder{who ? ` to ${who}` : ''}
          {it.invoiceOverdue != null && it.invoiceOverdue > 0 ? <> · <b>{fmt(it.invoiceOverdue)}</b> overdue</> : null}</>
      )

    case 'reminder_scheduled':
      return <>Reminder scheduled{who ? ` for ${who}` : ''}</>

    case 'reminder_delivered':
      return <>BillZo&apos;s reminder was delivered{who ? ` to ${who}` : ''}</>

    case 'reminder_read':
      return <>{who || 'The customer'} read the reminder</>

    case 'reminder_failed':
      return <>Reminder could not be delivered{who ? ` to ${who}` : ''}</>

    case 'merchant_called':
    case 'call_outcome':
      return <>You marked a recovery call completed{who ? ` for ${who}` : ''}</>

    case 'invoice_created':
      return (
        <>invoice of <b>{it.amount != null ? fmt(it.amount) : '—'}</b> created{who ? ` for ${who}` : ''}{it.invoiceNumber ? ` (${it.invoiceNumber})` : ''}</>
      )

    case 'invoice_sent':
      return <>Invoice {it.invoiceNumber || ''} sent{who ? ` to ${who}` : ''}</>

    case 'customer_viewed':
      return <>{who || 'A customer'} viewed their invoice</>

    case 'payment_link_opened':
      return <>{who || 'A customer'} opened the payment link</>

    case 'case_opened':
      return <>Recovery case opened{who ? ` for ${who}` : ''}</>

    case 'case_closed':
      return <>Recovery case closed{who ? ` for ${who}` : ''}</>

    case 'escalated':
      return <>Recovery escalated{who ? ` for ${who}` : ''}</>

    case 'disputed':
      return <>Payment disputed{who ? ` by ${who}` : ''}</>

    case 'note_added':
      return <>A note was added{who ? ` for ${who}` : ''}</>

    case 'automation_started':
      return <>BillZo started recovery automation</>

    case 'automation_stopped':
      return <>BillZo stopped recovery automation{it.detail ? ` — ${it.detail}` : ''}</>

    default:
      if (it.detail) return <>{it.detail}</>
      if (who) return <>{who}</>
      return <>{it.title}</>
  }
}

function contextLine(it: FeedItem): string | null {
  if (it.type === 'customer.reply' && it.detail) return `“${it.detail}”`
  if (it.type === 'reminder_failed') return it.detail
  return null
}

export function GlobalActivityFeed() {
  const router = useRouter()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recovery/feed?limit=100', { credentials: 'include' })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const json = await res.json()
      setItems(json.feed || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => (filter === 'all' ? items : items.filter((it) => it.category === filter)), [items, filter])

  if (loading) {
    return (
      <div className="rc-empty"><Loader2 className="spin" size={18} /><span>Loading activity…</span></div>
    )
  }

  if (error) {
    return (
      <div className="rc-empty">
        <AlertTriangle size={18} />
        <span>{error}</span>
        <button onClick={load} className="rc-btn rc-btn--ghost"><RefreshCw size={13} /> Retry</button>
      </div>
    )
  }

  const groups = groupByDay(filtered)

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-1 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              filter === f.key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rc-empty rc-empty--calm">
          <Clock size={22} className="rc-empty-ic" />
          <p className="rc-empty-title">No activity yet</p>
          <p className="rc-empty-sub">Recovery actions, payments and customer replies appear here as they are recorded.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="rc-empty">
          <Clock size={18} />
          <span>No {filter === 'all' ? '' : filter} activity yet.</span>
        </div>
      ) : (
        <div className="tls">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="tls-head">{g.label}</div>
              {g.items.map((it) => {
                const meta = CAT_META[it.category]
                const Icon = meta.icon
                const target = targetOf(it)
                const ctx = contextLine(it)
                return (
                  <div
                    key={it.id}
                    className="tls-row"
                    style={{ cursor: target ? 'pointer' : 'default' }}
                    onClick={() => target && router.push(target)}
                    aria-hidden={!target}
                  >
                    <span className="tls-icon" style={{ background: meta.soft, color: meta.solid }}>
                      <Icon size={14} />
                    </span>
                    <div className="tls-body">
                      <p className="tls-line">
                        {it.title}
                        {target ? (
                          <ArrowUpRight size={13} className="inline ml-1 text-muted-foreground/60 align-[-1px]" />
                        ) : null}
                      </p>
                      <p className="tls-line--sub mt-0.5">{sentence(it)}</p>
                      {ctx ? <p className="tls-detail italic">{ctx}</p> : null}
                      <span className="tls-time">{timeText(it.timestamp)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}