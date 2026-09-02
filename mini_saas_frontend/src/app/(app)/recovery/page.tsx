'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import '@/styles/recovery-center.css'
import {
  Phone, MessageSquare, Send, UserPlus, Loader2,
  CheckCircle2, Clock, ArrowRight, X, RotateCcw,
  UserX, Zap, Target, AlertTriangle,
} from 'lucide-react'
import { formatINR } from '@/lib/utils'

type SectionKey = 'needs_you' | 'automated' | 'monitoring'

type RecoveryCard = {
  customerId: string
  customerName: string
  phone: string | null
  outstanding: number
  invoiceCount: number
  maxOverdueDays: number
  section: SectionKey
  state: 'blocked_phone' | 'recovered' | 'call' | 'remind' | 'waiting' | 'none'
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
    totalOutstanding: number
  }
  needsYou: RecoveryCard[]
  billzoIsHandling: RecoveryCard[]
  monitoring: RecoveryCard[]
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
}

const fmt = (n: number) => formatINR(n)
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

export default function RecoveryCommandCenterPage() {
  const router = useRouter()
  const [data, setData] = useState<RecoveryCommandCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [phoneModal, setPhoneModal] = useState(false)
  const [phoneCase, setPhoneCase] = useState<RecoveryCard | null>(null)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)

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
        await loadData()
        void loadFeed()
      } else {
        const data = await res.json().catch(() => ({}))
        alert((data as any).error || data?.message || 'Could not send reminder')
      }
    } catch {
      alert('Network error — could not send reminder')
    } finally {
      setSending(null)
    }
  }

  const openPhoneModal = (c: RecoveryCard) => {
    setPhoneCase(c)
    setPhoneDraft('')
    setPhoneModal(true)
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
        await loadData()
      } else {
        const data = await res.json().catch(() => ({}))
        alert((data as any).error || 'Could not save phone number')
      }
    } catch {
      alert('Network error — could not save phone number')
    } finally {
      setSavingPhone(false)
    }
  }

  if (loading) {
    return (
      <div className="rc-loading">
        <Loader2 className="spin" size={22} />
        <span>Loading your recovery command center…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rc-loading">
        <span>{error ?? 'Something went wrong'}</span>
        <button className="rc-btn" onClick={() => loadData()}>Retry</button>
      </div>
    )
  }

  const summary = data.summary
  const sections = [
    { key: 'needs_you' as SectionKey, items: data.needsYou, meta: SECTION_META.needs_you },
    { key: 'automated' as SectionKey, items: data.billzoIsHandling, meta: SECTION_META.automated },
    { key: 'monitoring' as SectionKey, items: data.monitoring, meta: SECTION_META.monitoring },
  ].filter(s => s.items.length > 0)

  return (
    <div className="rc-page">
      {/* Header */}
      <header className="rc-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="rc-greeting">Recovery</h1>
          <p className="rc-yesterday" style={{ marginTop: 4, fontSize: 13 }}>
            <strong>{fmt(summary.totalOutstanding)}</strong> outstanding across <strong>{summary.totalCases}</strong> customer{summary.totalCases !== 1 ? 's' : ''}
            {' · '}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {summary.needsYou} need you
            </span>
            {' · '}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {summary.automated} automated
            </span>
            {' · '}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {summary.monitoring} monitoring
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="rc-refresh" onClick={() => { void loadData(); void loadFeed(); }} aria-label="Refresh">
            <RotateCcw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* Summary bar */}
      <div className="rc-summary-bar" style={{ display: 'flex', gap: 12, padding: '12px 0', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
        <div className="rc-summary-item" style={{ flex: 1, minWidth: 140 }}>
          <span className="rc-summary-label">Total Outstanding</span>
          <span className="rc-summary-value">{fmt(summary.totalOutstanding)}</span>
        </div>
        <div className="rc-summary-item" style={{ flex: 1, minWidth: 140 }}>
          <span className="rc-summary-label">Active Cases</span>
          <span className="rc-summary-value">{summary.totalCases}</span>
        </div>
        <div className="rc-summary-item" style={{ flex: 1, minWidth: 140 }}>
          <span className="rc-summary-label">Need You</span>
          <span className="rc-summary-value" style={{ color: 'var(--danger)' }}>{summary.needsYou}</span>
        </div>
        <div className="rc-summary-item" style={{ flex: 1, minWidth: 140 }}>
          <span className="rc-summary-label">Automated</span>
          <span className="rc-summary-value" style={{ color: 'var(--primary)' }}>{summary.automated}</span>
        </div>
        <div className="rc-summary-item" style={{ flex: 1, minWidth: 140 }}>
          <span className="rc-summary-label">Monitoring</span>
          <span className="rc-summary-value" style={{ color: 'var(--success)' }}>{summary.monitoring}</span>
        </div>
      </div>

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="rc-empty" style={{ padding: 48, textAlign: 'center' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--success)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>All caught up</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>No customers need recovery action right now.</div>
        </div>
      ) : (
        sections.map(({ key, items, meta }) => (
          <section key={key} className="rc-block" style={{ padding: 12 }}>
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
                  onSend={() => handleSend(c.customerId)}
                  onAddPhone={() => openPhoneModal(c)}
                  onOpen={() => router.push(`/recovery/customer/${encodeURIComponent(c.customerId)}`)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Activity feed */}
      <section className="rc-block" style={{ padding: 12, marginTop: 12 }}>
        <div className="rc-block-head">
          <h2>Recovery activity</h2>
          <Link href="/recovery/timeline" className="cw-link">Full activity →</Link>
        </div>
        {feedLoading && feed.length === 0 ? (
          <div className="rc-empty"><Loader2 className="spin" size={18} /><span>Loading activity…</span></div>
        ) : feed.length === 0 ? (
          <div className="rc-empty"><MessageSquare size={18} /><span>No recovery activity recorded yet.</span></div>
        ) : (
          <div className="rc-timeline">
            {feed.slice(0, 10).map((it) => (
              <div key={it.id} className="rc-tl-item">
                <div className={`rc-tl-dot ${it.actor === 'customer' ? 'rc-tl-dot--read' : it.actor === 'system' ? 'rc-tl-dot--system' : 'rc-tl-dot--delivered'}`} />
                <div className="rc-tl-body">
                  <span className="rc-tl-text">
                    {it.title}{it.customerName ? ` · ${it.customerName}` : ''}
                    {it.amount != null ? ` · ${fmt(it.amount)}` : ''}
                  </span>
                  {it.detail ? <span className="rc-tl-detail">{it.detail}</span> : null}
                  {it.customerId ? (
                    <button className="rc-tl-open" onClick={() => router.push(`/recovery/customer/${encodeURIComponent(it.customerId!)}`)}>open →</button>
                  ) : null}
                </div>
                <div className="rc-tl-time">{fmtTime(it.timestamp)} {fmtDate(it.timestamp)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add phone modal */}
      {phoneModal && phoneCase && (
        <div className="rc-modal">
          <div className="rc-modal-card">
            <div className="rc-modal-head">
              <UserPlus size={16} />
              <span>WhatsApp number</span>
              <button className="rc-modal-close" onClick={() => setPhoneModal(false)}><X size={15} /></button>
            </div>
            <p className="rc-modal-sub">
              Recovery for <strong>{phoneCase.customerName}</strong> cannot start without a customer number.
            </p>
            <input
              className="rc-modal-input"
              placeholder="+91 XXXXX XXXXX"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              inputMode="tel"
              autoFocus
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
type CardState = 'blocked_phone' | 'call' | 'remind' | 'waiting' | 'recovered' | 'blocked_transport'

function cardMeta(state: CardState, c: RecoveryCard): { statusLabel: string; nextAction: string; ownedBy: 'merchant' | 'billzo'; tone: 'red' | 'blue' | 'green' | 'orange' } {
  switch (state) {
    case 'blocked_phone':
      return { statusLabel: 'Blocked — phone number missing', nextAction: 'Add phone number', ownedBy: 'merchant', tone: 'red' }
    case 'blocked_transport':
      return { statusLabel: 'Blocked — WhatsApp delivery failing', nextAction: 'Fix WhatsApp delivery', ownedBy: 'merchant', tone: 'red' }
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

function RecoveryCard({ c, sending, onSend, onAddPhone, onOpen }: {
  c: RecoveryCard
  sending: boolean
  onSend: () => void
  onAddPhone: () => void
  onOpen: () => void
}) {
  const meta = cardMeta(c.state as CardState, c)
  const overdue = c.maxOverdueDays
  const { cta } = c

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

      <div className="rc-card-name">{c.customerName}</div>
      <div className="rc-card-sub">
        {overdue > 0 ? `${overdue} days overdue` : 'Current'}
        {c.invoiceCount > 1 ? ` · ${c.invoiceCount} invoices` : ''}
      </div>

      <dl className="rc-facts">
        <div className="rc-fact">
          <dt>STATUS</dt>
          <dd>{meta.statusLabel}</dd>
        </div>
        <div className="rc-fact">
          <dt>WHY</dt>
          <dd>{c.reason}</dd>
        </div>
        <div className="rc-fact">
          <dt>NEXT ACTION</dt>
          <dd>{meta.nextAction}</dd>
        </div>
      </dl>

      <div className="rc-card-foot">
        <div className="rc-card-cta">{renderCTA()}</div>
        <button className="rc-card-open" onClick={onOpen}>
          Open <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}