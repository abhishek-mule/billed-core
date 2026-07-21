'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Phone, MessageSquare, HeartHandshake, Clock, CheckCircle2, ChevronDown,
  Loader2, ArrowRight,
} from 'lucide-react'
import '@/styles/recovery-center.css'

type Card = {
  actionId: string; customerId: string; customerName: string; phone: string; tier: string
  outstanding: number; state: string | null; brokenPromises: number
  actionType: string; channel: string | null; templateName: string | null
  scheduledAt: string; completedAt: string | null; reason: string; kind: string
}
type Section = { items: Card[]; count: number; total: number }

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function sectionIcon(kind: string) {
  return kind === 'call' ? <Phone size={16} /> : kind === 'reminder' ? <MessageSquare size={16} /> : kind === 'promise' ? <HeartHandshake size={16} /> : kind === 'completed' ? <CheckCircle2 size={16} /> : <Clock size={16} />
}

const SECTIONS = [
  { key: 'needsCall', label: 'Needs Call', cls: 'red' },
  { key: 'sendReminder', label: 'Send Reminder', cls: 'blue' },
  { key: 'promiseFollowup', label: 'Promise Follow-up', cls: 'orange' },
  { key: 'scheduledLater', label: 'Scheduled Later Today', cls: 'muted' },
  { key: 'completedToday', label: 'Completed Today', cls: 'green' },
] as const

export default function WorkQueuePage() {
  const router = useRouter()
  const [data, setData] = useState<Record<string, Section> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({ needsCall: true, sendReminder: true, promiseFollowup: true, scheduledLater: false, completedToday: false })
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/recovery/work-queue', { credentials: 'include' })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (active) setData(json)
      } catch (e: any) {
        if (active) setError(e.message || 'Failed')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  if (loading) return <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading your work queue…</span></div>
  if (error || !data) return <div className="rc-loading"><span>{error ?? 'Failed'}</span></div>

  const totalOpen = (data.needsCall.count + data.sendReminder.count + data.promiseFollowup.count)

  return (
    <div className="rc-page">
      <header className="rc-header">
        <div>
          <h1 className="rc-greeting">Recovery Queue</h1>
          <p className="rc-sub">
            {totalOpen > 0 ? `${totalOpen} action${totalOpen > 1 ? 's' : ''} waiting · ${fmt(data.needsCall.total + data.sendReminder.total + data.promiseFollowup.total)} to recover` : 'All caught up for now'}
          </p>
        </div>
      </header>

      {SECTIONS.map((s) => {
        const sec = data[s.key]
        if (!sec || sec.count === 0) return null
        const isOpen = open[s.key]
        return (
          <section key={s.key} className="wq-section">
            <button className="wq-head" onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
              <span className={`wq-head-ic wq-ic--${s.cls}`}>{sectionIcon(s.key)}</span>
              <span className="wq-head-label">{s.label}</span>
              <span className="wq-head-count">{sec.count}</span>
              <span className="wq-head-total">{fmt(sec.total)}</span>
              <ChevronDown size={16} className={`wq-chev ${isOpen ? 'wq-chev--open' : ''}`} />
            </button>

            {isOpen ? (
              <div className="wq-list">
                {sec.items.map((c) => {
                  const isExp = expanded === c.actionId
                  return (
                    <div key={c.actionId} className={`wq-card wq-card--${s.cls} ${isExp ? 'wq-card--exp' : ''}`}>
                      <button className="wq-card-main" onClick={() => setExpanded(isExp ? null : c.actionId)}>
                        <div className="wq-card-top">
                          <span className="wq-cust">{c.customerName}</span>
                          <span className="wq-amt">{fmt(c.outstanding)}</span>
                        </div>
                        <div className="wq-reason">{c.reason}</div>
                        {c.kind === 'scheduled' ? <div className="wq-sub">{fmtTime(c.scheduledAt)} · {c.actionType === 'call' ? 'Call' : 'Reminder'}</div> : null}
                      </button>

                      {isExp ? (
                        <div className="wq-expand">
                          <div className="wq-expand-row"><span>Action</span><span>{c.actionType === 'call' ? 'Phone Call' : c.actionType === 'reminder' ? 'WhatsApp Reminder' : c.actionType}</span></div>
                          <div className="wq-expand-row"><span>State</span><span>{c.state ?? '—'}</span></div>
                          {c.brokenPromises > 0 ? <div className="wq-expand-row"><span>Broken promises</span><span>{c.brokenPromises}</span></div> : null}
                          <div className="wq-expand-actions">
                            {c.kind === 'call' ? (
                              <a href={`tel:${c.phone}`} className="rc-btn rc-btn--primary"><Phone size={14} /> Call</a>
                            ) : c.kind === 'reminder' ? (
                              <button className="rc-btn rc-btn--primary"><MessageSquare size={14} /> Send</button>
                            ) : c.kind === 'promise' ? (
                              <button className="rc-btn rc-btn--primary"><HeartHandshake size={14} /> Follow Up</button>
                            ) : null}
                            <Link href={`/recovery/customer/${c.customerId}`} className="rc-btn rc-btn--ghost">
                              Open Workspace <ArrowRight size={14} />
                            </Link>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}

      {totalOpen === 0 && data.completedToday.count === 0 ? (
        <div className="rc-empty"><CheckCircle2 size={18} /><span>Nothing in the queue. Enjoy the calm.</span></div>
      ) : null}
    </div>
  )
}
