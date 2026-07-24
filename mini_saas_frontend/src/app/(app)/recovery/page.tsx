'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import '@/styles/recovery-center.css'
import {
  Phone, MessageSquare, Clock, CheckCircle2, ArrowRight, TrendingUp,
  AlertTriangle, HeartHandshake, RotateCcw, Bell, Loader2,
} from 'lucide-react'

type NeedsActionItem = {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  tier: string
  outstanding: number
  overdue: number
  state: string
  promiseDate: string | null
  promiseBrokenDays: number | null
  recommendedAction: string
}

type ScheduledItem = {
  actionId: string
  customerId: string | null
  customerName: string
  actionType: string
  channel: string | null
  templateName: string | null
  scheduledAt: string
  invoiceIds: string[]
}

type RecoveredItem = {
  caseId: string
  customerId: string
  customerName: string
  recoveredAt: string
}

type TimelineEvent = {
  eventType: string
  toStatus: string | null
  at: string
  detail: string
}

type CenterData = {
  generatedAt: string
  needsAction: NeedsActionItem[]
  scheduledToday: ScheduledItem[]
  counts: { reminders: number; promiseFollowups: number; calls: number }
  underFollowUp: number
  recentlyRecovered: RecoveredItem[]
  timeline: TimelineEvent[]
}

const fmt = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN')

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function actionLabel(a: string) {
  switch (a) {
    case 'call': return 'Call'
    case 'send_reminder': return 'Send Reminder'
    case 'visit': return 'Visit'
    case 'escalate': return 'Escalate'
    case 'pause': return 'Pause'
    case 'record_payment': return 'Record Payment'
    default: return a.replace(/_/g, ' ')
  }
}

function stateBadge(state: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'tag tag--info' },
    overdue: { label: 'Overdue', cls: 'tag tag--warning' },
    partial_payment: { label: 'Partial', cls: 'tag tag--warning' },
    promised: { label: 'Promised', cls: 'tag tag--info' },
    disputed: { label: 'Disputed', cls: 'tag tag--warning' },
    recovered: { label: 'Recovered', cls: 'tag tag--success' },
    closed: { label: 'Closed', cls: 'tag tag--success' },
  }
  return map[state] ?? { label: state, cls: 'tag' }
}

import { loadQueueCases } from '@/lib/billzo/repositories/recovery'

export default function RecoveryCenterPage() {
  const [data, setData] = useState<CenterData | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [center, me] = await Promise.all([
          fetch('/api/recovery/center', { credentials: 'include' }),
          fetch('/api/me', { credentials: 'include' }),
        ])
        let json: CenterData | null = null
        if (center.ok) {
          json = await center.json()
        }
        if (!json || json.needsAction?.length === 0) {
          const localCases = await loadQueueCases()
          if (localCases.length > 0) {
            const fallbackActions = localCases.map((c: any) => ({
              caseId: c.caseId,
              customerId: c.customerId,
              customerName: c.customerName,
              phone: c.phone || '',
              tier: 'standard',
              outstanding: c.totalOverdue,
              overdue: c.oldestOverdueDays,
              state: c.oldestOverdueDays > 0 ? 'overdue' : 'active',
              promiseDate: c.promiseToPayDate,
              promiseBrokenDays: null,
              recommendedAction: c.nextActionType || 'send_reminder',
            }))
            const totalFollowUp = fallbackActions.reduce((s, i) => s + i.outstanding, 0)
            json = {
              generatedAt: new Date().toISOString(),
              needsAction: fallbackActions,
              scheduledToday: json?.scheduledToday || [],
              counts: json?.counts || { reminders: 0, promiseFollowups: 0, calls: 0 },
              underFollowUp: totalFollowUp,
              recentlyRecovered: json?.recentlyRecovered || [],
              timeline: json?.timeline || [],
            }
          }
        }
        if (json && active) {
          setData(json)
        } else if (!json && active) {
          setError('Could not load Recovery Center')
        }
        if (me.ok) {
          const m = await me.json()
          if (active) setName(m.businessName)
        }
      } catch {
        if (active) setError('Network error')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])


  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recovery/center', { credentials: 'include' })
      let json = res.ok ? await res.json() : null
      if (!json || json.needsAction?.length === 0) {
        const localCases = await loadQueueCases()
        if (localCases.length > 0) {
          const fallbackActions = localCases.map((c: any) => ({
            caseId: c.caseId,
            customerId: c.customerId,
            customerName: c.customerName,
            phone: c.phone || '',
            tier: 'standard',
            outstanding: c.totalOverdue,
            overdue: c.oldestOverdueDays,
            state: c.oldestOverdueDays > 0 ? 'overdue' : 'active',
            promiseDate: c.promiseToPayDate,
              promiseBrokenDays: null,
              recommendedAction: c.nextActionType || 'send_reminder',
            }))
            const totalFollowUp = fallbackActions.reduce((s, i) => s + i.outstanding, 0)
          json = {
            generatedAt: new Date().toISOString(),
            needsAction: fallbackActions,
            scheduledToday: json?.scheduledToday || [],
            counts: json?.counts || { reminders: 0, promiseFollowups: 0, calls: 0 },
            underFollowUp: totalFollowUp,
            recentlyRecovered: json?.recentlyRecovered || [],
            timeline: json?.timeline || [],
          }
        }
      }
      if (json) {
        setData(json)
      } else {
        setError('Could not load Recovery Center')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="rc-loading">
        <Loader2 className="spin" size={22} />
        <span>Loading your day…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rc-loading">
        <span>{error ?? 'Something went wrong'}</span>
        <button className="rc-btn" onClick={refresh}>Retry</button>
      </div>
    )
  }

  const first = data.needsAction[0]

  return (
    <div className="rc-page">
      {/* Header */}
      <header className="rc-header">
        <div>
          <h1 className="rc-greeting">
            {greeting()}{name ? ` ${name}!` : ''}
          </h1>
          <p className="rc-sub">
            {data.needsAction.length > 0
              ? `${data.needsAction.length} customer${data.needsAction.length > 1 ? 's' : ''} need your attention`
              : 'Everything is under control. Relax — we\'ll notify you if something changes.'}
          </p>
        </div>
        <button className="rc-refresh" onClick={refresh} aria-label="Refresh">
          <RotateCcw size={16} />
        </button>
        <Link href="/recovery/work" className="rc-refresh" aria-label="Work Queue" style={{ textDecoration: 'none' }}>
          <ArrowRight size={16} />
        </Link>
        <Link href="/recovery/insights" className="rc-refresh" aria-label="Insights" style={{ textDecoration: 'none' }}>
          <TrendingUp size={16} />
        </Link>
      </header>

      {/* 1. Needs Action */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--red" />
          <h2>Needs Action</h2>
          <span className="rc-count">{data.needsAction.length}</span>
        </div>

        {data.needsAction.length === 0 ? (
          <div className="rc-empty">
            <CheckCircle2 size={18} />
            <span>No customers need action today.</span>
          </div>
        ) : (
          <div className="rc-list">
            {data.needsAction.map((c) => {
              const badge = stateBadge(c.state)
              return (
                <Link
                  key={c.caseId}
                  href={`/recovery/customer/${c.customerId}`}
                  className="rc-card rc-card--red"
                >
                  <div className="rc-card-top">
                    <span className="rc-cust">{c.customerName}</span>
                    <span className={badge.cls}>{badge.label}</span>
                  </div>
                  <div className="rc-amount">{fmt(c.outstanding)}</div>
                  <div className="rc-meta">
                    {c.promiseBrokenDays != null ? (
                      <span className="rc-meta-warn">
                        <AlertTriangle size={13} />
                        Promise broken {c.promiseBrokenDays}d ago
                      </span>
                    ) : c.overdue > 0 ? (
                      <span>
                        <Clock size={13} /> {c.overdue} days overdue
                      </span>
                    ) : (
                      <span>Outstanding balance</span>
                    )}
                  </div>
                  <div className="rc-card-foot">
                    <span className="rc-rec">
                      {c.recommendedAction === 'call' ? (
                        <><Phone size={13} /> Call</>
                      ) : c.recommendedAction === 'record_payment' ? (
                        <><HeartHandshake size={13} /> Record Payment</>
                      ) : (
                        <><Bell size={13} /> Remind</>
                      )}
                      {' · '}
                      {actionLabel(c.recommendedAction)}
                    </span>
                    <ArrowRight size={15} className="rc-arrow" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 2. Scheduled Today */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--orange" />
          <h2>Scheduled Today</h2>
          <span className="rc-count">{data.scheduledToday.length}</span>
        </div>

        {data.scheduledToday.length === 0 ? (
          <div className="rc-empty">
            <Clock size={18} />
            <span>Nothing scheduled today. {fmt(data.underFollowUp)} under follow-up.</span>
          </div>
        ) : (
          <div className="rc-summary">
            <div className="rc-summary-item">
              <span className="rc-summary-num">{data.counts.reminders}</span>
              <span className="rc-summary-lbl">Reminders</span>
            </div>
            <div className="rc-summary-item">
              <span className="rc-summary-num">{data.counts.promiseFollowups}</span>
              <span className="rc-summary-lbl">Promise Follow-ups</span>
            </div>
            <div className="rc-summary-item">
              <span className="rc-summary-num">{data.counts.calls}</span>
              <span className="rc-summary-lbl">Calls</span>
            </div>
            <div className="rc-summary-item rc-summary-item--amt">
              <span className="rc-summary-num">{fmt(data.underFollowUp)}</span>
              <span className="rc-summary-lbl">Under follow-up</span>
            </div>
          </div>
        )}

        {data.scheduledToday.length === 0 ? null : (
          <div className="rc-list rc-list--tight">
            {data.scheduledToday.map((s) => (
              <div key={s.actionId} className="rc-row">
                <div className="rc-row-icon">
                  {s.actionType === 'call' || s.channel === 'phone' ? (
                    <Phone size={15} />
                  ) : s.actionType === 'promise_followup' ? (
                    <HeartHandshake size={15} />
                  ) : (
                    <MessageSquare size={15} />
                  )}
                </div>
                <div className="rc-row-main">
                  <span className="rc-row-title">{s.customerName}</span>
                  <span className="rc-row-sub">
                    {s.actionType === 'promise_followup'
                      ? 'Promise Follow-up'
                      : s.actionType === 'call'
                      ? 'Phone Call'
                      : s.channel === 'whatsapp'
                      ? 'WhatsApp Reminder'
                      : s.templateName || 'Reminder'}
                  </span>
                </div>
                <div className="rc-row-time">{fmtTime(s.scheduledAt)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Recently Recovered */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--green" />
          <h2>Recently Recovered</h2>
          <span className="rc-count">{data.recentlyRecovered.length}</span>
        </div>

        {data.recentlyRecovered.length === 0 ? (
          <div className="rc-empty">
            <CheckCircle2 size={18} />
            <span>No recoveries this week.</span>
          </div>
        ) : (
          <div className="rc-list rc-list--tight">
            {data.recentlyRecovered.map((r) => (
              <div key={r.caseId} className="rc-row rc-row--green">
                <div className="rc-row-icon rc-row-icon--green">
                  <CheckCircle2 size={15} />
                </div>
                <div className="rc-row-main">
                  <span className="rc-row-title">{r.customerName}</span>
                  <span className="rc-row-sub">
                    {timeAgo(r.recoveredAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Activity Timeline */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--blue" />
          <h2>Activity Timeline</h2>
          <span className="rc-count rc-count--muted">24h</span>
        </div>

        {data.timeline.length === 0 ? (
          <div className="rc-empty">
            <Clock size={18} />
            <span>No activity in the last 24 hours.</span>
          </div>
        ) : (
          <div className="rc-timeline">
            {data.timeline.map((e, i) => (
              <div key={i} className="rc-tl-item">
                <div className="rc-tl-dot" />
                <div className="rc-tl-body">
                  <span className="rc-tl-text">{timelineLabel(e)}</span>
                  {e.detail ? <span className="rc-tl-detail">{e.detail}</span> : null}
                </div>
                <div className="rc-tl-time">{fmtTime(e.at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {first ? (
        <Link href={`/recovery/customer/${first.customerId}`} className="rc-fab">
          <Phone size={18} /> Start with {first.customerName}
        </Link>
      ) : null}
    </div>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function timelineLabel(e: TimelineEvent) {
  const map: Record<string, string> = {
    scheduled: 'Action scheduled',
    started: 'Action started',
    sent: 'Reminder sent',
    delivered: 'Delivered',
    failed: 'Failed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired',
    promise_made: 'Promise received',
    payment_received: 'Payment received',
    state_changed: 'Case state changed',
  }
  const base = map[e.eventType] ?? e.eventType.replace(/_/g, ' ')
  return e.toStatus ? `${base} → ${e.toStatus}` : base
}
