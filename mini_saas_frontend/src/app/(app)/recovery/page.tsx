'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import '@/styles/recovery-center.css'
import {
  Phone, MessageSquare, Send, UserPlus, Loader2,
  CheckCircle2, Clock, ArrowRight, X, RotateCcw,
  UserX, Zap, AlertTriangle, Banknote,
  Activity, RefreshCw, ShieldCheck,
  Search, Calendar, ExternalLink, CreditCard
} from 'lucide-react'
import { formatINR } from '@/lib/utils'
import { RecoveryCreditsPanel } from '@/components/billzo/RecoveryCreditsPanel'
import { EscalationActions } from '@/components/billzo/EscalationActions'
import { PromiseModal } from '@/components/billzo/PromiseModal'
import { PaymentModal } from '@/components/billzo/PaymentModal'

type SectionKey = 'needs_you' | 'automated' | 'monitoring' | 'exhausted'

type RecentRecoveryItem = {
  id: string
  kind: 'payment' | 'reminder'
  customerId: string | null
  customerName: string
  amount: number | null
  invoiceNumber: string | null
  title: string
  detail: string
  occurredAt: string
  status: 'paid' | 'delivered' | 'sent' | 'read' | 'failed' | 'waiting'
}

type RecoveryCard = {
  caseId: string | null
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
  automation: Record<string, any>
  /** Phase C — Urgent+ machinery recommendation (escalation pack). */
  escalationRecommended: boolean
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
    escalationRecommended: number
    recoveredThisMonth?: number
  }
  needsYou: RecoveryCard[]
  billzoIsHandling: RecoveryCard[]
  monitoring: RecoveryCard[]
  exhausted: RecoveryCard[]
  recentRecovery?: RecentRecoveryItem[]
  generatedAt: string
}

const SECTION_META: Record<SectionKey, { label: string; icon: React.ReactNode; description: string; dot: string }> = {
  needs_you: {
    label: 'NEEDS YOU',
    icon: <UserX size={16} />,
    description: 'Cases BillZo cannot safely handle automatically — your action required',
    dot: 'rc-dot--red',
  },
  automated: {
    label: 'BILLZO IS HANDLING',
    icon: <Zap size={16} />,
    description: 'Automated recovery sequence actively running',
    dot: 'rc-dot--blue',
  },
  monitoring: {
    label: 'MONITORING & PROMISED',
    icon: <Clock size={16} />,
    description: 'Customer contacted or payment promised — waiting for response or due date',
    dot: 'rc-dot--green',
  },
  exhausted: {
    label: 'RECOVERY EXHAUSTED',
    icon: <AlertTriangle size={16} />,
    description: 'Automated recovery limit reached — personal follow-up required',
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

function getWhatsAppLink(phone: string | null, name: string, outstanding: number): string | null {
  if (!phone) return null
  const cleanPhone = phone.replace(/\D/g, '')
  if (!cleanPhone) return null
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
  const message = `Hello ${name}, this is a reminder regarding your pending balance of ${formatINR(outstanding)}. Please let us know when we can expect payment. Thank you!`
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
}

type FilterTab = 'all' | 'billzo' | 'needs' | 'recent' | 'needs_you' | 'automated' | 'monitoring' | 'exhausted' | 'critical'

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

  // Direct Action Modals State
  const [promiseCase, setPromiseCase] = useState<RecoveryCard | null>(null)
  const [paymentCase, setPaymentCase] = useState<RecoveryCard | null>(null)

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')

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

  useEffect(() => { void loadData() }, [loadData])

  const refresh = useCallback(() => {
    setRefreshing(true)
    void loadData()
  }, [loadData])

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
        toast.success('WhatsApp reminder sent successfully')
        void loadData()
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
    snooze: 'Snoozed case for 3 days',
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

  const allCards = useMemo(() => {
    if (!data) return []
    return [
      ...(data.needsYou ?? []),
      ...(data.billzoIsHandling ?? []),
      ...(data.monitoring ?? []),
      ...(data.exhausted ?? []),
    ]
  }, [data])

  const criticalCount = useMemo(() => {
    return allCards.filter(c => c.maxOverdueDays >= 30).length
  }, [allCards])

  // Section data derived from the API response, mapped to contract v2 labels.
  const billzoIsHandling = useMemo(() => data?.billzoIsHandling ?? [], [data])
  const needsYou = useMemo(() => data?.needsYou ?? [], [data])
  const monitoring = useMemo(() => data?.monitoring ?? [], [data])
  const exhausted = useMemo(() => data?.exhausted ?? [], [data])

  // Rendered card counts per section — derived from the mapped arrays.
  const billzoCount = useMemo(() => billzoIsHandling.length, [billzoIsHandling])
  const needsYouCount = useMemo(() => needsYou.length, [needsYou])
  const monitoringCount = useMemo(() => monitoring.length, [monitoring])
  const exhaustedCount = useMemo(() => exhausted.length, [exhausted])
  const recentCount = useMemo(() => (data as any)?.recentRecovery?.length ?? 0, [data])

  // Contract v2: three-section layout — backend already sections cards (sectionFor).
  // Keep mapping 1:1 to avoid hiding data; merchant-facing labels are handled in cardMeta.
  const sectionsRightSide = useMemo(() => {
    if (!data) return []
    const q = searchQuery.trim().toLowerCase()
    const matchCard = (c: RecoveryCard) => {
      if (!q) return true
      return c.customerName.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || c.reason.toLowerCase().includes(q)
    }
    const matchRecent = (it: RecentRecoveryItem) => {
      if (!q) return true
      return it.customerName.toLowerCase().includes(q) || it.title.toLowerCase().includes(q) || it.detail.toLowerCase().includes(q)
    }
    const billzoItems = billzoIsHandling.filter(matchCard)
    const needsItems = needsYou.filter(matchCard)
    // RECENT RECOVERY — authoritative grouped timeline (presentation-only, no new authority)
    // Sources are separate tenant-scoped queries in getRecoveryCommandCenter (payments + actions + delivery).
    const recentItems: RecentRecoveryItem[] = ((data as any)?.recentRecovery ?? [] as RecentRecoveryItem[]).filter(matchRecent)
    return [
      {
        key: 'billzo' as const,
        items: billzoItems,
        meta: {
          label: 'BILLZO IS WORKING',
          icon: <Zap size={16} />,
          description: 'Automated recovery sequence actively running',
          dot: 'rc-dot--blue',
        },
      },
      {
        key: 'needs' as const,
        items: needsItems,
        meta: {
          label: 'NEEDS YOUR ATTENTION',
          icon: <UserX size={16} />,
          description: 'Cases requiring merchant intervention',
          dot: 'rc-dot--red',
        },
      },
      {
        key: 'recent' as const,
        items: recentItems,
        meta: {
          label: 'RECENT RECOVERY',
          icon: <Activity size={16} />,
          description: 'Recent recovery activity',
          dot: 'rc-dot--green',
        },
      },
    ].filter((s) => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'billzo') return s.key === 'billzo'
      if (activeFilter === 'needs') return s.key === 'needs'
      if (activeFilter === 'recent') return s.key === 'recent'
      // legacy filters show all v2 sections
      return true
    })
  }, [data, billzoIsHandling, needsYou, searchQuery, activeFilter])

  // Financial summary — must be before early returns to keep hook order stable
  const financialSummary = useMemo(() => {
    const s: any = (data as any)?.summary
    return {
      totalOutstanding: s?.totalOutstanding ?? 0,
      recoveredThisMonth: s?.recoveredThisMonth ?? 0,
      billzoHandling: s?.automated ?? 0,
      needsAttention: s?.needsYou ?? 0,
    }
  }, [data])

  if (loading) {
    return (
      <div className="rc-page" aria-busy="true">
        <div>
          <div className="rc-skeleton" style={{ height: 32, width: '40%', marginBottom: 8, borderRadius: 8 }} />
          <div className="rc-skeleton" style={{ height: 16, width: '60%', borderRadius: 6 }} />
        </div>
        <div className="rc-skeleton" style={{ height: 110, width: '100%', borderRadius: 16 }} />
        <div className="rc-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rc-skeleton" style={{ height: 88, borderRadius: 12 }} />
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rc-block">
            <div className="rc-skeleton" style={{ height: 20, width: '35%', borderRadius: 6 }} />
            {Array.from({ length: 2 }).map((__, j) => (
              <div key={j} className="rc-skeleton" style={{ height: 140, borderRadius: 14 }} />
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
          <span className="rc-error-ic"><AlertTriangle size={24} /></span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Couldn&apos;t load recovery center</div>
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
              {error ?? 'Something went wrong while connecting to recovery backend.'}
            </div>
          </div>
          <button className="rc-btn rc-btn--primary rc-retry" onClick={() => refresh()}>
            <RefreshCw size={15} /> Retry connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rc-page">
      {/* Header */}
      <header className="rc-header">
        <div>
          <h1 className="rc-greeting">Recovery</h1>
          <p className="rc-sub" style={{ marginTop: 3 }}>
            Automated receivables recovery & promise tracker
          </p>
          <span className="rc-updated">
            <span className="rc-updated-dot" />
            Updated {relativeTime(data.generatedAt)}
          </span>
        </div>
        <button className="rc-refresh" onClick={refresh} aria-label="Refresh recovery data" title="Refresh">
          {refreshing || loading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} className={refreshing ? 'spin' : ''} />}
        </button>
      </header>

      {/* Financial summary bar — Recovery v2 contract */}
      <div className="rc-financial-summary">
        <div className="rc-financial-item">
          <span className="rc-financial-label">{fmt(financialSummary.totalOutstanding)}</span>
          <span className="rc-financial-sub">Outstanding</span>
        </div>
        <div className="rc-financial-item">
          <span className="rc-financial-label">{fmt(financialSummary.recoveredThisMonth)}</span>
          <span className="rc-financial-sub">Recovered this month</span>
        </div>
        <div className="rc-financial-item">
          <span className="rc-financial-label">{financialSummary.billzoHandling}</span>
          <span className="rc-financial-sub">BillZo is handling</span>
        </div>
        <div className="rc-financial-item">
          <span className="rc-financial-label">{financialSummary.needsAttention}</span>
          <span className="rc-financial-sub">Need your attention</span>
        </div>
      </div>

      {/* Recovery credits (Phase B) */}
      <RecoveryCreditsPanel />

      {/* Search & Quick Filters Bar */}
      <div className="rc-filter-bar">
        <div className="rc-search-wrapper">
          <Search size={16} className="rc-search-ic" />
          <input
            className="rc-search-input"
            placeholder="Search customer name, phone, or invoice reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search customers or phone"
          />
          {searchQuery ? (
            <button className="rc-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </div>
<div className="rc-filter-pills" role="tablist" aria-label="Recovery filters">
          <button
            className={`rc-filter-pill ${activeFilter === 'all' ? 'rc-filter-pill--active' : ''}`}
            onClick={() => setActiveFilter('all')}
            role="tab"
            aria-selected={activeFilter === 'all'}
          >
            All Cases <span className="rc-filter-pill-count">{allCards.length}</span>
          </button>
          <button
            className={`rc-filter-pill ${activeFilter === 'billzo' ? 'rc-filter-pill--active' : ''}`}
            onClick={() => setActiveFilter('billzo')}
            role="tab"
            aria-selected={activeFilter === 'billzo'}
          >
            BillZo is handling ⚡ <span className="rc-filter-pill-count">{billzoCount}</span>
          </button>
          <button
            className={`rc-filter-pill ${activeFilter === 'needs' ? 'rc-filter-pill--active' : ''}`}
            onClick={() => setActiveFilter('needs')}
            role="tab"
            aria-selected={activeFilter === 'needs'}
          >
            Needs Your Attention 🚨 <span className="rc-filter-pill-count">{needsYouCount}</span>
          </button>
          <button
            className={`rc-filter-pill ${activeFilter === 'recent' ? 'rc-filter-pill--active' : ''}`}
            onClick={() => setActiveFilter('recent')}
            role="tab"
            aria-selected={activeFilter === 'recent'}
          >
            Recent Recovery <span className="rc-filter-pill-count">{recentCount}</span>
          </button>
        </div>
      </div>

{/* Sections — Recovery v2 contract: three-section layout */}
      {sectionsRightSide.length === 0 ? (
        (searchQuery !== '' || activeFilter !== 'all') && allCards.length > 0 ? (
          <div className="rc-empty--calm">
            <span className="rc-empty-ic"><CheckCircle2 size={28} /></span>
            <div>
              <div className="rc-empty-title">No recovery cases found</div>
              <div className="rc-empty-sub">No customers match your search or filter.</div>
            </div>
            <button className="rc-btn rc-btn--ghost" style={{ marginTop: 8 }} onClick={() => { setSearchQuery(''); setActiveFilter('all') }}>
              Reset filters
            </button>
          </div>
        ) : (
          <div className="rc-empty--calm">
            <span className="rc-empty-ic"><CheckCircle2 size={28} /></span>
            <div>
              <div className="rc-empty-title">All caught up!</div>
              <div className="rc-empty-sub">No customers currently require recovery action.</div>
            </div>
          </div>
        )
      ) : (
        sectionsRightSide.map(({ key, items, meta }) => (
          <section key={key} className="rc-block rc-section">
            <div className="rc-block-head">
              <span className={`rc-dot ${meta.dot}`} />
              <h2>{meta.label}</h2>
              <span className="rc-count">{items.length}</span>
              <span className="rc-section-desc">{meta.description}</span>
            </div>
            <div className={key === 'recent' ? 'rc-timeline' : 'rc-list rc-list--tight'}>
              {key === 'recent' ? (
                (items as RecentRecoveryItem[]).length === 0 ? (
                  <div className="rc-empty"><CheckCircle2 size={18} /><span>No recent recovery activity yet.</span></div>
                ) : (
                  (items as RecentRecoveryItem[]).map((it) => (
                    <div key={it.id} className={`rc-tl-item ${it.kind === 'payment' ? 'rc-tl-item--payment' : ''}`}>
                      <span className={`rc-tl-ic ${it.kind === 'payment' ? 'rc-tl-ic--merchant' : it.status === 'failed' ? 'rc-tl-ic--system' : 'rc-tl-ic--customer'}`}>
                        {it.kind === 'payment' ? <Banknote size={14} /> : it.status === 'failed' ? <AlertTriangle size={14} /> : <MessageSquare size={14} />}
                      </span>
                      <div className="rc-tl-body">
                        <span className="rc-tl-text">
                          {it.kind === 'payment' ? <><span className="rc-tl-amt">{it.title}</span> · {it.customerName}</> : <>{it.title} · {it.customerName}</>}
                          {it.invoiceNumber ? <> · {it.invoiceNumber}</> : null}
                          {it.amount != null && it.kind !== 'payment' ? <> · <span className="rc-tl-amt">{fmt(it.amount)}</span> outstanding</> : null}
                        </span>
                        <span className="rc-tl-detail">{it.detail}</span>
                        {it.customerId ? (
                          <button className="rc-tl-open" onClick={() => router.push(`/recovery/customer/${encodeURIComponent(it.customerId!)}`)}>open →</button>
                        ) : null}
                      </div>
                      <div className="rc-tl-time">{relativeTime(it.occurredAt)}</div>
                    </div>
                  ))
                )
              ) : (
                (items as RecoveryCard[]).map((c) => (
                  <RecoveryCardItem
                    key={c.customerId}
                    c={c}
                    sending={sending === c.customerId}
                    acting={acting}
                    onSend={() => handleSend(c.customerId)}
                    onAddPhone={() => openPhoneModal(c)}
                    onOpenPromise={() => setPromiseCase(c)}
                    onOpenPayment={() => setPaymentCase(c)}
                    onAction={(action, extra) => handleAction(c, action, extra)}
                    onOpen={() => router.push(`/recovery/customer/${encodeURIComponent(c.customerId)}`)}
                  />
                ))
              )}
            </div>
          </section>
        ))
      )}

      {/* Add phone modal */}
      {phoneModal && phoneCase && (
        <div className="rc-modal" role="dialog" aria-modal="true">
          <div className="rc-modal-card">
            <div className="rc-modal-head">
              <UserPlus size={16} />
              <span>WhatsApp Number</span>
              <button className="rc-modal-close" onClick={() => setPhoneModal(false)} aria-label="Close"><X size={15} /></button>
            </div>
            <p className="rc-modal-sub">
              Automated WhatsApp recovery for <strong>{phoneCase.customerName}</strong> requires a valid phone number.
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
                {savingPhone ? <Loader2 className="spin" size={14} /> : null} Save Number
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Promise Modal */}
      {promiseCase && (
        <PromiseModal
          customerId={promiseCase.customerId}
          customerName={promiseCase.customerName}
          amount={promiseCase.outstanding}
          caseId={promiseCase.caseId || promiseCase.customerId}
          onClose={() => setPromiseCase(null)}
          onSuccess={() => {
            toast.success('Payment promise recorded successfully')
            void loadData()
          }}
        />
      )}

      {/* Direct Payment Modal */}
      {paymentCase && (
        <PaymentModal
          customerId={paymentCase.customerId}
          customerName={paymentCase.customerName}
          amount={paymentCase.outstanding}
          openInvoiceCount={paymentCase.invoiceCount}
          caseId={paymentCase.caseId || paymentCase.customerId}
          onClose={() => setPaymentCase(null)}
          onSuccess={() => {
            toast.success('Payment recorded successfully')
            void loadData()
          }}
        />
      )}
    </div>
  )
}

// ── Card state → STATUS / NEXT ACTION / ownership ──────────────────────────
type CardState = 'blocked_phone' | 'call' | 'remind' | 'waiting' | 'recovered' | 'blocked_transport' | 'exhausted'

function cardMeta(state: CardState, c: RecoveryCard): { statusLabel: string; nextAction: string; ownedBy: 'merchant' | 'billzo'; tone: 'red' | 'blue' | 'green' | 'orange' } {
  switch (state) {
    case 'blocked_phone':
      return { statusLabel: 'No WhatsApp number — add to enable recovery', nextAction: 'Add WhatsApp number', ownedBy: 'merchant', tone: 'red' }
    case 'blocked_transport':
      return { statusLabel: 'WhatsApp delivery failed — not retrying automatically', nextAction: 'Check delivery issue', ownedBy: 'merchant', tone: 'red' }
    case 'exhausted':
      return { statusLabel: 'No more automated attempts', nextAction: 'Call customer personally', ownedBy: 'merchant', tone: 'orange' }
    case 'call':
      return { statusLabel: 'Phone call recommended', nextAction: 'Call customer', ownedBy: 'merchant', tone: 'orange' }
    case 'remind':
      return { statusLabel: 'REMINDER DUE', nextAction: 'Send WhatsApp reminder', ownedBy: 'billzo', tone: 'blue' }
    case 'waiting': {
      if (c.evidence.replied) return { statusLabel: 'Customer replied — promise pending', nextAction: 'View reply details', ownedBy: 'billzo', tone: 'green' }
      if (c.evidence.lastDelivery.status === 'read') return { statusLabel: 'Reminder sent · Read — awaiting response', nextAction: 'Review after 24h', ownedBy: 'billzo', tone: 'green' }
      if (c.evidence.lastDelivery.status === 'delivered') return { statusLabel: 'Reminder sent · Delivered — awaiting response', nextAction: 'Review after 24h', ownedBy: 'billzo', tone: 'green' }
      if (c.evidence.lastDelivery.status === 'sent') return { statusLabel: 'Reminder sent — awaiting delivery', nextAction: 'Monitor response', ownedBy: 'billzo', tone: 'green' }
      if (c.evidence.lastDelivery.status === 'failed') return { statusLabel: 'Delivery failed', nextAction: 'Check delivery issue', ownedBy: 'merchant', tone: 'red' }
      return { statusLabel: 'Reminder sent — awaiting response', nextAction: 'Monitor response', ownedBy: 'billzo', tone: 'green' }
    }
    case 'recovered':
      return { statusLabel: 'Payment received ✓', nextAction: 'View payment record', ownedBy: 'billzo', tone: 'green' }
    default:
      return { statusLabel: 'Review case', nextAction: 'View details', ownedBy: 'merchant', tone: 'blue' }
  }
}

function RecoveryCardItem({ c, sending, acting, onSend, onAddPhone, onOpenPromise, onOpenPayment, onAction, onOpen }: {
  c: RecoveryCard
  sending: boolean
  acting: string | null
  onSend: () => void
  onAddPhone: () => void
  onOpenPromise: () => void
  onOpenPayment: () => void
  onAction: (action: string, extra?: Record<string, any>) => void
  onOpen: () => void
}) {
  const meta = cardMeta(c.state as CardState, c)
  const overdue = c.maxOverdueDays
  const { cta } = c
  const waLink = getWhatsAppLink(c.phone, c.customerName, c.outstanding)

  const quickActions = [
    { action: 'snooze', label: 'Pause 3d' },
    { action: 'mark_disputed', label: 'Dispute' },
    { action: 'escalate', label: 'Escalate' },
  ]

  const renderDeliveryBadge = () => {
    const status = c.evidence.lastDelivery.status
    if (!status) return null
    if (status === 'read') {
      return <span className="rc-badge-delivery rc-badge-delivery--read">Read ✔️✔️</span>
    }
    if (status === 'delivered') {
      return <span className="rc-badge-delivery rc-badge-delivery--delivered">Delivered ✔️</span>
    }
    if (status === 'failed') {
      return <span className="rc-badge-delivery rc-badge-delivery--failed">Delivery Failed ⚠️</span>
    }
    return null
  }

  const renderCTA = () => {
    if (cta.type === 'add_phone') {
      return (
        <button className="cw-record-payment cw-record-payment--danger" onClick={onAddPhone}>
          <UserPlus size={16} /> Add phone number
        </button>
      )
    }
    if (cta.type === 'call') {
      if (cta.href) {
        return (
          <a className="cw-record-payment cw-record-payment--phone" style={{ textDecoration: 'none' }} href={cta.href}>
            <Phone size={16} /> Call customer
          </a>
        )
      }
      return (
        <button className="cw-record-payment cw-record-payment--phone" onClick={onAddPhone}>
          <UserPlus size={16} /> Add phone number
        </button>
      )
    }
    if (cta.type === 'send_reminder') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <button className="cw-record-payment" disabled={sending} onClick={onSend} style={{ width: '100%', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
            {sending ? 'Sending…' : 'Send reminder — BillZo recommended'}
          </button>
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
              title="Bypass — not recorded as BillZo recovery, no delivery tracking"
            >
              <MessageSquare size={12} /> Direct WA (bypass, no tracking) <ExternalLink size={10} />
            </a>
          ) : null}
        </div>
      )
    }
    return (
      <button className="cw-record-payment cw-record-payment--ghost" onClick={onOpen}>
        {cta.type === 'view_payment' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
        {cta.label}
      </button>
    )
  }

  return (
    <div className={`rc-card rc-card--${meta.tone}`}>
      {/* Top bar: Owner tag, Badges, Amount */}
      <div className="rc-card-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className={`rc-owner rc-owner--${meta.ownedBy}`}>
            {meta.ownedBy === 'billzo' ? <><Zap size={12} /> BILLZO HANDLING</> : <><UserX size={12} /> ACTION NEEDED</>}
          </span>
          {overdue >= 30 ? (
            <span className="rc-overdue-pill">Critical &gt;30d</span>
          ) : overdue > 0 ? (
            <span className="rc-overdue-pill">{overdue}d overdue</span>
          ) : (
            <span className="rc-overdue-pill rc-overdue-pill--ok">Current</span>
          )}
          {renderDeliveryBadge()}
          {c.evidence.promiseDate ? (
            <span className="rc-badge-promise">
              <Calendar size={12} /> Promised: {fmtDate(c.evidence.promiseDate)}
            </span>
          ) : null}
        </div>
        <span className="rc-card-amount">{fmt(c.outstanding)}</span>
      </div>

      {/* Customer Info */}
      <div className="rc-card-id-row">
        <span className={`rc-avatar rc-avatar--${meta.tone}`}>{initials(c.customerName)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rc-card-name" style={{ margin: 0, cursor: 'pointer' }} onClick={onOpen}>
            {c.customerName}
          </div>
          <div className="rc-card-sub" style={{ margin: '2px 0 0' }}>
            {c.phone ? c.phone : 'No phone number'}
            {c.invoiceCount > 1 ? ` · ${c.invoiceCount} invoices` : ' · 1 invoice'}
          </div>
        </div>
      </div>

      {/* Fact grid — Recovery v2: merchant-facing journey */}
      <dl className="rc-facts rc-facts--grid" style={{ marginTop: 12 }}>
        <div className="rc-fact">
          <dt>STATUS</dt>
          <dd>{meta.statusLabel}</dd>
        </div>
        <div className="rc-fact">
          <dt>NEXT</dt>
          <dd>{meta.nextAction}</dd>
        </div>
        <div className="rc-fact rc-fact--wide">
          <dt>Why?</dt>
          <dd>{c.reason}</dd>
          {c.state === 'remind' ? (
            <>
              <span style={{ display: 'block', marginTop: 6, fontWeight: 600, fontSize: 12 }}>BillZo recommends contacting this customer now.</span>
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                Checks: Outstanding balance · WhatsApp consent · cooldown expired · within recovery limits
              </span>
            </>
          ) : null}
          {c.state === 'waiting' && c.evidence.lastDelivery.at ? (
            <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
              Last activity · {relativeTime(c.evidence.lastDelivery.at)}
              {c.evidence.lastDelivery.status ? ` · ${c.evidence.lastDelivery.status}` : ''}
            </span>
          ) : null}
        </div>
      </dl>

      {/* Action Bar — single recommended primary, secondary collapsed */}
      <div className="rc-card-foot" style={{ flexDirection: 'column', gap: 10 }}>
        <div className="rc-card-cta" style={{ width: '100%' }}>{renderCTA()}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="rc-card-open" onClick={onOpen}>
            Open <ArrowRight size={14} />
          </button>
          {c.state === 'waiting' && c.evidence.lastDelivery.at ? (
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginLeft: 4 }}>
              BillZo will re-evaluate after waiting window — no action needed now.
            </span>
          ) : null}
          <details className="rc-card-more" style={{ marginLeft: 'auto' }}>
            <summary style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'hsl(var(--muted-foreground))', listStyle: 'none' }}>More actions ▾</summary>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, padding: 8, background: 'hsl(var(--muted)/0.25)', borderRadius: 10, border: '1px solid var(--bd)' }}>
              <button
                className="cw-record-payment cw-record-payment--ghost"
                style={{ color: 'hsl(var(--success))', borderColor: 'hsl(var(--success) / 0.3)', fontSize: 12, padding: '7px 10px' }}
                onClick={onOpenPayment}
                title="Record payment received"
              >
                <CreditCard size={14} /> Record Payment
              </button>
              <button
                className="cw-record-payment cw-record-payment--ghost"
                style={{ color: 'hsl(270 75% 50%)', borderColor: 'hsl(270 75% 50% / 0.3)', fontSize: 12, padding: '7px 10px' }}
                onClick={onOpenPromise}
                title="Log payment promise date"
              >
                <Calendar size={14} /> Add Promise
              </button>
              {quickActions.map((a) => {
                const key = `${c.customerId}:${a.action}`
                const busy = acting === key
                return (
                  <button
                    key={key}
                    className="cw-record-payment cw-record-payment--ghost"
                    style={{ fontSize: 12, padding: '7px 10px' }}
                    disabled={busy || sending}
                    onClick={() => onAction(a.action)}
                  >
                    {busy ? <Loader2 className="spin" size={13} /> : null}
                    {a.label}
                  </button>
                )
              })}
            </div>
          </details>
        </div>
      </div>

      {c.section === 'exhausted' && c.escalationRecommended ? (
        <div className="rc-card-escalation" role="region" aria-label="Escalation">
          <EscalationActions caseId={c.caseId} />
        </div>
      ) : null}
    </div>
  )
}