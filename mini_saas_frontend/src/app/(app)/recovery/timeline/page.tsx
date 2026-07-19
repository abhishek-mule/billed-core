'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, MessageSquare, Clock, CheckCircle2, ArrowLeft, Loader2,
  AlertTriangle, HeartHandshake, Bell, Send, CircleDashed, XCircle, MousePointerClick,
} from 'lucide-react'
import '@/styles/recovery-center.css'

type Item = { at: string; source: string; type: string; label: string; detail: string }
type Day = { date: string; items: Item[] }

const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function iconFor(type: string) {
  switch (type) {
    case 'created': return <CircleDashed size={14} />
    case 'completed': return <CheckCircle2 size={14} />
    case 'sent': return <Send size={14} />
    case 'delivered': return <CheckCircle2 size={14} />
    case 'read': return <MousePointerClick size={14} />
    case 'clicked': return <MousePointerClick size={14} />
    case 'failed': return <XCircle size={14} />
    case 'promise_made': return <HeartHandshake size={14} />
    case 'payment_received': return <CheckCircle2 size={14} />
    case 'call': return <Phone size={14} />
    case 'reminder': return <MessageSquare size={14} />
    default: return <Bell size={14} />
  }
}

function toneFor(type: string) {
  if (type === 'read' || type === 'delivered' || type === 'completed' || type === 'payment_received') return 'ok'
  if (type === 'failed') return 'bad'
  if (type === 'promise_made') return 'info'
  return 'neutral'
}

export default function TimelinePage() {
  const router = useRouter()
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('customerId')
    setCustomerId(id)
    if (!id) { setError('No customer selected'); setLoading(false); return }
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/recovery/timeline?customerId=${encodeURIComponent(id)}`, { credentials: 'include' })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (active) { setDays(json.days); setTotal(json.total) }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back"><ArrowLeft size={16} /></button>
        <div className="cw-head-main">
          <h1 className="cw-name">Timeline</h1>
          {customerId ? <Link className="cw-phone" href={`/recovery/customer/${encodeURIComponent(customerId)}`}>Back to workspace</Link> : null}
        </div>
      </header>

      {loading ? (
        <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading timeline…</span></div>
      ) : error ? (
        <div className="rc-loading"><span>{error}</span></div>
      ) : total === 0 ? (
        <div className="rc-empty"><Clock size={18} /><span>No activity recorded for this customer.</span></div>
      ) : (
        days.map((day) => (
          <section key={day.date} className="rc-block">
            <div className="tl-day">{fmtDate(day.date)}</div>
            <div className="rc-timeline">
              {day.items.map((it, i) => (
                <div key={i} className={`rc-tl-item tl-item--${toneFor(it.type)}`}>
                  <div className="rc-tl-dot" />
                  <div className="rc-tl-body">
                    <span className="rc-tl-text">
                      <span className="tl-ic">{iconFor(it.type)}</span>
                      {it.label}{it.detail ? <span className="rc-tl-detail"> · {it.detail}</span> : null}
                    </span>
                  </div>
                  <div className="rc-tl-time">{fmtTime(it.at)}</div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
