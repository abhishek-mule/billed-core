'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Phone, MessageSquare, CheckCircle2, ArrowLeft,
  HeartHandshake, Bell, FileText, Loader2,
  AlertTriangle, Clock, Pin, PenLine, X,
} from 'lucide-react'
import { ErrorState } from '@/components/billzo/ErrorState'
import { RecoveryEventTimeline } from '@/components/billzo/RecoveryEventTimeline'
import { WorkspaceHero } from '@/components/billzo/WorkspaceHero'
import '@/styles/recovery-center.css'

import type { CaseProjection } from '@/lib/billzo/case-projection'

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function CaseWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const caseId = decodeURIComponent(String(params.caseId))
  const [proj, setProj] = useState<CaseProjection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showOutcome, setShowOutcome] = useState(false)
  const [outcomeNote, setOutcomeNote] = useState('')
  const [promiseDate, setPromiseDate] = useState('')
  const [submittingOutcome, setSubmittingOutcome] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showPostOutcomeCta, setShowPostOutcomeCta] = useState(false)
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0)

  const c = proj?.case?.customer
  const rc = proj?.case
  const rec = proj?.recommendations
  const customerId = c?.id || null

  const loadProjection = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/recovery/case-projection?caseId=${encodeURIComponent(caseId)}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const json = await res.json()
      setProj(json)
    } catch (e: any) {
      setError(e.message || 'Failed')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/recovery/case-projection?caseId=${encodeURIComponent(caseId)}`, { credentials: 'include' })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (active) setProj(json)

        const rc = json.case
        const recommendedAction = rc?.priority === 'high' ? 'call' : 'send_reminder'
        const sesRes = await fetch('/api/recovery/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            caseId,
            customerId: json.case?.customer?.id || null,
            startingRecommendation: recommendedAction,
          }),
        })
        if (sesRes.ok) {
          const sesJson = await sesRes.json()
          if (active) setSessionId(sesJson.session?.id || null)
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed')
        console.error('[CaseWorkspace] load error:', e.message || e, 'caseId:', caseId)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [caseId])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && sessionStorage.getItem('pendingOutcome') === 'true') {
        sessionStorage.removeItem('pendingOutcome')
        setShowOutcome(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const handleCall = () => {
    sessionStorage.setItem('pendingOutcome', 'true')
    if (sessionId) {
      fetch('/api/recovery/session', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'call' }),
      }).catch(() => {})
    }
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
      if (res.ok) {
        setDraft('')
        await loadProjection({ silent: true })
      }
    } finally { setSavingNote(false) }
  }

  const togglePin = async (id: string, pinned: boolean) => {
    if (!customerId) return
    await fetch('/api/recovery/memory', {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, is_pinned: !pinned }),
    })
    await loadProjection({ silent: true })
  }

  const deleteNote = async (id: string) => {
    if (!customerId) return
    await fetch(`/api/recovery/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    await loadProjection({ silent: true })
  }

  const recordOutcome = async (outcome: string) => {
    setSubmittingOutcome(outcome)
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
        if (sessionId) {
          fetch('/api/recovery/session', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId, end: true, outcome,
              notes: outcomeNote || undefined,
              recommendationAccepted: outcome !== 'dispute' && outcome !== 'not_interested',
            }),
          }).catch(() => {})
        }

        const outcomeLabels: Record<string, string> = {
          promised: 'Promise recorded',
          wrong_number: 'Marked as wrong number',
          no_answer: 'Marked as no answer',
          dispute: 'Dispute raised',
          paid: 'Marked as paid',
          not_interested: 'Marked as not interested',
        }
        setShowOutcome(false)
        setOutcomeNote('')
        setPromiseDate('')

        toast.success(outcomeLabels[outcome] || 'Outcome recorded')
        await loadProjection({ silent: true })
        setShowPostOutcomeCta(true)
        setTimelineRefreshKey((k) => k + 1)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to record outcome')
      }
    } catch {
      toast.error('Network error — could not record outcome')
    } finally {
      setSubmittingOutcome(null)
    }
  }

  if (loading) return <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading workspace…</span></div>
  if (error || !proj) {
    return (
      <div className="rc-page">
        <div className="rc-loading">
          <ErrorState
            message={error ?? 'Case not found'}
            onRetry={loadProjection}
            action={<button className="rc-btn" onClick={() => router.back()}><ArrowLeft size={14} /> Back</button>}
          />
        </div>
      </div>
    )
  }

  const recommendationIcon = rec?.nextBestAction === 'call' ? <Phone size={15} /> : rec?.nextBestAction === 'visit' ? <Phone size={15} /> : <Bell size={15} />
  const recommendationLabel = rec?.nextBestAction === 'call' ? 'Call Today' : rec?.nextBestAction === 'visit' ? 'Visit Customer' : rec?.nextBestAction === 'follow_up' ? 'Follow Up' : rec?.nextBestAction === 'send_reminder' ? 'Send Reminder' : rec?.nextBestAction === 'update_contact' ? 'Update Contact' : 'Send Reminder'

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
      </header>

      <WorkspaceHero
        customerName={c?.name ?? 'Walk-in Customer'}
        customerPhone={c?.phone || undefined}
        outstanding={proj.case.outstandingAmount}
        overdueDays={proj.case.overdueDays}
        priority={proj.case.priority}
        recommendation={rec ? { nextBestAction: rec.nextBestAction, urgency: rec.urgency, reason: rec.reason } : null}
        metrics={proj.metrics}
        timeline={proj.timeline}
      />

      <section className="rc-block">
        <div className="rc-block-head">
          <h2>Recovery Timeline</h2>
          <Link href={`/recovery/timeline?caseId=${encodeURIComponent(caseId)}`} className="cw-link">Full timeline →</Link>
        </div>
        <RecoveryEventTimeline
          key={timelineRefreshKey}
          caseId={caseId}
          emptyMessage="No recovery activity yet."
        />
      </section>

      <section className="rc-block">
        <div className="rc-block-head"><h2>Invoices</h2><span className="rc-count">{proj.invoices.length}</span></div>
        {proj.invoices.length === 0 ? (
          <div className="rc-empty"><FileText size={18} /><span>No invoices.</span></div>
        ) : (
          <div className="rc-list rc-list--tight">
            {proj.invoices.map((inv) => (
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
                <div className="rc-row-time">{fmt(inv.amount)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rc-block">
        <div className="rc-block-head"><h2>Promises</h2><span className="rc-count">{proj.promises.length}</span></div>
        {proj.promises.length === 0 ? (
          <div className="rc-empty"><HeartHandshake size={18} /><span>No promises made.</span></div>
        ) : (
          <div className="rc-list rc-list--tight">
            {proj.promises.map((p) => (
              <div key={p.id} className="rc-row">
                <div className="rc-row-icon"><HeartHandshake size={15} /></div>
                <div className="rc-row-main">
                  <span className="rc-row-title">{fmtDate(p.date)}</span>
                  <span className="rc-row-sub">{p.status}{p.note ? ` · ${p.note}` : ''}</span>
                </div>
                <div className="rc-row-time">{p.amount ? fmt(p.amount) : ''}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rc-block">
        <div className="rc-block-head"><h2>Customer Notes</h2><span className="rc-count rc-count--muted">{proj.notes.length}</span></div>
        {customerId ? (
          <>
            {proj.notes.length === 0 ? (
              <div className="rc-empty"><span>No notes yet. Add what you learn about this customer.</span></div>
            ) : (
              <div className="rc-list rc-list--tight">
                {proj.notes.map((n) => (
                  <div key={n.id} className="cw-mem">
                    <button className="cw-mem-pin" onClick={() => togglePin(n.id, n.isPinned)} title={n.isPinned ? 'Unpin' : 'Pin'}>
                      {n.isPinned ? <Pin size={14} /> : <PenLine size={14} />}
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
                <X size={16} /> Not Interested
              </button>
            </div>
            <input className="oc-note" placeholder="Add note (optional)" value={outcomeNote} onChange={(e) => setOutcomeNote(e.target.value)} />
            {outcomeNote ? (
              <input className="oc-date" type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} placeholder="Promise date" />
            ) : null}
            <button className="oc-cancel" onClick={() => setShowOutcome(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {proj.case.outstandingAmount > 0 ? (
        <div className="cw-actions">
          <button className="rc-btn rc-btn--ghost" onClick={() => setShowOutcome(true)}>
            <CheckCircle2 size={14} /> Record Outcome
          </button>
          {c?.phone ? (
            <a href={`tel:${c.phone}`} className="rc-btn rc-btn--primary" onClick={handleCall}>
              <Phone size={15} /> Call
            </a>
          ) : (
            <button className="rc-btn rc-btn--primary" onClick={() => setShowOutcome(true)}>
              <MessageSquare size={15} /> Record Outcome
            </button>
          )}
        </div>
      ) : null}

      {showPostOutcomeCta ? (
        <div className="cw-actions" style={{ marginTop: '1rem' }}>
          <Link href="/recovery/queue" className="rc-btn rc-btn--primary"><ArrowLeft size={14} /> Back to Queue</Link>
          <Link href={`/recovery/timeline?caseId=${caseId}`} className="rc-btn rc-btn--ghost"><Clock size={14} /> View Timeline</Link>
        </div>
      ) : null}
    </div>
  )
}
