'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import '@/styles/recovery-center.css'
import {
  Phone, MessageSquare, Send, UserPlus, Loader2,
  CheckCircle2, Clock, ArrowRight, X, RotateCcw,
  UserX, Zap, AlertTriangle, Bot, Banknote,
  IndianRupee, Activity, RefreshCw,
} from 'lucide-react'
import { formatINR } from '@/lib/utils'
import { RecoveryCreditsPanel } from '@/components/billzo/RecoveryCreditsPanel'

type SectionKey = 'needs_you' | 'automated' | 'monitoring' | 'exhausted'

type RecoveryCard = {
  customerId: string
  customerName: string
  phone: string | null
  outstanding: number
  invoiceCount: number
  maxOverdueDays: number
  section: SectionKey
  state: 'blocked_phone' | 'recovered' | 'call' | 'remind' | 'waiting' | 'exhausted' | 'blocked_transport' | 'none'
  headline: string
  reason: string
  targetInvoiceId: string | null
  evidence: {
    lastDelivery: { status: 'read' | 'delivered' | 'sent' | 'failed' | null; at: string | null }
    replied: boolean
    replyPreview: string | null
    promiseDate: string | null
  }
  cta: {
    type: 'add_phone' | 'call' | 'send_reminder' | 'view_details' | 'view_payment'
    label: string
    href?: string
  }
}

type RecoveryCommandCenter = {
  summary: {
    totalCases: number
    needsYou: number
    automated: number
    monitoring: number
    exhausted: number
    totalOutstanding: number
  }
  needsYou: RecoveryCard[]
  billzoIsHandling: RecoveryCard[]
  monitoring: RecoveryCard[]
  exhausted: RecoveryCard[]
  generatedAt: string
}

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
}

const SECTION_META: Record<SectionKey, { label: string; icon: React.ReactNode; description: string; dot: string }> = {
  needs_you: {
    label: 'NEEDS YOU',
    icon: <UserX size={16} />,
    description: 'Cases BillZo cannot safely handle — your action required',
    dot: 'rc-dot--red',
  },
  automated: {
    label: 'BILLZO IS HANDLING',
    icon: <Zap size={16} />,
    description: 'Automated recovery currently running',
    dot: 'rc-dot--blue',
  },
  monitoring: {
    label: 'MONITORING',
    icon: <Clock size={16} />,
    description: 'Customer has been contacted — BillZo is waiting for evidence',
    dot: 'rc-dot--green',
  },
  exhausted: {
    label: 'RECOVERY EXHAUSTED',
    icon: <AlertTriangle size={16} />,
    description: 'Automated recovery stopped — you are handling these personally',
    dot: 'rc-dot--orange',
  },
}

const fmt = (n: number) => formatINR(n)
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 30_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

const FEED_ACTOR = {
  icon: { merchant: Banknote, system: Bot, customer: MessageSquare },
  cls: { merchant: 'rc-tl-ic--merchant', system: 'rc-tl-ic--system', customer: 'rc-tl-ic--customer' },
} as const

export default function RecoveryCommandCenterPage() {
  const router = useRouter()
  const [data, setData] = useState<RecoveryCommandCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [phoneModal, setPhoneModal] = useState(false)
  const [phoneCase, setPhoneCase] = useState<RecoveryCard | null>(null)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recovery/command-center', { credentials: 'include' })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      const res = await fetch('/api/recovery/feed?limit=25', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setFeed(json.feed ?? [])
      }
    } catch {
      /* non-fatal */
    } finally {
      setFeedLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => { void loadFeed() }, [loadFeed])

  const refresh = useCallback(() => {
    setRefreshing(true)
    void loadData()
    void loadFeed()
  }, [loadData, loadFeed])

  const handleSend = async (customerId: string) => {
    setSending(customerId)
    try {
      const res = await fetch('/api/recovery/queue/actions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: customerId,
          action: 'send_reminder',
          customerId,
          payload: { origin: 'recovery_command_center' },
        }),
      })
      if (res.ok) {
        toast.success('Reminder sent')
        void loadData()
        void loadFeed()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as any).error || data?.message || 'Could not send reminder')
      }
    } catch {
      toast.error('Network error — could not send reminder')
    } finally {
      setSending(null)
    }
  }

  const openPhoneModal = (c: RecoveryCard) => {
    setPhoneCase(c)
    setPhoneDraft('')
    setPhoneModal(true)
  }

  const ACTION_TOAST: Record<string, string> = {
    escalate: 'Escalated — BillZo stopped automated recovery for this case',
    snooze: 'Snoozed 3 days',
    mark_disputed: 'Marked as disputed',
  }

  const handleAction = async (c: RecoveryCard, action: string, extra: Record<string, any> = {}) => {
    const key = `${c.customerId}:${action}`
    setActing(key)
    try {
      const res = await fetch('/api/recovery/queue/actions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: c.customerId,
          action,
          customerId: c.customerId,
          payload: { origin: 'recovery_command_center', ...extra },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error((data as any).error || data?.message || `Could not ${action}`)
        return
      }
      toast.success(ACTION_TOAST[action] || 'Done')
      void loadData()
      void loadFeed()
    } catch {
      toast.error('Network error — could not complete action')
    } finally {
      setActing(null)
    }
  }

  const savePhone = async () => {
    if (!phoneCase?.customerId || !phoneDraft.trim()) return
    setSavingPhone(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: phoneCase.customerId, phone: phoneDraft.trim() }),
      })
      if (res.ok) {
        setPhoneModal(false)
        setPhoneCase(null)
        setPhoneDraft('')
        toast.success('Phone number saved')
        void loadData()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as any).error || 'Could not save phone number')
      }
    } catch {
      toast.error('Network error — could not save phone number')
    } finally {
      setSavingPhone(false)
    }
  }

  if (loading) {
    return (
      <div className="rc-page" aria-busy="true">
        <div>
          <div className="rc-skeleton" style={{ height: 28, width: '45%', marginBottom: 10 }} />
          <div className="rc-skeleton" style={{ height: 14, width: '64%' }} />
        </div>
        <div className="rc-stat-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rc-skeleton" style={{ height: 88 }} />
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rc-block">
            <div className="rc-skeleton" style={{ height: 18, width: '38%' }} />
            {Array.from({ length: 2 }).map((__, j) => (
              <div key={j} className="rc-skeleton" style={{ height: 128 }} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rc-page">
        <div className="rc-error" role="alert">
          <span className="rc-error-ic"><AlertTriangle size={22} /></span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Couldn&apos;t load recovery</div>
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
              {error ?? 'Something went wrong'}
            </div>
          </div>
          <button className="rc-btn rc-btn--primary rc-retry" onClick={() => refresh()}>
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      </div>
    )
  }

  const summary = data.summary
  const sections = [
    { key: 'needs_you' as SectionKey, items: data.needsYou ?? [], meta: SECTION_META.needs_you },
    { key: 'exhausted' as SectionKey, items: data.exhausted ?? [], meta: SECTION_META.exhausted },
    { key: 'automated' as SectionKey, items: data.billzoIsHandling ?? [], meta: SECTION_META.automated },
    { key: 'monitoring' as SectionKey, items: data.monitoring ?? [], meta: SECTION_META.monitoring },
  ].filter(s => s.items.length > 0)

  const stats = [
    { id: 'outstanding', label: 'Total Outstanding', value: fmt(summary.totalOutstanding), ic: <IndianRupee size={16} />, tone: 'recovery', span2: true },
    { id: 'cases', label: 'Active Cases', value: String(summary.totalCases), ic: <Activity size={16} />, tone: 'gray', span2: false },
    { id: 'needsYou', label: 'Need You', value: String(summary.needsYou), ic: <UserX size={16} />, tone: 'red', span2: false },
    { id: 'exhausted', label: 'Exhausted', value: String(summary.exhausted ?? 0), ic: <AlertTriangle size={16} />, tone: 'orange', span2: false },
    { id: 'automated', label: 'Automated', value: String(summary.automated), ic: <Zap size={16} />, tone: 'blue', span2: false },
    { id: 'monitoring', label: 'Monitoring', value: String(summary.monitoring), ic: <Clock size={16} />, tone: 'green', span2: false },
  ]

  return (
    <div className="rc-page">
      {/* Header */}
      <header className="rc-header">
        <div>
          <h1 className="rc-greeting">Recovery</h1>
          <p className="rc-sub" style={{ marginTop: 3 }}>
            Your automated collection command center
          </p>
          <span className="rc-updated">
            <span className="rc-updated-dot" />
            Updated {relativeTime(data.generatedAt)}
          </span>
        </div>
        <button className="rc-refresh" onClick={refresh} aria-label="Refresh" title="Refresh">
          {refreshing || loading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} className={refreshing ? 'spin' : ''} />}
        </button>
      </header>

      {/* Summary stats */}
      <div className="rc-stat-grid">
        {stats.map((s) => (
          <div key={s.id} className={`rc-stat ${s.span2 ? 'rc-stat--span2' : ''}`}>
            <div className="rc-stat-top">
              <span className={`rc-stat-ic rc-stat-ic--${s.tone}`}>{s.ic}</span>
              <ArrowRight size={14} style={{ color: 'hsl(var(--muted-foreground))', opacity: 0.5 }} />
            </div>
            <div className="rc-stat-label">{s.label}</div>
            <div className={`rc-stat-value rc-stat-value--${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Recovery credits (Phase B) — rendered only for credit-enabled tenants */}
      <RecoveryCreditsPanel />

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="rc-empty--calm">
          <span className="rc-empty-ic"><CheckCircle2 size={26} /></span>
          <div className="rc-empty-title">All caught up</div>
          <div className="rc-empty-sub">
            No customers need recovery action right now. You&apos;re on top of your receivables.
          </div>
        </div>
      ) : (
        sections.map(({ key, items, meta }, idx) => (
          <section key={key} className="rc-block rc-section">
            <div className="rc-block-head">
              <span className={`rc-dot ${meta.dot}`} />
              <h2>{meta.label}</h2>
              <span className="rc-count">{items.length}</span>
              <span className="rc-section-desc">{meta.description}</span>
            </div>
            <div className="rc-list rc-list--tight">
              {items.map((c) => (
                <RecoveryCard
                  key={c.customerId}
                  c={c}
                  sending={sending === c.customerId}
                  acting={acting}
                  onSend={() => handleSend(c.customerId)}
                  onAddPhone={() => openPhoneModal(c)}
                  onAction={(action, extra) => handleAction(c, action, extra)}
                  onOpen={() => router.push(`/recovery/customer/${encodeURIComponent(c.customerId)}`)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Activity feed */}
      <section className="rc-block rc-section" style={{ marginTop: 6 }}>
        <div className="rc-block-head rc-feed-head">
          <Activity size={15} style={{ color: 'hsl(var(--recovery))' }} />
          <h2>Recovery activity</h2>
          <Link href="/recovery/timeline" className="rc-count rc-count--muted" style={{ marginLeft: 'auto', fontWeight: 600 }}>
            Full activity →
          </Link>
        </div>
        {feedLoading && feed.length === 0 ? (
          <div className="rc-empty"><Loader2 className="spin" size={18} /><span>Loading activity…</span></div>
        ) : feed.length === 0 ? (
          <div className="rc-empty"><MessageSquare size={18} /><span>No recovery activity recorded yet.</span></div>
        ) : (
          <div className="rc-timeline">
            {feed.slice(0, 10).map((it) => {
              const ActorIcon = FEED_ACTOR.icon[it.actor]
              return (
                <div key={it.id} className="rc-tl-item">
                  <span className={`rc-tl-ic ${FEED_ACTOR.cls[it.actor]}`}>
                    {it.amount != null ? <Banknote size={14} /> : <ActorIcon size={14} />}
                  </span>
                  <div className="rc-tl-body">
                    <span className="rc-tl-text">
                      {it.title}
                      {it.customerName ? ` · ${it.customerName}` : ''}
                      {it.amount != null ? (
                        <> · <span className="rc-tl-amt">{fmt(it.amount)}</span></>
                      ) : null}
                    </span>
                    {it.detail ? <span className="rc-tl-detail">{it.detail}</span> : null}
                    {it.customerId ? (
                      <button className="rc-tl-open" onClick={() => router.push(`/recovery/customer/${encodeURIComponent(it.customerId!)}`)}>
                        open →
                      </button>
                    ) : null}
                  </div>
                  <div className="rc-tl-time">{fmtTime(it.timestamp)} {fmtDate(it.timestamp)}</div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Add phone modal */}
      {phoneModal && phoneCase && (
        <div className="rc-modal" role="dialog" aria-modal="true">
          <div className="rc-modal-card">
            <div className="rc-modal-head">
              <UserPlus size={16} />
              <span>WhatsApp number</span>
              <button className="rc-modal-close" onClick={() => setPhoneModal(false)} aria-label="Close"><X size={15} /></button>
            </div>
            <p className="rc-modal-sub">
              Recovery for <strong>{phoneCase.customerName}</strong> can&apos;t start without a customer number.
            </p>
            <input
              className="rc-modal-input"
              placeholder="+91 XXXXX XXXXX"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              inputMode="tel"
              autoFocus
              aria-label="Phone number"
            />
            <div className="rc-modal-actions">
              <button className="rc-btn rc-btn--ghost" onClick={() => setPhoneModal(false)}>Cancel</button>
              <button className="rc-btn rc-btn--primary" onClick={savePhone} disabled={savingPhone || !phoneDraft.trim()}>
                {savingPhone ? <Loader2 className="spin" size={14} /> : null} Save number
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Card state → STATUS / NEXT ACTION / ownership ──────────────────────────
type CardState = 'blocked_phone' | 'call' | 'remind' | 'waiting' | 'recovered' | 'blocked_transport' | 'exhausted'

function cardMeta(state: CardState, c: RecoveryCard): { statusLabel: string; nextAction: string; ownedBy: 'merchant' | 'billzo'; tone: 'red' | 'blue' | 'green' | 'orange' } {
  switch (state) {
    case 'blocked_phone':
      return { statusLabel: 'Blocked — phone number missing', nextAction: 'Add phone number', ownedBy: 'merchant', tone: 'red' }
    case 'blocked_transport':
      return { statusLabel: 'Blocked — WhatsApp delivery failing', nextAction: 'Fix WhatsApp delivery', ownedBy: 'merchant', tone: 'red' }
    case 'exhausted':
      return { statusLabel: 'Recovery exhausted — handled manually', nextAction: 'Handle manually', ownedBy: 'merchant', tone: 'orange' }
    case 'call':
      return { statusLabel: 'Phone call needed', nextAction: 'Call customer', ownedBy: 'merchant', tone: 'orange' }
    case 'remind':
      return { statusLabel: 'Due for a reminder', nextAction: 'Send reminder', ownedBy: 'billzo', tone: 'blue' }
    case 'waiting': {
      if (c.evidence.replied) return { statusLabel: 'Customer replied', nextAction: 'View details', ownedBy: 'billzo', tone: 'green' }
      if (c.evidence.lastDelivery.status) return { statusLabel: `Reminder ${c.evidence.lastDelivery.status} — awaiting response`, nextAction: 'View details', ownedBy: 'billzo', tone: 'green' }
      return { statusLabel: 'Awaiting response', nextAction: 'View details', ownedBy: 'billzo', tone: 'green' }
    }
    case 'recovered':
      return { statusLabel: 'Recovered', nextAction: 'View payment', ownedBy: 'billzo', tone: 'green' }
    default:
      return { statusLabel: 'Review', nextAction: 'View details', ownedBy: 'merchant', tone: 'blue' }
  }
}

function RecoveryCard({ c, sending, acting, onSend, onAddPhone, onAction, onOpen }: {
  c: RecoveryCard
  sending: boolean
  acting: string | null
  onSend: () => void
  onAddPhone: () => void
  onAction: (action: string, extra?: Record<string, any>) => void
  onOpen: () => void
}) {
  const meta = cardMeta(c.state as CardState, c)
  const overdue = c.maxOverdueDays
  const { cta } = c

  // Merchant decision actions — identical on every card. "Resume recovery"
  // is deliberately NOT offered here: an exhausted case requires an explicit
  // merchant decision, not an automatic continuation (Phase B reactivation).
  const quickActions = [
    { action: 'escalate', label: 'Escalate' },
    { action: 'snooze', label: 'Pause' },
    { action: 'mark_disputed', label: 'Dispute' },
  ]

  const renderCTA = () => {
    if (cta.type === 'add_phone') {
      return (
        <button className="cw-record-payment cw-record-payment--danger" onClick={onAddPhone}>
          <UserPlus size={18} /> Add phone number
        </button>
      )
    }
    if (cta.type === 'call') {
      if (cta.href) {
        return (
          <a className="cw-record-payment cw-record-payment--phone" style={{ textDecoration: 'none' }} href={cta.href}>
            <Phone size={18} /> Call customer
          </a>
        )
      }
      return (
        <button className="cw-record-payment cw-record-payment--phone" onClick={onAddPhone}>
          <UserPlus size={18} /> Add phone number
        </button>
      )
    }
    if (cta.type === 'send_reminder') {
      return (
        <button className="cw-record-payment" disabled={sending} onClick={onSend}>
          {sending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          {sending ? 'Sending…' : 'Send reminder'}
        </button>
      )
    }
    // view_details or view_payment
    return (
      <button className="cw-record-payment cw-record-payment--ghost" onClick={onOpen}>
        {cta.type === 'view_payment' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
        {cta.label}
      </button>
    )
  }

  return (
    <div className={`rc-card rc-card--${meta.tone}`}>
      <div className="rc-card-top">
        <span className={`rc-owner rc-owner--${meta.ownedBy}`}>
          {meta.ownedBy === 'billzo' ? <><Zap size={12} /> BILLZO</> : <><UserX size={12} /> YOU</>}
        </span>
        <span className="rc-card-amount">{fmt(c.outstanding)}</span>
      </div>

      <div className="rc-card-id-row">
        <span className={`rc-avatar rc-avatar--${meta.tone}`}>{initials(c.customerName)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="rc-card-name" style={{ margin: 0 }}>{c.customerName}</div>
          <div className="rc-card-sub" style={{ margin: '1px 0 0' }}>
            {overdue > 0 ? `${overdue} days overdue` : 'Current'}
            {c.invoiceCount > 1 ? ` · ${c.invoiceCount} invoices` : ''}
          </div>
        </div>
      </div>

      <dl className="rc-facts rc-facts--grid" style={{ marginTop: 12 }}>
        <div className="rc-fact">
          <dt>STATUS</dt>
          <dd>{meta.statusLabel}</dd>
        </div>
        <div className="rc-fact">
          <dt>NEXT ACTION</dt>
          <dd>{meta.nextAction}</dd>
        </div>
        <div className="rc-fact rc-fact--wide">
          <dt>WHY</dt>
          <dd>{c.reason}</dd>
        </div>
      </dl>

      <div className="rc-card-foot">
        <div className="rc-card-cta">{renderCTA()}</div>
        <div className="rc-card-actions">
          {quickActions.map((a) => {
            const key = `${c.customerId}:${a.action}`
            const busy = acting === key
            return (
              <button
                key={key}
                className="cw-record-payment cw-record-payment--ghost"
                disabled={busy || sending}
                onClick={() => onAction(a.action)}
              >
                {busy ? <Loader2 className="spin" size={14} /> : null}
                {a.label}
              </button>
            )
          })}
        </div>
        <button className="rc-card-open" onClick={onOpen}>
          Open <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}