'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Download,
  ArrowRight,
  Pause,
  X,
  RefreshCw,
} from 'lucide-react'
import { downloadRecoveryCasePDF } from '@/lib/billzo/escalation-pdf'
import type { RecoveryCaseSnapshot } from '@/lib/billzo/recovery-escalation'

interface RecoveryAssessment {
  caseId: string
  customerId: string
  customerName: string | null
  phone: string | null
  recommended: boolean
  grade: number
  basis: Array<{ kind: string; fact: string }>
  stage: string
  nextMove: string
  effortSummary: { attempts: number; days: number; noise: string; result: string }
  generatedAt: string
  escalation: {
    id: string
    status: string
    merchantDecision: string | null
    snapshot: RecoveryCaseSnapshot | null
  } | null
}

interface PreparedCase {
  alreadyPrepared: boolean
  status: string
  caseNumber: string
  escalationId: string
  preparedAt: string | null
  snapshot: RecoveryCaseSnapshot | null
}

export function EscalationActions({ caseId }: { caseId: string | null }) {
  const [assessment, setAssessment] = useState<RecoveryAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedCase | null>(null)

  const load = useCallback(async () => {
    if (!caseId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/recovery/case/${encodeURIComponent(caseId)}/escalation`, {
        credentials: 'include',
      })
      if (res.ok) {
        const json = (await res.json()) as { assessment: RecoveryAssessment }
        setAssessment(json.assessment)
        if (
          json.assessment.escalation?.status === 'prepared' ||
          json.assessment.escalation?.status === 'notified'
        ) {
          const snap = json.assessment.escalation.snapshot
          setPrepared({
            alreadyPrepared: true,
            status: json.assessment.escalation.status,
            caseNumber: snap?.caseNumber ?? 'RC-…',
            escalationId: json.assessment.escalation.id,
            preparedAt: null,
            snapshot: snap ?? null,
          })
        }
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => { void load() }, [load])

  const act = async (action: string, body: Record<string, any>, toastMsg: string) => {
    if (!caseId) return
    setActing(action)
    try {
      const res = await fetch(`/api/recovery/case/${encodeURIComponent(caseId)}/recovery-case`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || json.message || `Could not ${action}`)
        return
      }
      toast.success(toastMsg)
      if (json.prepared) setPrepared(json.prepared)
      void load()
    } catch {
      toast.error('Network error — could not complete action')
    } finally {
      setActing(null)
    }
  }

  const decide = async (decision: 'authorize' | 'offer_plan' | 'pause' | 'decline') => {
    if (!caseId) return
    setActing(`decide:${decision}`)
    try {
      const res = await fetch(`/api/recovery/case/${encodeURIComponent(caseId)}/escalation`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || json.message || 'Could not record decision')
        return
      }
      toast.success(
        decision === 'authorize'
          ? 'Escalation authorized — automated recovery handed over for manual review'
          : decision === 'offer_plan'
            ? 'Payment plan offered'
            : decision === 'pause'
              ? 'Recovery paused'
              : 'Escalation declined',
      )
      void load()
    } catch {
      toast.error('Network error — could not record decision')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="rc-esc rc-esc--loading" aria-busy="true">
        <Loader2 className="spin" size={15} /> Assessing recovery case…
      </div>
    )
  }

  // Escalation feature is not enabled (locked plan) — quiet, no banner.
  if (!caseId || !assessment?.escalation) {
    return (
      <div className="rc-esc rc-esc--quiet">
        <ShieldAlert size={14} />
        <span>Escalation not available for this case</span>
      </div>
    )
  }

  return (
    <div className={`rc-esc ${assessment.recommended ? 'rc-esc--warn' : 'rc-esc--calm'}`}>
      <div className="rc-esc-head">
        <span className="rc-esc-ic">
          <ShieldCheck size={14} />
        </span>
        <div className="rc-esc-head-body">
          <span className="rc-esc-title">
            {assessment.recommended ? 'Escalation recommended' : 'Escalation assessed'}
          </span>
          <span className="rc-esc-sub">
            {assessment.stage.replace(/_/g, ' ')} · {assessment.nextMove}
          </span>
        </div>
        <button className="rc-esc-refresh" type="button" onClick={() => void load()} title="Re-assess" aria-label="Re-assess">
          <RefreshCw size={14} />
        </button>
      </div>

      {assessment.basis.length > 0 ? (
        <ul className="rc-esc-basis">
          {assessment.basis.map((b) => (
            <li key={`${b.kind}-${b.fact}`}>{b.fact}</li>
          ))}
        </ul>
      ) : null}

      <div className="rc-esc-effort">
        {assessment.effortSummary.noise} — {assessment.effortSummary.result}
      </div>

      {prepared?.snapshot ? (
        <div className="rc-esc-pack">
          <span className="rc-esc-pack-title">
            <FileText size={14} /> Recovery Case {prepared.snapshot.caseNumber}
          </span>
          <div className="rc-esc-pack-actions">
            <button
              className="cw-record-payment cw-record-payment--ghost"
              type="button"
              onClick={() => prepared.snapshot ? void downloadRecoveryCasePDF(prepared.snapshot).catch(() => toast.error('Could not render PDF')) : undefined}
            >
              <Download size={14} /> PDF
            </button>
            <button
              className="cw-record-payment cw-record-payment--ghost"
              type="button"
              onClick={() => {
                if (!caseId) return
                window.open(`/api/recovery/case/${encodeURIComponent(caseId)}/recovery-case?export=json`, '_blank')
              }}
            >
              <Download size={14} /> JSON
            </button>
          </div>
        </div>
      ) : null}

      <div className="rc-esc-actions">
        {!prepared?.snapshot ? (
          <button
            className="cw-record-payment"
            type="button"
            disabled={acting !== null}
            onClick={() => void act('prepare', { override: false }, 'Recovery case prepared')}
          >
            {acting === 'prepare' ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />}
            Prepare recovery case
          </button>
        ) : null}

        <div className="rc-esc-row">
          <button
            className="cw-record-payment"
            type="button"
            disabled={acting !== null}
            onClick={() => void decide('authorize')}
          >
            {acting === 'decide:authorize' ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />}
            Authorize escalation
          </button>
        </div>

        <div className="rc-esc-row rc-esc-row--split">
          <button
            className="cw-record-payment cw-record-payment--ghost"
            type="button"
            disabled={acting !== null}
            onClick={() => void decide('offer_plan')}
          >
            {acting === 'decide:offer_plan' ? <Loader2 className="spin" size={14} /> : <Pause size={14} />}
            Offer plan
          </button>
          <button
            className="cw-record-payment cw-record-payment--ghost"
            type="button"
            disabled={acting !== null}
            onClick={() => void decide('pause')}
          >
            {acting === 'decide:pause' ? <Loader2 className="spin" size={14} /> : <Pause size={14} />}
            Pause
          </button>
          <button
            className="cw-record-payment cw-record-payment--ghost"
            type="button"
            disabled={acting !== null}
            onClick={() => void decide('decline')}
          >
            {acting === 'decide:decline' ? <Loader2 className="spin" size={14} /> : <X size={14} />}
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}