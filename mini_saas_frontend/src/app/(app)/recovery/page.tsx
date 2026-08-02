'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import '@/styles/recovery-center.css'
import { formatScheduledSlot } from '@/lib/recovery/business-hours'
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
  recoverableAmount: number
  recoveryConfidence: number
  overdue: number
  state: string
  promiseDate: string | null
  promiseBrokenDays: number | null
  recommendedAction: string
  reminderCount: number
  brokenPromises: number
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

function whyReasons(item: NeedsActionItem): string[] {
  const reasons: string[] = []
  if (item.brokenPromises > 0) reasons.push('Promised payment last week but didn\'t follow through')
  if (item.promiseBrokenDays != null) reasons.push(`Promise broken ${item.promiseBrokenDays}d ago`)
  if (item.reminderCount > 0) reasons.push(`Ignored ${item.reminderCount} reminder${item.reminderCount > 1 ? 's' : ''}`)
  if (item.overdue > 0) reasons.push(`${item.overdue} days overdue`)
  if (item.tier === 'vip') reasons.push('High value customer — usually pays after calls')
  if (item.tier === 'risky') reasons.push('At-risk customer — needs personal attention')
  if (reasons.length === 0) reasons.push('Customer balance needs attention')
  return reasons
}

function planIcon(action: string) {
  switch (action) {
    case 'call': return <Phone size={16} />
    case 'record_payment': return <HeartHandshake size={16} />
    default: return <Bell size={16} />
  }
}

function planLabel(action: string) {
  switch (action) {
    case 'call': return 'Call Today'
    case 'record_payment': return 'Record Payment'
    case 'visit': return 'Visit'
    default: return 'Send Reminder'
  }
}

function planColor(action: string) {
  switch (action) {
    case 'call': return 'rp--call'
    case 'record_payment': return 'rp--payment'
    case 'visit': return 'rp--visit'
    default: return 'rp--remind'
  }
}

export default function RecoveryCenterPage() {
  const [data, setData] = useState<CenterData | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [queueRes, me] = await Promise.all([
          fetch('/api/recovery/queue-projection', { credentials: 'include' }),
          fetch('/api/me', { credentials: 'include' }),
        ])
        if (queueRes.ok) {
          const json = await queueRes.json()
          if (active) setData(json)
        } else if (active) {
          setError('Could not load queue')
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
      const res = await fetch('/api/recovery/queue-projection', { credentials: 'include' })
      if (res.ok) {
        setData(await res.json())
      } else {
        setError('Could not load queue')
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

  const needsAction = data.needsAction
  const totalExpected = needsAction.reduce((s, i) => s + i.recoverableAmount, 0)
  const totalOutstanding = needsAction.reduce((s, i) => s + i.outstanding, 0)
  const highConfItems = needsAction.filter(i => i.recoveryConfidence >= 70).slice(0, 3)

  // Group by recommended action
  const callItems = needsAction.filter(i => i.recommendedAction === 'call')
  const remindItems = needsAction.filter(i => i.recommendedAction === 'send_reminder' || i.recommendedAction === 'reminder')
  const paymentItems = needsAction.filter(i => i.recommendedAction === 'record_payment')
  const otherItems = needsAction.filter(i =>
    i.recommendedAction !== 'call' &&
    i.recommendedAction !== 'send_reminder' &&
    i.recommendedAction !== 'reminder' &&
    i.recommendedAction !== 'record_payment'
  )

  const PlanSection = ({ items, icon, label, color, emptyText }: {
    items: NeedsActionItem[]
    icon: React.ReactNode
    label: string
    color: string
    emptyText: string
  }) => {
    if (items.length === 0) return null
    return (
      <div className={`rp-group ${color}`}>
        <div className="rp-group-head">
          {icon}
          <span className="rp-group-label">{label}</span>
          <span className="rp-count">{items.length}</span>
        </div>
        <div className="rp-list">
          {items.map((item, idx) => {
            const reasons = whyReasons(item)
            return (
              <Link key={item.caseId} href={`/recovery/case/${item.caseId}`} className="rp-item">
                  <div className="rp-item-head">
                    <span className="rp-item-num">{idx + 1}</span>
                    <span className={`rp-conf rp-conf--${item.recoveryConfidence >= 80 ? 'high' : item.recoveryConfidence >= 50 ? 'med' : 'low'}`}>
                      {item.recoveryConfidence}%
                    </span>
                    <span className="rp-item-name">{item.customerName}</span>
                    <span className="rp-item-amount">{fmt(item.outstanding)}</span>
                  </div>
                <div className="rp-item-days">
                  {item.overdue > 0 ? (
                    <span className="rp-item-overdue">{item.overdue} days overdue</span>
                  ) : item.promiseBrokenDays != null ? (
                    <span className="rp-item-overdue">Promise broken {item.promiseBrokenDays}d ago</span>
                  ) : null}
                </div>
                <div className="rp-item-why">
                  {reasons.map((r, ri) => (
                    <span key={ri} className="rp-item-reason">• {r}</span>
                  ))}
                </div>
                <div className="rp-item-action">
                  {item.recommendedAction === 'call' ? (
                    <span className="rp-btn rp-btn--call" onClick={(e) => { if (item.phone) { e.stopPropagation(); window.location.href = `tel:${item.phone}` } }}>
                      <Phone size={13} /> Call Now
                    </span>
                  ) : item.recommendedAction === 'record_payment' ? (
                    <span className="rp-btn rp-btn--payment"><HeartHandshake size={13} /> Record</span>
                  ) : (
                    <span className="rp-btn rp-btn--remind"><MessageSquare size={13} /> Send WhatsApp</span>
                  )}
                  <span className="rp-item-open">Open →</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="rc-page">
      {/* Header */}
      <header className="rc-header">
        <div>
          <h1 className="rc-greeting">
            {greeting()}{name ? ` ${name}!` : ''}
          </h1>
          <p className="rc-sub">
            {needsAction.length > 0
              ? `${needsAction.length} customer${needsAction.length > 1 ? 's' : ''} need your attention`
              : data.underFollowUp > 0
                ? 'Invoices are outstanding but none require recovery yet.'
                : 'No outstanding invoices. Great — you\'re fully paid up.'}
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

      {/* Today's Recovery Plan */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--red" />
          <h2>Today&apos;s Recovery Plan</h2>
        </div>

        {needsAction.length === 0 ? (
          <div className="rc-empty">
            <CheckCircle2 size={18} />
            <span>No customers need action today. {data.underFollowUp ? 'Invoices exist but are not yet overdue.' : ''}</span>
          </div>
        ) : (
          <div className="rp-container">
            <PlanSection
              items={callItems}
              icon={<Phone size={16} />}
              label="Call Today"
              color="rp--call"
              emptyText="No calls needed"
            />
            <PlanSection
              items={remindItems}
              icon={<Bell size={16} />}
              label="Send Reminder"
              color="rp--remind"
              emptyText="No reminders needed"
            />
            <PlanSection
              items={paymentItems}
              icon={<HeartHandshake size={16} />}
              label="Record Payment"
              color="rp--payment"
              emptyText="No payments to record"
            />
            <PlanSection
              items={otherItems}
              icon={<Clock size={16} />}
              label="Other Actions"
              color="rp--other"
              emptyText=""
            />

            {needsAction.length > 0 ? (
              <div className="rp-expected">
                <div className="rp-expected-main">
                  <span className="rp-expected-lbl">Likely Recovery Today</span>
                  <span className="rp-expected-amt">{fmt(totalExpected)}</span>
                  <span className="rp-expected-sub">of {fmt(totalOutstanding)} total outstanding</span>
                </div>
                {highConfItems.length > 0 ? (
                  <div className="rp-expected-items">
                    {highConfItems.map(i => (
                      <div key={i.caseId} className="rp-expected-item">
                        <span className={`rp-conf rp-conf--${i.recoveryConfidence >= 80 ? 'high' : i.recoveryConfidence >= 50 ? 'med' : 'low'}`}>
                          {i.recoveryConfidence}%
                        </span>
                        <span className="rp-expected-name">{i.customerName}</span>
                        <span className="rp-expected-val">{fmt(i.recoverableAmount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Scheduled Today */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--orange" />
          <h2>Scheduled Today</h2>
          <span className="rc-count">{data.scheduledToday.length}</span>
        </div>

        {data.scheduledToday.length === 0 ? (
          <div className="rc-empty">
            <Clock size={18} />
            <span>No follow-ups scheduled today. {data.underFollowUp > 0 ? `${fmt(data.underFollowUp)} under follow-up.` : 'Outstanding invoices will appear here automatically.'}</span>
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
                <div className="rc-row-time">{formatScheduledSlot(s.scheduledAt)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recently Recovered */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--green" />
          <h2>Recently Recovered</h2>
          <span className="rc-count">{data.recentlyRecovered.length}</span>
        </div>

        {data.recentlyRecovered.length === 0 ? (
          <div className="rc-empty">
            <CheckCircle2 size={18} />
            <span>No recoveries recorded this week.</span>
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

      {/* Activity Timeline */}
      <section className="rc-block">
        <div className="rc-block-head">
          <span className="rc-dot rc-dot--blue" />
          <h2>Activity</h2>
          <span className="rc-count rc-count--muted">24h</span>
        </div>

        {data.timeline.length === 0 ? (
          <div className="rc-empty">
            <Clock size={18} />
            <span>No activity recorded in the last 24 hours. Activity appears when reminders are sent or payments received.</span>
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
