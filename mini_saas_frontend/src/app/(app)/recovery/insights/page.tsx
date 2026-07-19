'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, TrendingUp, CheckCircle2, MessageSquare, Phone, HeartHandshake, Sparkles } from 'lucide-react'
import '@/styles/recovery-center.css'

type Analytics = {
  reminders: { sent: number; paid: number; promised: number; ignored: number; recoveryRate: number; avgDaysToPayment: number | null }
  phoneCalls: { sent: number; paid: number; promised: number; ignored: number; recoveryRate: number; avgDaysToPayment: number | null }
  promises: { total: number; kept: number; broken: number; keptRate: number; avgDaysLate: number | null }
  whatsapp: { delivered: number; read: number; failed: number; ignored: number; readRate: number }
}

function Insight({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="ri-insight">
      <span className="ri-insight-ic">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

export default function RecoveryInsightsPage() {
  const router = useRouter()
  const [data, setData] = useState<{ windowDays: number; analytics: Analytics } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/recovery/outcomes?windowDays=30', { credentials: 'include' })
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

  if (loading) return <div className="rc-loading"><Loader2 className="spin" size={22} /><span>Loading insights…</span></div>
  if (error || !data) return <div className="rc-loading"><span>{error ?? 'Failed'}</span></div>

  const a = data.analytics
  const best = a.phoneCalls.recoveryRate >= a.reminders.recoveryRate ? 'phone calls' : 'reminders'

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back"><ArrowLeft size={16} /></button>
        <div className="cw-head-main">
          <h1 className="cw-name">Recovery Insights</h1>
          <span className="cw-phone">Last {data.windowDays} days · measured from actions</span>
        </div>
      </header>

      {/* Text-first insights */}
      <section className="rc-block">
        <div className="rc-block-head"><Sparkles size={14} /><h2>What's working</h2></div>
        <div className="ri-list">
          <Insight icon={<Phone size={14} />} text={`${best === 'phone calls' ? 'Phone calls' : 'Reminders'} perform best — ${Math.max(a.phoneCalls.recoveryRate, a.reminders.recoveryRate)}% recovery.`} />
          {a.promises.total > 0 ? (
            <Insight icon={<HeartHandshake size={14} />} text={`${a.promises.keptRate}% of promises are kept${a.promises.avgDaysLate != null ? ` (avg ${a.promises.avgDaysLate}d late when broken)` : ''}.`} />
          ) : null}
          {a.whatsapp.readRate > 0 ? (
            <Insight icon={<MessageSquare size={14} />} text={`Read reminders pay in ${a.reminders.avgDaysToPayment ?? '—'} days on average.`} />
          ) : null}
          {a.phoneCalls.recoveryRate > a.reminders.recoveryRate ? (
            <Insight icon={<CheckCircle2 size={14} />} text="Broken promises usually require a call." />
          ) : null}
        </div>
      </section>

      {/* Recovery effectiveness (text, no charts) */}
      <section className="rc-block">
        <div className="rc-block-head"><TrendingUp size={14} /><h2>Recovery Effectiveness</h2></div>
        <div className="ri-stats">
          <div className="ri-stat">
            <div className="ri-stat-ic"><MessageSquare size={15} /></div>
            <div className="ri-stat-body">
              <span className="ri-stat-lbl">Reminders</span>
              <span className="ri-stat-num">{a.reminders.sent} sent · {a.reminders.paid} paid · <b>{a.reminders.recoveryRate}%</b></span>
              {a.reminders.avgDaysToPayment != null ? <span className="ri-stat-sub">Avg payment {a.reminders.avgDaysToPayment}d after</span> : null}
            </div>
          </div>
          <div className="ri-stat">
            <div className="ri-stat-ic"><Phone size={15} /></div>
            <div className="ri-stat-body">
              <span className="ri-stat-lbl">Phone Calls</span>
              <span className="ri-stat-num">{a.phoneCalls.sent} calls · {a.phoneCalls.paid} paid · <b>{a.phoneCalls.recoveryRate}%</b></span>
              {a.phoneCalls.avgDaysToPayment != null ? <span className="ri-stat-sub">Avg payment {a.phoneCalls.avgDaysToPayment}d after</span> : null}
            </div>
          </div>
          <div className="ri-stat">
            <div className="ri-stat-ic"><HeartHandshake size={15} /></div>
            <div className="ri-stat-body">
              <span className="ri-stat-lbl">Promises</span>
              <span className="ri-stat-num">{a.promises.total} made · {a.promises.kept} kept · <b>{a.promises.keptRate}%</b></span>
            </div>
          </div>
          <div className="ri-stat">
            <div className="ri-stat-ic"><MessageSquare size={15} /></div>
            <div className="ri-stat-body">
              <span className="ri-stat-lbl">WhatsApp</span>
              <span className="ri-stat-num">{a.whatsapp.delivered} delivered · {a.whatsapp.read} read · <b>{a.whatsapp.readRate}%</b></span>
              {a.whatsapp.failed > 0 ? <span className="ri-stat-sub">{a.whatsapp.failed} failed delivery</span> : null}
            </div>
          </div>
        </div>
      </section>

      <p className="ri-note">
        Metrics show what happened <b>after</b> each action. They don't assign exclusive credit — a payment often follows several touches.
      </p>

      <Link href="/recovery" className="rc-btn rc-btn--ghost" style={{ justifyContent: 'center' }}>Back to Recovery Center</Link>
    </div>
  )
}
