'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, MessageSquare, Clock, CheckCircle2, ArrowLeft, ArrowRight,
  AlertTriangle, HeartHandshake, Bell, FileText, PartyPopper,
  Loader2, CircleDashed,
} from 'lucide-react'
import '@/styles/recovery-center.css'

type Customer = {
  id: string; name: string; phone: string; email: string | null; tier: string | null; gstin: string | null
}
type CaseInfo = {
  id: string; outstanding: number; overdue: number; state: string
  promiseDate: string | null; brokenPromises: number; lastPaymentAt: string | null; nextAction: string | null
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
const daysBetween = (a: string | null, b = Date.now()) =>
  a ? Math.floor((b - new Date(a).getTime()) / 86400000) : null

function actionLabel(a: string) {
  return (
    { call: 'Call', send_reminder: 'Send Reminder', reminder: 'Reminder', promise_followup: 'Promise Follow-up',
      visit: 'Visit', escalate: 'Escalate', payment_request: 'Payment Request', wait: 'Wait', record_payment: 'Record Payment' } as any
  )[a] || a.replace(/_/g, ' ')
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

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="cw-head-main">
          <h1 className="cw-name">{c?.name ?? 'Customer'}</h1>
          {c?.phone ? <a className="cw-phone" href={`tel:${c.phone}`}>{c.phone}</a> : null}
        </div>
      </header>

      {/* Outstanding summary */}
      <section className="cw-hero">
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Outstanding</span>
          <span className="cw-hero-num">{rc ? fmt(rc.outstanding) : fmt(0)}</span>
        </div>
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Overdue</span>
          <span className="cw-hero-num">{rc && rc.overdue > 0 ? `${rc.overdue}d` : '—'}</span>
        </div>
        {rc?.promiseDate ? (
          <div className="cw-hero-item">
            <span className="cw-hero-lbl">Promise</span>
            <span className="cw-hero-num">{fmtDate(rc.promiseDate)}</span>
          </div>
        ) : null}
      </section>

      {/* Merchant Memory — merchant-owned long-term knowledge */}
      <section className="rc-block">
        <div className="rc-block-head"><h2>Merchant Memory</h2><span className="rc-count rc-count--muted">{notes.length}</span></div>
        {notes.length === 0 ? (
          <div className="rc-empty"><span>No memory yet. Add what you learn about this customer.</span></div>
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
            placeholder="Add memory (e.g. Only answers after 7PM)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !savingNote) saveNote() }}
          />
          <button className="rc-btn rc-btn--primary cw-mem-save" onClick={saveNote} disabled={savingNote || !draft.trim()}>
            {savingNote ? 'Saving…' : 'Save'}
          </button>
        </div>
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
                  <span className="rc-row-sub">{fmtDate(inv.dueDate)} · {inv.status}</span>
                </div>
                <div className="rc-row-time">{fmt(inv.total)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Communication */}
      <section className="rc-block">
        <div className="rc-block-head">
          <h2>Communication</h2>
          <Link href={`/recovery/timeline?customerId=${encodeURIComponent(customerId)}`} className="cw-link">Full timeline →</Link>
        </div>
        {data.communication.length === 0 ? (
          <div className="rc-empty"><MessageSquare size={18} /><span>No communication yet.</span></div>
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

      {/* Bottom action bar */}
      {rc && rc.outstanding > 0 ? (
        <div className="cw-actions">
          <Link href={`/recovery/work`} className="rc-btn rc-btn--ghost">Open in Queue</Link>
          <a href={`tel:${c?.phone ?? ''}`} className="rc-btn rc-btn--primary">
            <Phone size={15} /> Call
          </a>
        </div>
      ) : null}
    </div>
  )
}
