'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'

type ActionType = 'escalate' | 'send_reminder' | 'call' | 'wait' | 'monitor'

interface SituationCardProps {
  situation: {
    id: string
    situation_type: string
    situation_state: string
    headline: string
    narrative: string
    recommended_action: { type: string; label: string; payload?: any }
    resolution_condition: { type: string; description: string }
    priority_score: number
    display_order: number
    decision_window_start: string | null
    decision_window_end: string | null
    first_seen_at: string
    last_seen_at: string
  }
  onAction: (id: string, action: string) => void
  acting: boolean
  drillDownHref?: string
}

const actionConfig: Record<ActionType, { color: string; bg: string; label: string }> = {
  escalate:       { color: 'text-red-600',       bg: 'bg-red-50 border-red-200',        label: 'Escalate' },
  send_reminder:  { color: 'text-amber-600',     bg: 'bg-amber-50 border-amber-200',    label: 'Send Reminder' },
  call:           { color: 'text-orange-600',    bg: 'bg-orange-50 border-orange-200',  label: 'Call Customer' },
  wait:           { color: 'text-blue-600',      bg: 'bg-blue-50 border-blue-200',      label: 'Wait' },
  monitor:        { color: 'text-gray-500',      bg: 'bg-gray-50 border-gray-200',      label: 'Monitor' },
}

function getActionConfig(type: string) {
  return actionConfig[type as ActionType] || actionConfig.monitor
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function SituationCard({ situation, onAction, acting, drillDownHref }: SituationCardProps) {
  const action = getActionConfig(situation.recommended_action.type)
  const isDismissed = situation.situation_state !== 'active'

  if (isDismissed) return null

  const total = extractAmount(situation.headline)
  const showUrgency = situation.priority_score >= 30

  return (
    <div className={cn('rounded-2xl border p-5 transition-all', action.bg)}>
      <div className="flex items-start gap-4">
        <div className={cn('mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold', action.color.replace('text-', 'bg-').replace('600', '100'), action.color)}>
          {total > 0 ? '₹' : '!'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold leading-snug">{situation.headline}</h3>
            {showUrgency && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                HIGH
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{situation.narrative}</p>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{formatTimeAgo(situation.last_seen_at)}</span>
            {situation.decision_window_end && (
              <>
                <span>·</span>
                <span>Act by {formatTimeAgo(situation.decision_window_end)}</span>
              </>
            )}
          </div>

          {situation.resolution_condition.description && (
            <p className="mt-1 text-[11px] text-muted-foreground/60 italic">
              ✓ {situation.resolution_condition.description}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            {drillDownHref ? (
              <Link
                href={drillDownHref}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95',
                  action.color.replace('text-', 'bg-').replace('600', '100'),
                  action.color,
                )}
              >
                {situation.recommended_action.label || action.label}
              </Link>
            ) : (
              <button
                onClick={() => onAction(situation.id, situation.recommended_action.type)}
                disabled={acting}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-50',
                  action.color.replace('text-', 'bg-').replace('600', '100'),
                  action.color,
                )}
              >
                {acting ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : null}
                {situation.recommended_action.label || action.label}
              </button>
            )}

            <button
              onClick={() => onAction(situation.id, 'seen')}
              disabled={acting}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-black/5 transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function extractAmount(headline: string): number {
  const match = headline.match(/₹([\d,]+)/)
  if (match) return parseInt(match[1].replace(/,/g, ''), 10)
  return 0
}
