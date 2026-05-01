import { Users, ArrowRight, Calendar, AlertCircle, Phone } from 'lucide-react'
import { formatINR } from '@/lib/api-client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface TopDebtor {
  customerId: string
  name: string
  phone: string
  amount: number
  daysOverdue: number
  invoiceCount: number
  dueDate: string
}

interface ReceivablesCardProps {
  topDebtors: TopDebtor[]
  totalPending: number
}

export function ReceivablesCard({
  topDebtors,
  totalPending
}: ReceivablesCardProps) {
  const router = useRouter()
  const hasDebtors = topDebtors.length > 0

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const handleCollectPayments = () => {
    router.push('/merchant/parties?tab=receivables')
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Who Owes You
        </h3>
        <Link 
          href="/merchant/parties?tab=receivables" 
          className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {!hasDebtors && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No pending receivables
        </div>
      )}

      {hasDebtors && (
        <div className="space-y-2">
          {topDebtors.slice(0, 5).map(debtor => (
            <button
              key={debtor.customerId}
              onClick={() => router.push(`/merchant/parties/${debtor.customerId}`)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-base
                ${debtor.daysOverdue > 30 
                  ? 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10' 
                  : 'bg-warning/5 border-warning/20 hover:bg-warning/10'}`}
            >
              <div className="text-left min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{debtor.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    {debtor.daysOverdue} days overdue
                  </span>
                  {debtor.invoiceCount > 1 && (
                    <>
                      <span>•</span>
                      <span>{debtor.invoiceCount} invoices</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="font-semibold number-display">{formatINR(debtor.amount)}</div>
                <div className={`text-[10px] font-medium 
                  ${debtor.daysOverdue > 30 ? 'text-destructive' : 'text-warning'}`}>
                  Due {formatDate(debtor.dueDate)}
                </div>
              </div>
            </button>
          ))}

          {topDebtors.length > 5 && (
            <div className="text-center text-xs text-muted-foreground">
              +{topDebtors.length - 5} more customers
            </div>
          )}

          {/* "Collect payments" CTA */}
          {totalPending > 0 && (
            <button
              onClick={handleCollectPayments}
              className="w-full mt-3 rounded-xl border-2 border-dashed border-input p-3 text-sm font-medium text-primary hover:bg-primary/5 transition-base flex items-center justify-center gap-2"
            >
              <Phone className="h-4 w-4" />
              Collect payments ({formatINR(totalPending)})
            </button>
          )}
        </div>
      )}
    </div>
  )
}