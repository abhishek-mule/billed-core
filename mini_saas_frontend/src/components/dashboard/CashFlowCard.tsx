import { TrendingUp, ArrowUpRight, ArrowDownRight, Wallet, CreditCard } from 'lucide-react'
import { formatINR } from '@/lib/api-client'

interface CashFlowCardProps {
  todaysCash: number
  cashCollected: number
  creditGiven: number
  pendingCollections: number
  invoiceCount: number
  creditInvoiceCount: number
}

export function CashFlowCard({
  todaysCash,
  cashCollected,
  creditGiven,
  pendingCollections,
  invoiceCount,
  creditInvoiceCount
}: CashFlowCardProps) {
  const cashFlowPositive = todaysCash >= 0

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-card text-primary-foreground p-6 lg:p-8 shadow-elegant">
      <div className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,hsl(var(--success)),transparent_50%)]" />
      </div>
      
      <div className="relative">
        <div className="text-sm opacity-80">Net Cash Flow Today</div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className={`text-5xl lg:text-6xl font-bold number-display tracking-tight ${cashFlowPositive ? '' : 'text-destructive-foreground'}`}>
            {formatINR(Math.abs(todaysCash))}
          </div>
          {!cashFlowPositive && <ArrowDownRight className="h-6 w-6 text-destructive-foreground" />}
          {cashFlowPositive && todaysCash > 0 && <ArrowUpRight className="h-6 w-6" />}
        </div>
        
        <div className="mt-3 flex items-center gap-4 text-sm opacity-90">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {invoiceCount} invoices
          </span>
          <span className="opacity-50">•</span>
          <span className={creditInvoiceCount > 0 ? 'text-warning' : ''}>
            {creditInvoiceCount} on credit
          </span>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg bg-white/10 p-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[11px] opacity-75">
            <Wallet className="h-3.5 w-3.5" />
            Cash collected
          </div>
          <div className="mt-1 font-bold">{formatINR(cashCollected)}</div>
        </div>
        
        <div className="rounded-lg bg-white/10 p-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[11px] opacity-75">
            <CreditCard className="h-3.5 w-3.5" />
            Credit given (Udhar)
          </div>
          <div className="mt-1 font-bold text-warning">{formatINR(creditGiven)}</div>
        </div>
        
        <div className="rounded-lg bg-white/10 p-3 backdrop-blur-sm">
          <div className="text-[11px] opacity-75">Pending collections</div>
          <div className={`mt-1 font-bold ${pendingCollections > 0 ? 'text-warning' : ''}`}>
            {formatINR(pendingCollections)}
          </div>
        </div>
      </div>
    </div>
  )
}