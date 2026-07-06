import { cn } from '@/lib/utils'
import { MerchantLanguage } from '@billzo/shared'
import { Clock, Hand, Bell, PauseCircle, CheckCircle2, AlertCircle, ChevronRight, HelpCircle } from 'lucide-react'

export type RecoveryPlanMode = 'scheduled_reminder' | 'promise' | 'auto_recovery' | 'paused' | 'none'

export interface RecoveryPlanAction {
  type: string
  at: string | null
  isAutomatic: boolean
  reason: string
}

export interface RecoveryPlanHistoryEvent {
  date: string
  event: string
  detail: string
  reason?: string
  type?: 'reminder' | 'promise' | 'payment' | 'system' | 'override'
}

export interface RecoveryPlanData {
  mode: RecoveryPlanMode
  modeLabel: string
  executionAt: string | null
  afterExecution: string
  status: 'active' | 'waiting' | 'paused' | 'completed'
  nextAction: RecoveryPlanAction
  history: RecoveryPlanHistoryEvent[]
}

const MODE_CONFIG: Record<RecoveryPlanMode, { icon: any; color: string; bg: string }> = {
  scheduled_reminder: { icon: Bell, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  promise: { icon: Hand, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  auto_recovery: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  paused: { icon: PauseCircle, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
  none: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted' },
}

const STATUS_LABELS: Record<string, string> = {
  active: MerchantLanguage.state.active,
  waiting: MerchantLanguage.state.waiting,
  paused: MerchantLanguage.state.paused,
  completed: MerchantLanguage.state.completed,
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-600',
  waiting: 'text-amber-600',
  paused: 'text-orange-600',
  completed: 'text-muted-foreground',
}

export function RecoveryPlanCard({
  plan,
  className,
  onEdit,
  onPause,
  onCancel,
}: {
  plan: RecoveryPlanData
  className?: string
  onEdit?: () => void
  onPause?: () => void
  onCancel?: () => void
}) {
  const cfg = MODE_CONFIG[plan.mode]
  const Icon = cfg.icon

  return (
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden', className)}>
      {/* Header: Mode */}
      <div className={cn('p-4 flex items-center gap-3', cfg.bg)}>
        <Icon size={20} className={cfg.color} />
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today</p>
          <p className="font-semibold text-sm mt-0.5">{plan.modeLabel}</p>
        </div>
        <span className={cn('text-xs font-semibold', STATUS_COLORS[plan.status])}>
          {STATUS_LABELS[plan.status]}
        </span>
      </div>

      {/* Body: Execution + Next Action */}
      <div className="p-4 space-y-3">
        {/* Execution */}
        {plan.executionAt && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Scheduled</span>
            <span className="font-medium">
              {new Date(plan.executionAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short',
              })}
              {' '}
              {new Date(plan.executionAt).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* After Execution */}
        {plan.afterExecution && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">After Execution</span>
            <span className="font-medium text-xs">{plan.afterExecution}</span>
          </div>
        )}

        <div className="h-px bg-border" />

        {/* Next Action */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Next Action</p>
          <div className="flex items-start gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full mt-1.5 shrink-0',
              plan.nextAction.at ? 'bg-primary' : 'bg-muted-foreground',
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{plan.nextAction.type}</p>
              {plan.nextAction.at ? (
                <p className="text-xs text-muted-foreground">
                  {new Date(plan.nextAction.at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short',
                  })}
                  {' '}
                  {new Date(plan.nextAction.at).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {' '}
                  &middot; {plan.nextAction.isAutomatic ? MerchantLanguage.common.automatic : MerchantLanguage.common.manual}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{plan.nextAction.reason}</p>
              )}
            </div>
          </div>
        </div>

        {/* Reason */}
        {plan.nextAction.reason && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Reason </span>
            {plan.nextAction.reason}
          </div>
        )}

        {/* History (collapsed, max 3 recent) */}
        {plan.history.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
              <div className="space-y-2">
                {plan.history.slice(-3).reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                      h.type === 'payment' ? 'bg-emerald-500' :
                      h.type === 'promise' ? 'bg-amber-500' :
                      h.type === 'reminder' ? 'bg-blue-500' :
                      h.type === 'override' ? 'bg-purple-500' :
                      'bg-muted-foreground',
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{h.event}</span>
                        <span className="text-muted-foreground ml-2">
                          {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">{h.detail}</p>
                      {h.reason && (
                        <p className="text-muted-foreground/70 mt-0.5 italic">&ldquo;{h.reason}&rdquo;</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {(onEdit || onPause || onCancel) && (
        <div className="border-t border-border px-4 py-3 flex gap-2">
          {onEdit && (
            <button onClick={onEdit} className="text-xs font-medium text-primary hover:underline">
              {MerchantLanguage.action.change}
            </button>
          )}
          {onPause && (
            <button onClick={onPause} className="text-xs font-medium text-orange-600 hover:underline">
              {MerchantLanguage.common.pause}
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className="text-xs font-medium text-destructive hover:underline">
              {MerchantLanguage.action.cancel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
