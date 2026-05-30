'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, CheckCircle2, Clock, ArrowRight, Banknote, Smartphone, CreditCard, Users, IndianRupee, AlertCircle } from 'lucide-react'
import { formatINR, cn } from '@/lib/utils'
import { AttentionFeed } from '@/components/attention-feed/AttentionFeed'

type QueueData = {
  collectibleToday: number
  activeCaseCount: number
  overdueCaseCount: number
  doThisNow: {
    caseId: string
    customerId: string
    customerName: string
    customerPhone: string
    amount: number
    overdue: number
    action: string
    recoveryState: string
    engagementState: string
  } | null
  exceptions: Array<{
    caseId: string
    customerId: string
    customerName: string
    amount: number
    reason: string
    type: string
  }>
  recentPayments: Array<{
    id: string
    amount: number
    invoiceId: string
    method: string
    createdAt: string
  }>
  totalOverdue: number
  totalOutstanding: number
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const t = new Date()
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear()
}

const methodIcons: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  upi: <Smartphone className="h-4 w-4" />,
  razorpay_test: <CreditCard className="h-4 w-4" />,
}

const actionLabels: Record<string, string> = {
  send_reminder: 'Send Reminder',
  call: 'Call Customer',
  escalate: 'Escalate',
  wait: 'Wait',
  monitor: 'Monitor',
}

export function QueueDashboard() {
  const router = useRouter()
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recovery/queue', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 401) { router.push('/auth'); return }
        throw new Error(`Failed to load: ${res.status}`)
      }
      setData(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to load recovery data')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
        <div className="h-24 bg-muted animate-pulse rounded-xl" />
        <div className="h-24 bg-muted animate-pulse rounded-xl" />
        <div className="h-24 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button onClick={fetchQueue} className="text-sm font-medium text-primary hover:underline">
          Try again
        </button>
      </div>
    )
  }

  if (!data || data.activeCaseCount === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-12 text-center bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-lg font-semibold text-green-700">All caught up!</p>
          <p className="text-sm text-green-600 mt-1">No outstanding cases. You&apos;re on top of your receivables.</p>
        </div>
        <AttentionFeed />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Collectible Today — Reassure */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Collectible Today</p>
        <p className="text-3xl font-bold text-blue-900 mt-1">{formatINR(data.collectibleToday)}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-blue-700">
          <span>{data.activeCaseCount} active {data.activeCaseCount === 1 ? 'case' : 'cases'}</span>
          {data.overdueCaseCount > 0 && (
            <>
              <span className="text-blue-300">·</span>
              <span className="text-amber-600 font-medium">{data.overdueCaseCount} overdue</span>
            </>
          )}
        </div>
      </div>

      {/* Do This Now — Direct */}
      {data.doThisNow && (
        <button
          onClick={() => router.push(`/cashflow?q=${encodeURIComponent(data.doThisNow!.customerName)}`)}
          className="w-full text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-amber-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Do This Now</p>
            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{data.doThisNow.customerName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.doThisNow.customerPhone}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900">{formatINR(data.doThisNow.amount)}</p>
              {data.doThisNow.overdue > 0 && (
                <p className="text-xs text-red-600 font-medium">{formatINR(data.doThisNow.overdue)} overdue</p>
              )}
            </div>
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
            <Clock className="h-3.5 w-3.5" />
            {actionLabels[data.doThisNow.action] || 'Send Reminder'}
          </div>
        </button>
      )}

      {/* Money Came In — Reward */}
      {data.recentPayments.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wider mb-3">Money Came In</p>
          <div className="space-y-2">
            {data.recentPayments.slice(0, 5).map((pmt) => {
              const label = isToday(pmt.createdAt) ? 'Today' : isYesterday(pmt.createdAt) ? 'Yesterday' : formatTimeAgo(pmt.createdAt)
              return (
                <div key={pmt.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {methodIcons[pmt.method] || <CreditCard className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{formatINR(pmt.amount)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Exceptions — Escalate */}
      {data.exceptions.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase tracking-wider">
              Needs Decision ({data.exceptions.length})
            </p>
          </div>
          <div className="space-y-2">
            {data.exceptions.map((ex) => (
              <button
                key={ex.caseId}
                onClick={() => router.push(`/cashflow?q=${encodeURIComponent(ex.customerName)}`)}
                className="w-full text-left flex items-center justify-between py-2 px-3 rounded-lg hover:bg-red-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{ex.customerName}</p>
                  <p className="text-xs text-muted-foreground">{ex.reason}</p>
                </div>
                <span className="text-sm font-semibold text-red-600">{formatINR(ex.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Situation Feed — supplementary */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Insights</p>
        <AttentionFeed />
      </div>
    </div>
  )
}
