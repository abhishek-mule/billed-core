import type { PlanType } from '@/lib/billzo/report-engine'

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  highlight?: string
}

export function MetricCard({ label, value, sub, icon, highlight }: MetricCardProps) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {highlight && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {highlight}
        </div>
      )}
    </div>
  )
}

interface ActionCardProps {
  title: string
  amount: number
  count: number
  color: string
  actionLabel: string
  onAction: () => void
}

export function ActionCard({ title, amount, count, color, actionLabel, onAction }: ActionCardProps) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-2xl font-black">{amount}</div>
          <div className="mt-1 text-xs opacity-70">{count} invoice{count !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={onAction} className="rounded-lg bg-white px-3 py-2 text-xs font-bold shadow-sm">
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

interface PaywallTeaserProps {
  plan: PlanType
}

export function PaywallTeaser({ plan }: PaywallTeaserProps) {
  if (plan !== 'starter') return null
  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-center">
      <p className="text-sm font-semibold text-yellow-800">
        Upgrade to Pro to see full history &amp; advanced analytics
      </p>
      <button className="mt-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-bold text-white">
        Upgrade to Pro ₹299/mo
      </button>
    </div>
  )
}