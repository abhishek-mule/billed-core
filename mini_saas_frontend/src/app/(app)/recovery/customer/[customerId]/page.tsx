'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, MessageSquare, ArrowLeft, ChevronDown,
  FileText, CheckCircle2, Send, Banknote, UserPlus, Loader2, Pin, PenLine, X, Clock,
} from 'lucide-react'
import '@/styles/recovery-center.css'
import { calculateDaysOverdue } from '@/lib/billzo/days-overdue'

type Customer = {
  id: string; name: string; phone: string | null; email: string | null; tier: string | null; gstin: string | null
}
type CaseInfo = {
  id: string; outstanding: number; overdue: number; state: string
  promiseDate: string | null; brokenPromises: number; lastPaymentAt: string | null; nextAction: string | null
}
type Invoice = { id: string; number: string | null; total: number; status: string; dueDate: string | null; createdAt: string }

type RecoveryDecision = {
  state: 'blocked_phone' | 'recovered' | 'call' | 'remind' | 'waiting' | 'none'
  headline: string
  reason: string
  targetInvoiceId: string | null
  invoices: {
    invoiceId: string
    number: string
    amount: number
    overdueDays: number
    state: 'remind' | 'call' | 'waiting' | 'recovered'
    delivery: 'read' | 'delivered' | 'sent' | null
    lastEvidenceAt: string | null
  }[]
  generatedAt: string
}

type Workspace = {
  customer: Customer | null
  case: CaseInfo | null
  invoices: Invoice[]
  communication: { at: string; kind: string; text: string; detail: string }[]
  decision: RecoveryDecision | null
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function overdueDays(dueDate: string | null): number | null {
  if (!dueDate) return null
  return calculateDaysOverdue(dueDate)
}

const decisionTone: Record<string, string> = {
  blocked_phone: 'red',
  recovered: 'green',
  call: 'red',
  remind: 'blue',
  waiting: 'blue',
  none: 'green',
}

export default function CustomerWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.customerId ? decodeURIComponent(String(params.customerId)) : ''
  const [data, setData] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [draft, setDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [invoicesOpen, setInvoicesOpen] = useState(false)

  useEffect(() => {
    if (!customerId) return
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

  if (loading) return <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading…</span></div>
  if (error || !data) return <div className="rc-loading"><span>{error ?? 'Not found'}</span><button className="rc-btn" onClick={() => router.back()}>Back</button></div>

  const c = data.customer
  const rc = data.case
  const overdueDaysValue = rc && rc.overdue > 0 ? rc.overdue : null
  const outstanding = rc?.outstanding ?? 0
  const invoiceCount = data.invoices.length
  const decision = data.decision
  const tone = (decision && decisionTone[decision.state]) || 'blue'

  const openInvoices = data.invoices.filter((i) => i.total > 0)
  const targetInvoice = openInvoices.find((i) => i.id === decision?.targetInvoiceId) || openInvoices[0] || null

  const openTarget = () => {
    if (targetInvoice) router.push(`/invoices/${targetInvoice.id}`)
  }

  const bannerIcon =
    decision?.state === 'blocked_phone' ? <UserPlus size={18} />
      : decision?.state === 'call' ? <Phone size={18} />
      : decision?.state === 'recovered' ? <CheckCircle2 size={18} />
      : decision?.state === 'waiting' ? <Clock size={18} />
      : <Send size={18} />

  const bannerTag =
    decision?.state === 'blocked_phone' ? 'Action needed'
      : decision?.state === 'recovered' ? 'Recovered'
      : decision?.state === 'waiting' ? 'Await customer'
      : 'Recommended action'

  const bannerTitle = decision?.headline ?? '—'
  const bannerReason = decision?.reason ?? ''

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

      {/* Summary — amount + count + overdue + promise */}
      <section className="cw-hero">
        <div className="cw-hero-item">
          <span className="cw-hero-lbl">Outstanding</span>
          <span className="cw-hero-num">{fmt(outstanding)}</span>
          {invoiceCount > 0 ? (
            <span className="cw-hero-sub">Across {invoiceCount} invoice{invoiceCount > 1 ? 's' : ''}</span>
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

      {/* Single authoritative next action — rendered from server decision */}
      {decision ? (
        <section className={`cw-next cw-next--${tone}`}>
          <div className="cw-next-icon">{bannerIcon}</div>
          <div className="cw-next-body">
            <span className="cw-next-tag">{bannerTag}</span>
            <span className="cw-next-title">{bannerTitle}</span>
            <span className="cw-next-sub">{bannerReason}</span>
          </div>
          {decision.state === 'blocked_phone' ? (
            <Link href={`/parties/${customerId}`} className="rc-btn rc-btn--sm rc-btn--primary">Add phone number</Link>
          ) : decision.state === 'call' && c?.phone ? (
            <a href={`tel:${c.phone}`} className="rc-btn rc-btn--sm rc-btn--primary">Call customer</a>
          ) : decision.state === 'recovered' ? null : (
            <button className="rc-btn rc-btn--sm rc-btn--primary" onClick={openTarget}>Open invoice</button>
          )}
        </section>
      ) : null}

      {/* Bills — total + expandable individual invoices */}
      <section className="rc-block">
        <button className="cw-bills-head" onClick={() => setInvoicesOpen((v) => !v)}>
          <span>
            <FileText size={15} className="cw-bills-ic" />
            Bills
          </span>
          <span className="cw-bills-meta">
            {fmt(outstanding)} across {invoiceCount} bill{invoiceCount !== 1 ? 's' : ''}
            <ChevronDown size={16} className={`cw-bills-chev ${invoicesOpen ? 'cw-bills-chev--open' : ''}`} />
          </span>
        </button>
        {invoicesOpen && (
          <div className="rc-list rc-list--tight cw-bills-list">
            {data.invoices.length === 0 ? (
              <div className="rc-empty"><FileText size={18} /><span>No bills.</span></div>
            ) : (
              data.invoices.map((inv) => {
                const od = overdueDays(inv.dueDate)
                return (
                  <Link key={inv.id} href={`/invoices/${inv.id}`} className="rc-row">
                    <div className="rc-row-icon"><FileText size={15} /></div>
                    <div className="rc-row-main">
                      <span className="rc-row-title">{inv.number ?? 'Invoice'}</span>
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
              })
            )}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section className="rc-block">
        <div className="rc-block-head">
          <h2>Recent activity</h2>
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

      {/* Record payment */}
      {outstanding > 0 ? (
        <section className="rc-block">
          <button className="cw-record-payment" onClick={openTarget}>
            <Banknote size={18} />
            Record Payment
          </button>
        </section>
      ) : null}

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
    </div>
  )
}
