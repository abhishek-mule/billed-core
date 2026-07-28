'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, MessageSquare, CheckCircle2, ArrowLeft, ArrowRight,
  HeartHandshake, Bell, FileText, Loader2, CircleDashed,
  AlertTriangle, Clock,
} from 'lucide-react'
import '@/styles/recovery-center.css'

type Customer = {
  id: string; name: string; phone: string; email: string | null; tier: string | null; gstin: string | null
}
type CaseInfo = {
  id: string; outstanding: number; overdue: number; state: string
  promiseDate: string | null; brokenPromises: number; lastPaymentAt: string | null; nextAction: string | null
}
type Invoice = { id: string; number: string | null; total: number; status: string; dueDate: string | null; createdAt: string; overdueDays: number }
type ActionRow = {
  id: string; actionType: string; channel: string | null; templateName: string | null; status: string
  triggerType: string | null; scheduledAt: string; completedAt: string | null; invoiceIds: string[]
  events: { type: string; toStatus: string | null; at: string; detail: string }[]
  delivery: { deliveredAt: string | null; readAt: string | null; opens: number }
}
type PromiseRow = { id: string; promiseDate: string | null; amount: number; status: string; createdAt: string; note: string | null }
type Comm = { at: string; kind: string; text: string; detail: string; actionId: string | null }

type CaseWorkspace = {
  caseId: string
  customer: Customer | null
  case: CaseInfo
  invoices: Invoice[]
  invoiceCount: number
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

export default function CaseWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const caseId = decodeURIComponent(String(params.caseId))
  const [data, setData] = useState<CaseWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [draft, setDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showOutcome, setShowOutcome] = useState(false)
  const [outcomeNote, setOutcomeNote] = useState('')
  const [promiseDate, setPromiseDate] = useState('')
  const [submittingOutcome, setSubmittingOutcome] = useState<string | null>(null)
  const [outcomeMsg, setOutcomeMsg] = useState<string | null>(null)

  const customerId = data?.customer?.id || null

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/recovery/case?caseId=${encodeURIComponent(caseId)}`, { credentials: 'include' })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (active) setData(json)

        if (json.customer?.id) {
          const nres = await fetch(`/api/recovery/memory?customerId=${encodeURIComponent(json.customer.id)}`, { credentials: 'include' })
          if (nres.ok) {
            const nj = await nres.json()
            if (active) setNotes(nj.notes || [])
          }
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [caseId])

  const reloadNotes = async () => {
    if (!customerId) return
    const nres = await fetch(`/api/recovery/memory?customerId=${encodeURIComponent(customerId)}`, { credentials: 'include' })
    if (nres.ok) { const nj = await nres.json(); setNotes(nj.notes || []) }
  }

  const saveNote = async () => {
    const note = draft.trim()
    if (!note || !customerId) return
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
    if (!customerId) return
    await fetch('/api/recovery/memory', {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, is_pinned: !pinned }),
    })
    await reloadNotes()
  }

  const deleteNote = async (id: string) => {
    if (!customerId) return
    await fetch(`/api/recovery/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    await reloadNotes()
  }

  const recordOutcome = async (outcome: string) => {
    setSubmittingOutcome(outcome)
    setOutcomeMsg(null)
    try {
      const res = await fetch('/api/recovery/outcome', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caseId,
          outcome,
          note: outcomeNote,
          promiseDate: outcome === 'promised' ? promiseDate || undefined : undefined,
          customerId,
        }),
      })
      if (res.ok) {
        const outcomeLabels: Record<string, string> = {
          promised: 'Promise recorded',
          wrong_number: 'Marked as wrong number',
          no_answer: 'Marked as no answer',
          dispute: 'Dispute raised',
          paid: 'Marked as paid',
          not_interested: 'Marked as not interested',
        }
        setOutcomeMsg(outcomeLabels[outcome] || 'Outcome recorded')
        setShowOutcome(false)
        setOutcomeNote('')
        setPromiseDate('')
        // Reload workspace data after a moment
        setTimeout(() => window.location.reload(), 1500)
      } else {
        const err = await res.json()
        setOutcomeMsg(`Failed: ${err.error || 'unknown'}`)
      }
    } catch {
      setOutcomeMsg('Network error')
    } finally {
      setSubmittingOutcome(null)
    }
  }

  if (loading) return <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading workspace…</span></div>
  if (error || !data) return <div className="rc-loading"><span>{error ?? 'Not found'}</span><button className="rc-btn" onClick={() => router.back()}>Back</button></div>

  const c = data.customer
  const rc = data.case

  const nextAction = (() => {
    if (rc?.nextAction === 'call') return { icon: <Phone size={15} />, label: 'Call Today', reason: 'Needs direct conversation' }
    if (rc?.nextAction === 'visit') return { icon: <Phone size={15} />, label: 'Visit', reason: 'In-person follow-up needed' }
    if (rc?.nextAction === 'record_payment') return { icon: <HeartHandshake size={15} />, label: 'Record Payment', reason: 'Customer may have paid' }
    if (rc?.overdue && rc.overdue > 7) return { icon: <Bell size={15} />, label: 'Send Reminder', reason: `${rc.overdue} days overdue, ignored previous reminders` }
    if (rc?.overdue && rc.overdue > 0) return { icon: <Bell size={15} />, label: 'Send Reminder', reason: `${rc.overdue} days overdue` }
    return { icon: <Bell size={15} />, label: 'Send Reminder', reason: 'Outstanding balance' }
  })()

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="cw-head-main">
          <h1 className="cw-name">{c?.name ?? 'Walk-in Customer'}</h1>
          {c?.phone ? <a className="cw-phone" href={`tel:${c.phone}`}>{c.phone}</a> : null}
        </div>
      </header>

      {/* Outstanding summary */}
      <section className="cw-hero">
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Outstanding</span>
          <span className="cw-hero-num">{fmt(rc.outstanding)}</span>
          {data.invoiceCount > 1 ? (
            <span className="cw-hero-sub">Across {data.invoiceCount} invoices</span>
          ) : null}
        </div>
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Overdue</span>
          <span className="cw-hero-num">{rc.overdue > 0 ? `${rc.overdue}d` : 'Current'}</span>
        </div>
        {rc?.promiseDate ? (
          <div className="cw-hero-item">
            <span className="cw-hero-lbl">Promise</span>
            <span className="cw-hero-num">{fmtDate(rc.promiseDate)}</span>
          </div>
        ) : null}
      </section>

      {/* Next Best Action */}
      <section className="rc-block rc-block--action">
        <div className="rc-block-head"><h2>Recommended Action</h2></div>
        <div className="cw-action-card">
          <div className="cw-action-icon">{nextAction.icon}</div>
          <div className="cw-action-body">
            <span className="cw-action-label">{nextAction.label}</span>
            <span className="cw-action-reason">{nextAction.reason}</span>
          </div>
        </div>
      </section>

      {/* Recovery Timeline */}
      <section className="rc-block">
        <div className="rc-block-head">
          <h2>Recovery Timeline</h2>
          {customerId ? (
            <Link href={`/recovery/timeline?customerId=${encodeURIComponent(customerId)}`} className="cw-link">Full timeline →</Link>
          ) : null}
        </div>
        {data.communication.length === 0 ? (
          <div className="rc-empty"><MessageSquare size={18} /><span>No recovery activity yet.</span></div>
        ) : (
          <div className="rc-timeline">
            {data.communication.map((m, i) => (
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

      {/* Invoices */}
      <section className="rc-block">
        <div className="rc-block-head"><h2>Invoices</h2><span className="rc-count">{data.invoices.length}</span></div>
        {data.invoices.length === 0 ? (
          <div className="rc-empty"><FileText size={18} /><span>No invoices.</span></div>
        ) : (
          <div className="rc-list rc-list--tight">
            {data.invoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="rc-row">
                <div className="rc-row-icon"><FileText size={15} /></div>
                <div className="rc-row-main">
                  <span className="rc-row-title">{inv.number ?? 'Invoice'}</span>
                  <span className="rc-row-sub">
                    {inv.overdueDays > 0
                      ? <span className="rc-meta-warn">{inv.overdueDays}d overdue</span>
                      : <span>Due {fmtDate(inv.dueDate)}</span>
                    }
                    {' · '}{inv.status}
                  </span>
                </div>
                <div className="rc-row-time">{fmt(inv.total)}</div>
              </Link>
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

      {/* Action plan */}
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
        {customerId ? (
          <>
            {notes.length === 0 ? (
              <div className="rc-empty"><span>No notes yet. Add what you learn about this customer.</span></div>
            ) : (
              <div className="rc-list rc-list--tight">
                {notes.map((n) => (
                  <div key={n.id} className="cw-mem">
                    <button className="cw-mem-pin" onClick={() => togglePin(n.id, n.is_pinned)} title={n.is_pinned ? 'Unpin' : 'Pin'}>
                      {n.is_pinned ? '📌' : '📝'}
                    </button>
                    <span className="cw-mem-text">{n.note}</span>
                    <button className="cw-mem-del" onClick={() => deleteNote(n.id)} title="Delete">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="cw-mem-add">
              <input
                className="cw-mem-input"
                placeholder="Only answers after 7PM, prefers WhatsApp, brother handles payments"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !savingNote) saveNote() }}
              />
              <button className="rc-btn cw-mem-save" onClick={saveNote} disabled={savingNote || !draft.trim()}>
                {savingNote ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <div className="rc-empty"><span>Create a customer profile to track notes and history.</span></div>
        )}
      </section>

      {/* Outcome capture dialog */}
      {showOutcome ? (
        <div className="oc-overlay" onClick={() => setShowOutcome(false)}>
          <div className="oc-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="oc-title">What happened?</h3>
            <div className="oc-grid">
              <button className="oc-btn oc-btn--promised" onClick={() => recordOutcome('promised')} disabled={!!submittingOutcome}>
                <HeartHandshake size={16} /> Promised Payment
              </button>
              <button className="oc-btn oc-btn--paid" onClick={() => recordOutcome('paid')} disabled={!!submittingOutcome}>
                <CheckCircle2 size={16} /> Paid
              </button>
              <button className="oc-btn oc-btn--noans" onClick={() => recordOutcome('no_answer')} disabled={!!submittingOutcome}>
                <Phone size={16} /> No Answer
              </button>
              <button className="oc-btn oc-btn--wrong" onClick={() => recordOutcome('wrong_number')} disabled={!!submittingOutcome}>
                <Phone size={16} /> Wrong Number
              </button>
              <button className="oc-btn oc-btn--dispute" onClick={() => recordOutcome('dispute')} disabled={!!submittingOutcome}>
                <AlertTriangle size={16} /> Dispute Raised
              </button>
              <button className="oc-btn oc-btn--nointerest" onClick={() => recordOutcome('not_interested')} disabled={!!submittingOutcome}>
                ✕ Not Interested
              </button>
            </div>
            <input
              className="oc-note"
              placeholder="Add note (optional)"
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
            />
            {outcomeNote ? (
              <input
                className="oc-date"
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                placeholder="Promise date"
              />
            ) : null}
            <button className="oc-cancel" onClick={() => setShowOutcome(false)}>Cancel</button>
            {outcomeMsg ? <div className="oc-msg">{outcomeMsg}</div> : null}
          </div>
        </div>
      ) : null}

      {/* Bottom action bar */}
      {rc && rc.outstanding > 0 ? (
        <div className="cw-actions">
          <button className="rc-btn rc-btn--ghost" onClick={() => setShowOutcome(true)}>
            <CheckCircle2 size={14} /> Record Outcome
          </button>
          {c?.phone ? (
            <a href={`tel:${c.phone}`} className="rc-btn rc-btn--primary" onClick={() => setShowOutcome(true)}>
              <Phone size={15} /> Call
            </a>
          ) : (
            <button className="rc-btn rc-btn--primary" onClick={() => setShowOutcome(true)}>
              <MessageSquare size={15} /> Record Outcome
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
