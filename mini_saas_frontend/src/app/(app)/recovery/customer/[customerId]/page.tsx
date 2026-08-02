'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, MessageSquare, CheckCircle2, ArrowLeft,
  HeartHandshake, Bell, FileText,
  Loader2, CircleDashed, Pin, PenLine, X,
} from 'lucide-react'
import '@/styles/recovery-center.css'

type Customer = {
  id: string; name: string; phone: string; email: string | null; tier: string | null; gstin: string | null
}
type CaseInfo = {
  id: string; outstanding: number; overdue: number; state: string
  promiseDate: string | null; brokenPromises: number; lastPaymentAt: string | null; nextAction: string | null
  recoverableAmount?: number; recoveryConfidence?: number
}
type Invoice = { id: string; number: string | null; total: number; status: string; dueDate: string | null; createdAt: string }
type ActionRow = {
  id: string; actionType: string; channel: string | null; templateName: string | null; status: string
  triggerType: string | null; scheduledAt: string; completedAt: string | null; invoiceIds: string[]
  events: { type: string; toStatus: string | null; at: string; detail: string }[]
  delivery: { deliveredAt: string | null; readAt: string | null; opens: number }
}
type PromiseRow = { id: string; promiseDate: string | null; amount: number; status: string; createdAt: string; note: string | null }
type Comm = { at: string; kind: string; text: string; detail: string; actionId: string | null }

type Workspace = {
  customer: Customer | null
  case: CaseInfo | null
  invoices: Invoice[]
  actions: ActionRow[]
  promises: PromiseRow[]
  communication: Comm[]
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function actionLabel(a: string) {
  return (
    { call: 'Call', send_reminder: 'Send Reminder', reminder: 'Reminder', promise_followup: 'Promise Follow-up',
      visit: 'Visit', escalate: 'Escalate', payment_request: 'Payment Request', wait: 'Wait', record_payment: 'Record Payment' } as any
  )[a] || a.replace(/_/g, ' ')
}

function statusColor(state: string): string {
  if (state === 'recovered' || state === 'paid') return 'green'
  if (state === 'promised' || state === 'partial_payment') return 'blue'
  if (state === 'overdue' || state === 'active') return 'orange'
  if (state === 'disputed') return 'red'
  return 'gray'
}

function overdueDays(dueDate: string | null): number | null {
  if (!dueDate) return null
  const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

function recoveryScore(rc: CaseInfo | null): { score: number; label: string; color: string } {
  if (!rc || rc.outstanding === 0) return { score: 100, label: 'Cleared', color: 'green' }

  let score = 65

  const tierMap: Record<string, number> = { vip: 15, regular: 5, standard: 0, risky: -15 }
  score += tierMap[(rc as any).tier] || 0

  score -= (rc.brokenPromises || 0) * 12

  if (rc.overdue > 0) {
    if (rc.overdue <= 7) score += 5
    else if (rc.overdue > 60) score -= 15
  }

  if (rc.promiseDate) {
    const daysPast = Math.floor((Date.now() - new Date(rc.promiseDate).getTime()) / 86400000)
    if (daysPast > 0) score -= Math.min(daysPast * 3, 20)
    else score += 10
  }

  if (rc.state === 'promised' || rc.state === 'partial_payment') score += 10
  if (rc.state === 'disputed') score -= 25

  score = Math.max(5, Math.min(100, score))

  const label = score >= 75 ? 'Likely to recover' : score >= 45 ? 'Needs attention' : 'At risk'
  const color = score >= 75 ? 'green' : score >= 45 ? 'orange' : 'red'
  return { score, label, color }
}

function expectationReasons(rc: CaseInfo, tier: string | null): string[] {
  const r: string[] = []
  const tierLabel: Record<string, string> = { vip: 'VIP customer', regular: 'Regular customer', standard: 'Standard tier', risky: 'Risky tier' }
  if (tier) r.push(tierLabel[tier] ?? `${tier} tier`)
  if (rc.brokenPromises > 0) r.push(`${rc.brokenPromises} broken promise${rc.brokenPromises !== 1 ? 's' : ''}`)
  if (rc.overdue > 0) {
    if (rc.overdue > 60) r.push('very overdue')
    else if (rc.overdue > 30) r.push('over 30 days overdue')
    else r.push(`${rc.overdue} days overdue`)
  }
  if (rc.promiseDate) {
    const daysPast = Math.floor((Date.now() - new Date(rc.promiseDate).getTime()) / 86400000)
    r.push(daysPast > 0 ? 'promise date passed' : 'promise coming up')
  }
  if (rc.state === 'promised' || rc.state === 'partial_payment') r.push('recently paid / promised')
  if (rc.state === 'disputed') r.push('disputed')
  if (r.length === 0) r.push('standard recovery confidence')
  return r
}

export default function CustomerWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const customerId = decodeURIComponent(String(params.customerId))
  const [data, setData] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [draft, setDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [hideFirstAction, setHideFirstAction] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/recovery/customer?customerId=${encodeURIComponent(customerId)}`, { credentials: 'include' })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (active) setData(json)
        const nres = await fetch(`/api/recovery/memory?customerId=${encodeURIComponent(customerId)}`, { credentials: 'include' })
        if (nres.ok) {
          const nj = await nres.json()
          if (active) setNotes(nj.notes || [])
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [customerId])

  const reloadNotes = async () => {
    const nres = await fetch(`/api/recovery/memory?customerId=${encodeURIComponent(customerId)}`, { credentials: 'include' })
    if (nres.ok) { const nj = await nres.json(); setNotes(nj.notes || []) }
  }

  const saveNote = async () => {
    const note = draft.trim()
    if (!note) return
    setSavingNote(true)
    try {
      const res = await fetch('/api/recovery/memory', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId, note }),
      })
      if (res.ok) { setDraft(''); await reloadNotes() }
    } finally { setSavingNote(false) }
  }

  const togglePin = async (id: string, pinned: boolean) => {
    await fetch('/api/recovery/memory', {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, is_pinned: !pinned }),
    })
    await reloadNotes()
  }

  const deleteNote = async (id: string) => {
    await fetch(`/api/recovery/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    await reloadNotes()
  }

  if (loading) return <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading workspace…</span></div>
  if (error || !data) return <div className="rc-loading"><span>{error ?? 'Not found'}</span><button className="rc-btn" onClick={() => router.back()}>Back</button></div>

  const c = data.customer
  const rc = data.case
  const rs = recoveryScore(rc)
  const overdueDaysValue = rc && rc.overdue > 0 ? rc.overdue : null

  const nextAction = (() => {
    if (rc?.nextAction === 'call') return { icon: <Phone size={15} />, label: 'Call Today', reason: 'Needs direct conversation', action: 'call' }
    if (rc?.nextAction === 'visit') return { icon: <Phone size={15} />, label: 'Visit', reason: 'In-person follow-up needed', action: 'visit' }
    if (rc?.nextAction === 'record_payment') return { icon: <HeartHandshake size={15} />, label: 'Record Payment', reason: 'Customer may have paid', action: 'record_payment' }
    if (overdueDaysValue && overdueDaysValue > 7) return { icon: <Bell size={15} />, label: 'Send Reminder', reason: `${overdueDaysValue} days overdue, ${rc?.brokenPromises ? 'promises broken, ' : ''}ignored previous reminders`, action: 'send_reminder' }
    if (overdueDaysValue && overdueDaysValue > 0) return { icon: <Bell size={15} />, label: 'Send Reminder', reason: `${overdueDaysValue} days overdue`, action: 'send_reminder' }
    return { icon: <Bell size={15} />, label: 'Send Reminder', reason: 'Customer balance', action: 'send_reminder' }
  })()

  const actionColor = nextAction.action === 'call' ? 'red' : nextAction.action === 'visit' ? 'orange' : 'blue'

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="cw-head-main">
          <h1 className="cw-name">{c?.name ?? 'Customer'}</h1>
          {c?.phone ? <a className="cw-phone" href={`tel:${c.phone}`}>{c.phone}</a> : null}
          {rc ? <span className={`cw-state cw-state--${statusColor(rc.state)}`}>{rc.state.replace(/_/g, ' ')}</span> : null}
        </div>
      </header>

      {/* Outstanding summary */}
      <section className="cw-hero">
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Customer Balance</span>
          <span className="cw-hero-num">{rc ? fmt(rc.outstanding) : fmt(0)}</span>
          {data.invoices.length > 1 ? (
            <span className="cw-hero-sub">Across {data.invoices.length} invoices</span>
          ) : null}
        </div>
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Overdue</span>
          <span className="cw-hero-num">{overdueDaysValue ? `${overdueDaysValue} days` : 'Current'}</span>
        </div>
        {rc?.promiseDate ? (
          <div className="cw-hero-item">
            <span className="cw-hero-lbl">Promise</span>
            <span className="cw-hero-num">{fmtDate(rc.promiseDate)}</span>
          </div>
        ) : null}
      </section>

      {/* Expected today breakdown — traceable to the dashboard target */}
      {rc && rc.outstanding > 0 ? (
        <section className="cw-expect">
          <div className="cw-expect-row">
            <span className="cw-expect-lbl">Expected today</span>
            <span className="cw-expect-num">{fmt(rc.recoverableAmount ?? 0)}</span>
          </div>
          <div className="cw-expect-row">
            <span className="cw-expect-lbl">Remaining later</span>
            <span className="cw-expect-num cw-expect-num--dim">{fmt(Math.max(0, rc.outstanding - (rc.recoverableAmount ?? 0)))}</span>
          </div>
          {rc.recoveryConfidence != null ? (
            <p className="cw-expect-why">
              Why {rc.recoveryConfidence}%? {expectationReasons(rc, c?.tier ?? null).join(' · ')}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Recovery Score */}
      {rc && rc.outstanding > 0 ? (
        <section className="rc-block">
          <div className="rc-block-head"><h2>Recovery Score</h2></div>
          <div className={`rs-card rs--${rs.color}`}>
            <div className="rs-bar-wrap">
              <div className="rs-bar">
                <div className="rs-fill" style={{ width: `${rs.score}%` }} />
              </div>
              <span className="rs-pct">{rs.score}%</span>
            </div>
            <span className="rs-label">{rs.label}</span>
            {rc.lastPaymentAt ? (
              <span className="rs-meta">Last payment: {fmtDate(rc.lastPaymentAt)}</span>
            ) : null}
            {overdueDaysValue ? (
              <span className="rs-meta">Last activity: {overdueDaysValue}d overdue</span>
            ) : null}
            <span className="rs-meta">Next: {nextAction.label}</span>
          </div>
        </section>
      ) : null}

      {/* Next Best Action */}
      <section className={`rc-block rc-block--action rc-block--${actionColor}`}>
        <div className="rc-block-head"><h2>Recommended Action</h2></div>
        <div className="cw-action-card">
          <div className="cw-action-icon">{nextAction.icon}</div>
          <div className="cw-action-body">
            <span className="cw-action-label">{nextAction.label}</span>
            <span className="cw-action-reason">{nextAction.reason}</span>
          </div>
        </div>
      </section>

      {/* Invoices with age */}
      <section className="rc-block">
        <div className="rc-block-head"><h2>Invoices</h2><span className="rc-count">{data.invoices.length}</span></div>
        {data.invoices.length === 0 ? (
          <div className="rc-empty"><FileText size={18} /><span>No invoices.</span></div>
        ) : (
          <div className="rc-list rc-list--tight">
            {data.invoices.map((inv) => {
              const od = overdueDays(inv.dueDate)
              return (
                <Link key={inv.id} href={`/invoices/${inv.id}`} className="rc-row">
                  <div className="rc-row-icon"><FileText size={15} /></div>
                  <div className="rc-row-main">
                    <span className="rc-row-title">{inv.number ?? 'Invoice'} · {fmt(inv.total)}</span>
                    <span className="rc-row-sub">
                      {od != null ? (
                        od > 0
                          ? <span className="rc-age rc-age--overdue">{od} days overdue</span>
                          : <span className="rc-age rc-age--current">Due today</span>
                      ) : null}
                      <span>{inv.status}</span>
                    </span>
                    <span className="rc-row-date">Issued {fmtDate(inv.createdAt)}</span>
                  </div>
                  <div className="rc-row-time">{fmt(inv.total)}</div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Activity */}
      <section className="rc-block">
        <div className="rc-block-head">
          <h2>Activity</h2>
          <Link href={`/recovery/timeline?customerId=${encodeURIComponent(customerId)}`} className="cw-link">Full activity →</Link>
        </div>
        {data.communication.length === 0 ? (
          <div className="rc-empty"><MessageSquare size={18} /><span>No recovery activity yet.</span></div>
        ) : (
          <div className="rc-timeline">
            {data.communication.slice(0, 5).map((m, i) => (
              <div key={i} className="rc-tl-item">
                <div className={`rc-tl-dot ${m.kind === 'wa' && m.text === 'read' ? 'rc-tl-dot--read' : m.kind === 'wa' && m.text === 'delivered' ? 'rc-tl-dot--delivered' : ''}`} />
                <div className="rc-tl-body">
                  <span className="rc-tl-text">{m.text}{m.detail ? ` · ${m.detail}` : ''}</span>
                </div>
                <div className="rc-tl-time">{fmtTime(m.at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Promises */}
      <section className="rc-block">
        <div className="rc-block-head"><h2>Promises</h2><span className="rc-count">{data.promises.length}</span></div>
        {data.promises.length === 0 ? (
          <div className="rc-empty"><HeartHandshake size={18} /><span>No promises made.</span></div>
        ) : (
          <div className="rc-list rc-list--tight">
            {data.promises.map((p) => (
              <div key={p.id} className="rc-row">
                <div className="rc-row-icon"><HeartHandshake size={15} /></div>
                <div className="rc-row-main">
                  <span className="rc-row-title">{fmtDate(p.promiseDate)}</span>
                  <span className="rc-row-sub">{p.status}{p.note ? ` · ${p.note}` : ''}</span>
                </div>
                <div className="rc-row-time">{p.amount ? fmt(p.amount) : ''}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recovery Plan */}
      <section className="rc-block">
        <div className="rc-block-head"><h2>Recovery Plan</h2><span className="rc-count">{data.actions.length}</span></div>
        {data.actions.length === 0 ? (
          <div className="rc-empty"><CircleDashed size={18} /><span>No actions scheduled.</span></div>
        ) : (
          <div className="rc-list">
            {data.actions.map((a) => (
              <div key={a.id} className={`rc-card ${a.status === 'scheduled' ? '' : 'rc-card--done'}`}>
                <div className="rc-card-top">
                  <span className="rc-cust">
                    {a.actionType === 'call' ? <Phone size={13} /> : <MessageSquare size={13} />}
                    {' '}{actionLabel(a.actionType)}
                  </span>
                  <span className={`tag ${a.status === 'completed' ? 'tag--success' : a.status === 'failed' || a.status === 'cancelled' ? 'tag--warning' : a.status === 'scheduled' ? 'tag--info' : ''}`}>
                    {a.status}
                  </span>
                </div>
                <div className="rc-meta">
                  {a.channel ? <span>{a.channel}</span> : null}
                  {a.templateName ? <span>· {a.templateName}</span> : null}
                  {a.delivery.readAt ? <span className="rc-meta-warn" style={{ color: 'hsl(var(--success))' }}><CheckCircle2 size={12} /> Read</span> : null}
                  {a.delivery.deliveredAt && !a.delivery.readAt ? <span><CheckCircle2 size={12} /> Delivered</span> : null}
                </div>
                <div className="rc-meta">{fmtDate(a.scheduledAt)}{a.completedAt ? ` · done ${fmtDate(a.completedAt)}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Customer Notes */}
      <section className="rc-block">
        <div className="rc-block-head"><h2>Customer Notes</h2><span className="rc-count rc-count--muted">{notes.length}</span></div>
        {notes.length === 0 ? (
          <div className="rc-empty"><span>No notes yet. Add what you learn about this customer.</span></div>
        ) : (
          <div className="rc-list rc-list--tight">
            {notes.map((n) => (
              <div key={n.id} className="cw-mem">
                <button className="cw-mem-pin" onClick={() => togglePin(n.id, n.is_pinned)} title={n.is_pinned ? 'Unpin' : 'Pin'}>
                  {n.is_pinned ? <Pin size={14} /> : <PenLine size={14} />}
                </button>
                <span className="cw-mem-text">{n.note}</span>
                <button className="cw-mem-del" onClick={() => deleteNote(n.id)} title="Delete"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="cw-mem-add">
          <input
            className="cw-mem-input"
            placeholder="Only answers after 7PM, always asks for 3 days, talk to his accountant"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !savingNote) saveNote() }}
          />
          <button className="rc-btn cw-mem-save" onClick={saveNote} disabled={savingNote || !draft.trim()}>
            {savingNote ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Today's First Action — replaces floating CTA */}
      {rc && rc.outstanding > 0 && !hideFirstAction ? (
        <div className="cw-first-action">
          <div className="cfa-head">
            <span className="cfa-label">Today&apos;s First Action</span>
            <button className="cfa-close" onClick={() => setHideFirstAction(true)}><X size={16} /></button>
          </div>
          <div className={`cfa-card cfa--${actionColor}`}>
            <div className="cfa-icon">{nextAction.icon}</div>
            <div className="cfa-body">
              <span className="cfa-action">{nextAction.label}</span>
              <span className="cfa-customer">{c?.name ?? 'Customer'}</span>
              <span className="cfa-amount">{rc ? fmt(rc.outstanding) : ''}</span>
            </div>
            {c?.phone ? (
              <a href={`tel:${c.phone}`} className={`cfa-btn cfa-btn--${actionColor}`}>
                <Phone size={15} /> {nextAction.action === 'call' ? 'Call Now' : 'Action'}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
