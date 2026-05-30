'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, CheckCircle2, Phone, Send, Clock, ChevronDown, ChevronUp, IndianRupee, Banknote, Smartphone, CreditCard, AlertCircle, MoreHorizontal, ChevronRight } from 'lucide-react'
import { formatINR } from '@/lib/utils'
import { AttentionFeed } from '@/components/attention-feed/AttentionFeed'
import type { QueueItem, QueueSummary } from '@/lib/recovery/queue-service'

type QueueResponse = {
  items: QueueItem[]
  summary: QueueSummary
  recoveredToday: number
}

const actionLabels: Record<string, string> = {
  send_reminder: 'Send Reminder',
  call: 'Call Customer',
  mark_promise: 'Mark Promise',
  record_payment: 'Record Payment',
  payment_reported: 'Payment Reported',
  snooze: 'Snooze 3d',
  mark_disputed: 'Dispute',
  mark_resolved: 'Mark Resolved',
  wait: 'Wait',
}

const actionIcons: Record<string, React.ReactNode> = {
  send_reminder: <Send className="h-3.5 w-3.5" />,
  call: <Phone className="h-3.5 w-3.5" />,
  record_payment: <IndianRupee className="h-3.5 w-3.5" />,
}

const stateBadge: Record<string, string> = {
  overdue: 'bg-amber-100 text-amber-700',
  active: 'bg-blue-100 text-blue-700',
  partial_payment: 'bg-purple-100 text-purple-700',
  promised: 'bg-green-100 text-green-700',
  disputed: 'bg-red-100 text-red-700',
}

export function QueueActionList() {
  const router = useRouter()
  const [data, setData] = useState<QueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingCase, setActingCase] = useState<string | null>(null)
  const [showInsights, setShowInsights] = useState(false)
  const [showMenu, setShowMenu] = useState<string | null>(null)
  const [recordingPayment, setRecordingPayment] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [actionError, setActionError] = useState<string | null>(null)

  const dashboardOpenedAt = useCallback(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('bz_ttfa_started')) {
      sessionStorage.setItem('bz_ttfa_started', Date.now().toString())
    }
  }, [])

  useEffect(() => { dashboardOpenedAt() }, [dashboardOpenedAt])

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
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  const performAction = useCallback(async (caseId: string, action: string, actionPayload?: Record<string, any>) => {
    setActingCase(caseId)
    setActionError(null)

    const ttfaStart = sessionStorage.getItem('bz_ttfa_started')
    const ttfa = ttfaStart ? Date.now() - parseInt(ttfaStart) : undefined

    try {
      const res = await fetch('/api/recovery/queue/actions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          action,
          payload: actionPayload,
          ttfa,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Action failed')
      }

      sessionStorage.removeItem('bz_ttfa_started')
      setShowMenu(null)
      setRecordingPayment(null)
      // Refetch queue to get updated state
      fetchQueue()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActingCase(null)
    }
  }, [fetchQueue])

  const handlePrimaryAction = useCallback((item: QueueItem) => {
    const action = item.recommendedAction.id

    if (action === 'record_payment') {
      setRecordingPayment(item.caseId)
      setPaymentAmount(item.amount > 0 ? item.amount.toString() : '')
      setPaymentMethod('cash')
      return
    }

    if (action === 'call') {
      if (item.customer.phone) {
        window.open(`tel:${item.customer.phone}`, '_self')
      }
      performAction(item.caseId, 'call')
      return
    }

    performAction(item.caseId, action)
  }, [performAction])

  const handleRecordPayment = useCallback((caseId: string) => {
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) return
    performAction(caseId, 'record_payment', { amount, method: paymentMethod })
  }, [paymentAmount, paymentMethod, performAction])

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-16 bg-muted animate-pulse rounded-xl" />
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button onClick={fetchQueue} className="text-sm font-medium text-primary hover:underline">Try again</button>
      </div>
    )
  }

  // ── Empty state ──
  if (!data || data.items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-12 text-center bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-lg font-semibold text-green-700">All caught up!</p>
          <p className="text-sm text-green-600 mt-1">No outstanding cases. You&apos;re on top of your receivables.</p>
        </div>
        <InsightsAccordion show={showInsights} onToggle={() => setShowInsights(!showInsights)} />
      </div>
    )
  }

  const { items, summary, recoveredToday } = data

  return (
    <div className="space-y-3">
      {/* TODAY summary bar */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-5 py-4">
        <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest">TODAY</p>
        <p className="text-2xl font-bold text-blue-900 mt-0.5">{formatINR(summary.collectibleToday)}</p>
        <p className="text-xs text-blue-600 mt-0.5">
          collectible
          {recoveredToday > 0 && <span className="text-green-600 font-medium"> · {formatINR(recoveredToday)} recovered</span>}
        </p>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {actionError}
        </div>
      )}

      {/* Queue items as ranked list */}
      <ol className="space-y-1.5">
        {items.map((item) => {
          const action = item.recommendedAction
          const isDisabled = action.id === 'wait'
          const isActing = actingCase === item.caseId
          const isRecording = recordingPayment === item.caseId
          const isMenuOpen = showMenu === item.caseId
          const badgeClass = stateBadge[item.recoveryState] || 'bg-gray-100 text-gray-700'

          return (
            <li key={item.caseId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Main row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Rank */}
                <span className="text-xs font-bold text-muted-foreground w-5 text-right flex-shrink-0">
                  #{item.rank}
                </span>

                {/* Customer + amount */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{item.customer.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeClass}`}>
                      {item.recoveryState.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-gray-900">{formatINR(item.amount)}</span>
                    {item.overdue > 0 && (
                      <span className="text-xs text-red-600 font-medium">{formatINR(item.overdue)} overdue</span>
                    )}
                    {item.promiseStatus === 'broken' && (
                      <span className="text-xs text-red-500">Promise broken</span>
                    )}
                    {item.engagementState === 'ghosting' && (
                      <span className="text-xs text-orange-500">Ghosting</span>
                    )}
                  </div>
                </div>

                {/* Primary action button */}
                {!isRecording && (
                  <button
                    onClick={() => handlePrimaryAction(item)}
                    disabled={isDisabled || isActing}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                      ${isDisabled ? 'bg-gray-50 text-gray-400 cursor-default' :
                        action.id === 'send_reminder' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200' :
                        action.id === 'call' ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 active:bg-orange-200' :
                        action.id === 'record_payment' ? 'bg-green-50 text-green-700 hover:bg-green-100 active:bg-green-200' :
                        action.id === 'mark_resolved' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200' :
                        'bg-gray-50 text-gray-700 hover:bg-gray-100'}
                    `}
                  >
                    {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : actionIcons[action.id]}
                    {actionLabels[action.id] || action.id}
                  </button>
                )}

                {/* Secondary menu toggle */}
                {item.secondaryActions.length > 0 && !isRecording && (
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu(isMenuOpen ? null : item.caseId)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMenu(null)} />
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                          {item.secondaryActions.map(sa => (
                            <button
                              key={sa.id}
                              onClick={() => {
                                if (sa.id === 'call' && item.customer.phone) {
                                  window.open(`tel:${item.customer.phone}`, '_self')
                                }
                                performAction(item.caseId, sa.id)
                              }}
                              disabled={actingCase === item.caseId}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {sa.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Inline Record Payment form */}
              {isRecording && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        placeholder="Amount"
                        className="w-full pl-6 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
                        autoFocus
                      />
                    </div>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRecordPayment(item.caseId)}
                      disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || actingCase === item.caseId}
                      className="flex-1 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {actingCase === item.caseId ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Record Payment'}
                    </button>
                    <button
                      onClick={() => { setRecordingPayment(null); setActionError(null) }}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {/* Recovered today footer */}
      {recoveredToday > 0 && (
        <div className="text-center py-2">
          <p className="text-xs text-green-600 font-medium">
            {formatINR(recoveredToday)} recovered today
          </p>
        </div>
      )}

      {/* Insights accordion */}
      <InsightsAccordion show={showInsights} onToggle={() => setShowInsights(!showInsights)} />
    </div>
  )
}

function InsightsAccordion({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <details open={show} className="group">
      <summary
        onClick={(e) => { e.preventDefault(); onToggle() }}
        className="flex items-center justify-between py-2 px-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="font-medium uppercase tracking-wider">
          {show ? 'Hide Insights' : 'Show Insights'}
        </span>
        {show ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </summary>
      {show && (
        <div className="pt-2">
          <AttentionFeed />
        </div>
      )}
    </details>
  )
}
