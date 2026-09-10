'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import '@/styles/recovery-center.css'
import {
  Phone, MessageSquare, Send, UserPlus, Loader2,
  CheckCircle2, Clock, ArrowRight, X, RotateCcw,
  UserX, Zap, Target, AlertTriangle, Play,
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
  automation: {
    stage: string
    nextEvaluationAt: string | null
    evaluationOverdue: boolean
    scheduledActions: { id: string; actionType: string; scheduledAt: string; reason: string | null }[]
    stopCondition: { kind: 'replied' | 'promise' | 'payment' | 'none'; note: string | null }
    lastWhatsAppAt: string | null
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
  automation: {
    scheduledActions: number
    awaitingEvaluation: number
    pausedByReply: number
    pausedByPromise: number
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

type StartPreview = {
  generatedAt: string
  eligible: { customerId: string; name: string; outstanding: number; invoiceIds: string[] }[]
  needsAttention: { customerId: string; name: string; state: string; reason: string }[]
  blocked: { customerId: string; name: string; reason: string }[]
  paused: { customerId: string; name: string; stopCondition: { kind: string; note: string | null } }[]
  policy: { policyId: string; steps: number } | null
  estimatedActions: number
  totalOutstanding: number
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

/**
 * What BillZo will do automatically — derived purely from persisted worker
 * state, never predicted beyond evidence.
 */
function automationLine(c: RecoveryCard): string {
  const a = c.automation
  if (a.stopCondition.kind === 'payment') return 'Recovered — automation stopped'
  if (a.stopCondition.kind === 'promise') return 'Paused until promise date'
  if (a.stopCondition.kind === 'replied') return 'Paused — customer replied'
  if (c.state === 'blocked_phone') return 'Blocked — add a phone number to enable automation'
  if (a.scheduledActions.length > 0) {
    const next = a.scheduledActions[0]
    return `${next.actionType.replace(/_/g, ' ')} ${next.scheduledAt ? `· ${fmtDate(next.scheduledAt)}` : ''}${next.reason ? ` — ${next.reason}` : ''}`
  }
  if (a.nextEvaluationAt && !a.evaluationOverdue) {
    return `Re-evaluate ${fmtDate(a.nextEvaluationAt)}`
  }
  if (a.evaluationOverdue) return 'Evaluation overdue — awaiting BillZo'
  return 'No automation scheduled'
}

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

  const [startOpen, setStartOpen] = useState(false)
  const [startPreview, setStartPreview] = useState<StartPreview | null>(null)
  const [startLoading, setStartLoading] = useState(false)
  const [startPhase, setStartPhase] = useState<'sending' | 'done' | 'error' | null>(null)
  const [startResult, setStartResult] = useState<{ queued: number; totalActionsCreated: number } | null>(null)

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

  useEffect(() => { void loadData(); void loadFeed() }, [loadData, loadFeed])
  useEffect(() => {
    const handler = () => { void loadData(); void loadFeed() }
    window.addEventListener('billzo:changed', handler)
    return () => window.removeEventListener('billzo:changed', handler)
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

  const openStart = async () => {
    setStartOpen(true)
    setStartPhase(null)
    setStartResult(null)
    setStartPreview(null)
    setStartLoading(true)
    try {
      const res = await fetch('/api/recovery/start/preview', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (res.ok) setStartPreview(json)
      else throw new Error(json?.error || `API ${res.status}`)
    } catch (e: any) {
      setStartPhase('error')
      setStartResult({ queued: 0, totalActionsCreated: 0 })
      alert(e?.message || 'Could not build Start Recovery preview')
    } finally {
      setStartLoading(false)
    }
  }

  const confirmStart = async () => {
    if (!startPreview || startPhase === 'sending') return
    setStartPhase('sending')
    try {
      const res = await fetch('/api/recovery/start/confirm', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setStartPhase('done')
        setStartResult({ queued: json.queued ?? 0, totalActionsCreated: json.totalActionsCreated ?? 0 })
        await loadData()
        void loadFeed()
      } else {
        setStartPhase('error')
        setStartResult({ queued: 0, totalActionsCreated: 0 })
        alert(json?.error || json?.message || 'Could not start recovery')
      }
    } catch {
      setStartPhase('error')
      setStartResult({ queued: 0, totalActionsCreated: 0 })
      alert('Network error — could not start recovery')
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
          {summary.totalCases > 0 && (
            <button className="rc-btn rc-btn--primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={openStart}>
              <Play size={14} /> Start Recovery
            </button>
          )}
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

      {/* Automation lifecycle bar — what BillZo will do, honestly */}
      <div className="rc-summary-bar rc-summary-bar--auto" style={{ display: 'flex', gap: 12, padding: '10px 0', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 16, alignItems: 'center' }}>
        <span className="flex items-center gap-1" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
          <Zap size={14} /> AUTOMATION LIFECYCLE
        </span>
        <span className="rc-auto-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {data.automation.scheduledActions} scheduled action{data.automation.scheduledActions !== 1 ? 's' : ''}
        </span>
        {data.automation.awaitingEvaluation > 0 && (
          <span className="rc-auto-chip rc-auto-chip--warn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <AlertTriangle size={13} style={{ color: 'var(--warning)' }} />
            {data.automation.awaitingEvaluation} evaluation{data.automation.awaitingEvaluation !== 1 ? 's' : ''} overdue
          </span>
        )}
        {data.automation.pausedByReply > 0 && (
          <span className="rc-auto-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {data.automation.pausedByReply} paused — customer replied
          </span>
        )}
        {data.automation.pausedByPromise > 0 && (
          <span className="rc-auto-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {data.automation.pausedByPromise} paused — promise
          </span>
        )}
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

      {/* Start Recovery confirmation — consumed from the decision engine */}
      {startOpen && (
        <div className="rc-modal">
          <div className="rc-modal-card">
            <div className="rc-modal-head">
              <Zap size={16} />
              <span>Start Recovery</span>
              <button className="rc-modal-close" onClick={() => setStartOpen(false)} disabled={startPhase === 'sending'}><X size={15} /></button>
            </div>

            {startLoading ? (
              <div className="rc-empty" style={{ padding: 24 }}><Loader2 className="spin" size={18} /><span>Building preview…</span></div>
            ) : startPhase === 'done' && startResult ? (
              <>
                <div className="rc-modal-sub" style={{ fontSize: 14 }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', verticalAlign: -2, marginRight: 6 }} />
                  <strong>{startResult.queued} reminder{startResult.queued === 1 ? '' : 's'} queued</strong>
                  {' · '}{startResult.totalActionsCreated} automated step{startResult.totalActionsCreated === 1 ? '' : 's'} scheduled
                </div>
                <div className="rc-modal-actions">
                  <button className="rc-btn rc-btn--primary" onClick={() => setStartOpen(false)}>Done</button>
                </div>
              </>
            ) : startPhase === 'error' ? (
              <>
                <div className="rc-modal-sub" style={{ fontSize: 14 }}>Could not start recovery. See the error shown earlier.</div>
                <div className="rc-modal-actions">
                  <button className="rc-btn rc-btn--ghost" onClick={() => setStartOpen(false)}>Close</button>
                  <button className="rc-btn rc-btn--primary" onClick={openStart}>Try again</button>
                </div>
              </>
            ) : startPreview ? (
              <>
                <p className="rc-modal-sub">
                  <strong>Ready to send {startPreview.eligible.length} WhatsApp reminder{startPreview.eligible.length === 1 ? '' : 's'}</strong>
                  {' '}across {startPreview.eligible.length} customer{startPreview.eligible.length === 1 ? '' : 's'} · {fmt(startPreview.totalOutstanding)}.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '14px 0' }}>
                  <div className="rc-startrow"><span className="rc-startlbl" style={{ color: 'var(--primary)' }}><Send size={13} /> Will receive reminders</span><span>{startPreview.eligible.length}</span></div>
                  {startPreview.needsAttention.length > 0 && (
                    <div className="rc-startrow"><span className="rc-startlbl" style={{ color: 'var(--warning)' }}><UserX size={13} /> Need your attention</span><span>{startPreview.needsAttention.length}</span></div>
                  )}
                  {startPreview.paused.length > 0 && (
                    <div className="rc-startrow"><span className="rc-startlbl" style={{ color: 'var(--success)' }}><Clock size={13} /> Paused ({startPreview.paused[0].stopCondition.kind === 'promise' ? 'promise' : 'customer replied'})</span><span>{startPreview.paused.length}</span></div>
                  )}
                  {startPreview.blocked.length > 0 && (
                    <div className="rc-startrow"><span className="rc-startlbl" style={{ color: 'var(--danger)' }}><AlertTriangle size={13} /> Blocked — no phone number</span><span>{startPreview.blocked.length}</span></div>
                  )}
                </div>
                <p className="rc-tl-detail">
                  Policy {startPreview.policy ? `· ${startPreview.policy.steps} automated steps` : ''} will be queued for each
                  eligible customer. Nothing is sent until your worker executes the scheduled action.
                </p>
                <div className="rc-modal-actions">
                  <button className="rc-btn rc-btn--ghost" onClick={() => setStartOpen(false)} disabled={startPhase === 'sending'}>Cancel</button>
                  <button className="rc-btn rc-btn--primary" onClick={confirmStart} disabled={startPhase === 'sending' || startPreview.eligible.length === 0}>
                    {startPhase === 'sending' ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                    {startPhase === 'sending' ? `Sending ${startPreview.eligible.length} reminder${startPreview.eligible.length === 1 ? '' : 's'}…` : 'Start Recovery'}
                  </button>
                </div>
              </>
            ) : null}
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
        <div className="rc-fact">
          <dt>WHAT BILLZO DOES NEXT</dt>
          <dd>{automationLine(c)}</dd>
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