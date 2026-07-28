"use client"

import { useEffect, useState } from "react"
import { Send, Bell, Phone, HeartHandshake, Clock, CheckCircle2, Eye, UserX } from "lucide-react"
import { computeNextAction, type NextAction as NextActionType } from "@/lib/recovery/recommendation"
import type { RecoveryActivity } from "@/lib/billzo/types"

interface NextBestActionProps {
  invoiceId: string
  outstanding?: number
  promiseDate?: string | null
  customerPhone?: string
  compact?: boolean
  onCall?: () => void
}

const LEVEL_COLORS: Record<string, string> = {
  critical: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950/40',
  high: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-950/40',
  medium: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-950/40',
  low: 'text-muted-foreground bg-secondary',
  done: 'text-success bg-success-soft',
}

const ACTION_ICONS: Record<string, any> = {
  send_invoice: Send,
  send_reminder: Bell,
  call: Phone,
  follow_up_promise: HeartHandshake,
  update_contact: UserX,
  wait: Clock,
  paid: CheckCircle2,
  review: Eye,
}

export function NextBestAction({ invoiceId, outstanding, promiseDate, customerPhone, compact, onCall }: NextBestActionProps) {
  const [activities, setActivities] = useState<RecoveryActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!invoiceId) { setLoading(false); return }
    const load = async () => {
      try {
        const res = await window.fetch(`/api/recovery/activities?invoiceId=${encodeURIComponent(invoiceId)}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setActivities(data.activities || [])
        }
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [invoiceId])

  if (loading) return null

  const recommendation = computeNextAction(activities, promiseDate, outstanding)
  const Icon = ACTION_ICONS[recommendation.action] || Clock
  const colorClass = LEVEL_COLORS[recommendation.level] || 'text-muted-foreground bg-secondary'

  const handleClick = () => {
    if (recommendation.action === 'call' && onCall) {
      onCall()
    }
  }

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${colorClass}`}>
        <Icon className="w-3 h-3" />
        <span>{recommendation.label}</span>
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border p-3 ${recommendation.level === 'done' ? 'border-success/30' : 'border-border'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{recommendation.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium">Reason:</span> {recommendation.description}</p>
        </div>
        {recommendation.action === 'call' && customerPhone && (
          <button
            onClick={handleClick}
            className="shrink-0 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Call
          </button>
        )}
        {recommendation.action === 'update_contact' && (
          <button
            className="shrink-0 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Update
          </button>
        )}
      </div>
    </div>
  )
}
