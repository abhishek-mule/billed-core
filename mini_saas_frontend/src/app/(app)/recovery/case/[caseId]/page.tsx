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
  const recommendationLabel = rec?.nextBestAction === 'call' ? 'Call Today' : rec?.nextBestAction === 'visit' ? 'Visit Customer' : rec?.nextBestAction === 'follow_up' ? 'Follow Up' : rec?.nextBestAction === 'send_reminder' ? 'Send Reminder' : rec?.nextBestAction === 'update_contact' ? (c?.phone ? 'Update Contact' : 'Add Number') : 'Send Reminder'

  return (
    <div className="min-h-screen bg-muted/50 pb-36">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-6">
        {/* Header navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <Link
            href={`/recovery/timeline?caseId=${encodeURIComponent(caseId)}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Full Activity Log →
          </Link>
        </div>

        {/* Hero Card */}
        <WorkspaceHero
          customerName={c?.name ?? 'Walk-in Customer'}
          customerPhone={c?.phone || undefined}
          outstanding={proj.case.outstandingAmount}
          overdueDays={proj.case.overdueDays}
          priority={proj.case.priority}
          recommendation={rec ? { nextBestAction: rec.nextBestAction, urgency: rec.urgency, reason: rec.reason } : null}
          metrics={proj.metrics}
          timeline={proj.timeline}
          onCall={handleCall}
          onSendReminder={() => setShowOutcome(true)}
          onRecordOutcome={() => setShowOutcome(true)}
        />

        {/* Activity Section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Activity History</h2>
          </div>
          <RecoveryEventTimeline
            key={timelineRefreshKey}
            caseId={caseId}
            emptyMessage="No recovery activity recorded yet."
          />
        </div>

        {/* Invoices Section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Invoices <span className="ml-1 text-xs font-normal text-muted-foreground">({proj.invoices.length})</span>
            </h2>
          </div>
          {proj.invoices.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <FileText size={16} /> No invoices found.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {proj.invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-muted/30 px-2 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:text-foreground shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{inv.number ?? 'Invoice'}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.overdueDays > 0 ? (
                          <span className="text-overdue font-medium">{inv.overdueDays}d overdue</span>
                        ) : (
                          <span>Due {fmtDate(inv.dueDate)}</span>
                        )}
                        {' · '}
                        <span className="capitalize">{inv.status}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums shrink-0">{fmt(inv.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Promises Section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Promises <span className="ml-1 text-xs font-normal text-muted-foreground">({proj.promises.length})</span>
            </h2>
          </div>
          {proj.promises.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <HeartHandshake size={16} /> No promises recorded.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {proj.promises.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3 px-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                      <HeartHandshake size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{fmtDate(p.date)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.status}{p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums shrink-0">{p.amount ? fmt(p.amount) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Notes Section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Customer Notes <span className="ml-1 text-xs font-normal text-muted-foreground">({proj.notes.length})</span>
            </h2>
          </div>
          {customerId ? (
            <div className="space-y-3">
              {proj.notes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No notes yet. Add key details about this customer below.</p>
              ) : (
                <div className="space-y-2">
                  {proj.notes.map((n) => (
                    <div key={n.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border/50 text-xs text-foreground">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          onClick={() => togglePin(n.id, n.isPinned)}
                          title={n.isPinned ? 'Unpin' : 'Pin'}
                          className={`p-1 rounded hover:bg-muted ${n.isPinned ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                          <Pin size={13} />
                        </button>
                        <span className="truncate">{n.note}</span>
                      </div>
                      <button
                        onClick={() => deleteNote(n.id)}
                        title="Delete"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <input
                  className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  placeholder="e.g. Only answers after 7PM, prefers WhatsApp..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !savingNote) saveNote() }}
                />
                <button
                  onClick={saveNote}
                  disabled={savingNote || !draft.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.97]"
                >
                  {savingNote ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Create a customer profile to track notes and history.</p>
          )}
        </div>

        {/* Outcome Modal Dialog */}
        {showOutcome && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-150" onClick={() => setShowOutcome(false)}>
            <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground">Record Collection Outcome</h3>
                <button onClick={() => setShowOutcome(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => recordOutcome('promised')}
                  disabled={!!submittingOutcome}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-colors"
                >
                  <HeartHandshake size={15} /> Promised
                </button>
                <button
                  onClick={() => recordOutcome('paid')}
                  disabled={!!submittingOutcome}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-success/30 bg-success-soft text-success text-xs font-bold hover:bg-success/20 transition-colors"
                >
                  <CheckCircle2 size={15} /> Paid
                </button>
                <button
                  onClick={() => recordOutcome('no_answer')}
                  disabled={!!submittingOutcome}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-border bg-muted/40 text-foreground text-xs font-semibold hover:bg-muted transition-colors"
                >
                  <Phone size={15} /> No Answer
                </button>
                <button
                  onClick={() => recordOutcome('wrong_number')}
                  disabled={!!submittingOutcome}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-border bg-muted/40 text-foreground text-xs font-semibold hover:bg-muted transition-colors"
                >
                  <Phone size={15} /> Wrong Number
                </button>
                <button
                  onClick={() => recordOutcome('dispute')}
                  disabled={!!submittingOutcome}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-danger/30 bg-danger-soft text-danger text-xs font-bold hover:bg-danger/20 transition-colors"
                >
                  <AlertTriangle size={15} /> Dispute
                </button>
                <button
                  onClick={() => recordOutcome('not_interested')}
                  disabled={!!submittingOutcome}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-border bg-muted/40 text-muted-foreground text-xs font-semibold hover:bg-muted transition-colors"
                >
                  <X size={15} /> Refused
                </button>
              </div>
              <div className="space-y-2">
                <input
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  placeholder="Add note (optional)"
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                />
                {outcomeNote ? (
                  <input
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    type="date"
                    value={promiseDate}
                    onChange={(e) => setPromiseDate(e.target.value)}
                  />
                ) : null}
              </div>
              <button
                onClick={() => setShowOutcome(false)}
                className="w-full py-2 bg-muted text-muted-foreground hover:text-foreground rounded-xl text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Fixed Bottom Action Bar */}
        {proj.case.outstandingAmount > 0 && (
          <div className="fixed inset-x-0 bottom-6 z-40 px-4 pointer-events-none">
            <div className="mx-auto max-w-md bg-foreground text-background rounded-2xl p-2.5 shadow-2xl flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setShowOutcome(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors"
              >
                <CheckCircle2 size={15} /> Record Outcome
              </button>
              {c?.phone && (
                <a
                  href={`tel:${c.phone}`}
                  onClick={handleCall}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <Phone size={15} /> Call Customer
                </a>
              )}
            </div>
          </div>
        )}

        {/* Post Outcome Floating CTA */}
        {showPostOutcomeCta && (
          <div className="fixed inset-x-0 bottom-6 z-40 px-4 pointer-events-none">
            <div className="mx-auto max-w-md bg-foreground text-background rounded-2xl p-2.5 shadow-2xl flex items-center gap-2 pointer-events-auto">
              <Link
                href="/recovery/queue"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
              >
                <ArrowLeft size={15} /> Back to Queue
              </Link>
              <Link
                href={`/recovery/timeline?caseId=${caseId}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors"
              >
                <Clock size={15} /> View Timeline
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )

}
