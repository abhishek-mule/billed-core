import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import Link from 'next/link'
import { ChevronLeft, Bug } from 'lucide-react'

interface PaymentRow {
  id: string
  amount: number
  source: string
  source_id: string | null
  lifecycle_status: string
  created_at: string
  updated_at: string
  customer_id: string | null
  invoice_id: string | null
}

interface OutboxRow {
  id: string
  type: string
  status: string
  created_at: string
  payment_id: string
}

const STAGE_ORDER = ['created', 'synced', 'processed', 'projected', 'visible'] as const

const STAGE_LABELS: Record<string, string> = {
  created: 'Created',
  synced: 'Synced',
  processed: 'Processed',
  projected: 'Projected',
  visible: 'Visible',
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  created: 'Payment recorded locally or via API',
  synced: 'Persisted to Supabase (offline path)',
  processed: 'Worker consumed payment.completed',
  projected: 'Recovery case updated',
  visible: 'Dashboard reflects change',
}

function getStageIndex(status: string): number {
  return STAGE_ORDER.indexOf(status as any)
}

export const dynamic = 'force-dynamic'

export default async function DeveloperPage() {
  const cookieStore = cookies()
  const tenantId = cookieStore.get('bz_tenant')?.value

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-card border border-rose-200 rounded-lg p-6 text-center">
            <Bug className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-rose-600">No tenant session found. Please log in.</p>
          </div>
        </div>
      </div>
    )
  }

  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('id, amount, source, source_id, lifecycle_status, created_at, updated_at, customer_id, invoice_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(30)

  const paymentIds = (payments || []).map(p => p.id)

  const { data: outboxEvents } = await supabaseAdmin
    .from('outbox')
    .select('id, type, status, created_at, payload')
    .eq('type', 'payment.completed')
    .in('payload->>paymentId', paymentIds.length > 0 ? paymentIds : ['_none__'])
    .order('created_at', { ascending: false })

  const outboxByPaymentId: Record<string, OutboxRow> = {}
  for (const ev of outboxEvents || []) {
    const pid = (ev.payload as any)?.paymentId
    if (pid && !outboxByPaymentId[pid]) {
      outboxByPaymentId[pid] = {
        id: ev.id,
        type: ev.type,
        status: ev.status,
        created_at: ev.created_at,
        payment_id: pid,
      }
    }
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to Settings
        </Link>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-indigo-50 text-indigo-600">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Payment Pipeline Inspector</h1>
              <p className="text-xs text-muted-foreground">
                Shows the last 30 payments and their lifecycle progression
              </p>
            </div>
          </div>
        </div>

        {/* Stage legend */}
        <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {STAGE_ORDER.map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                s === 'created' ? 'bg-slate-400' :
                s === 'synced' ? 'bg-blue-400' :
                s === 'processed' ? 'bg-amber-400' :
                s === 'projected' ? 'bg-emerald-400' :
                'bg-violet-400'
              }`} />
              <span className="font-medium text-foreground">{STAGE_LABELS[s]}</span>
              <span className="text-muted-foreground">— {STAGE_DESCRIPTIONS[s]}</span>
            </div>
          ))}
        </div>

        {(payments || []).length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">No payments found for this tenant.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(payments || []).map(p => {
              const outbox = outboxByPaymentId[p.id]
              const currentIdx = getStageIndex(p.lifecycle_status)
              const isCompleted = p.lifecycle_status === 'projected' || p.lifecycle_status === 'visible'

              return (
                <div key={p.id} className={`bg-card border-2 rounded-lg p-4 ${
                  isCompleted ? 'border-emerald-200' :
                  currentIdx <= 0 ? 'border-slate-200' :
                  'border-amber-200'
                }`}>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground truncate">
                        {p.id.length > 16 ? p.id.slice(0, 16) + '…' : p.id}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        ₹{Number(p.amount).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border">
                        {p.source}
                      </span>
                      {p.source_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-sky-50 text-sky-600 border border-sky-200">
                          #{p.source_id}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                      isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      currentIdx <= 0 ? 'bg-slate-50 text-slate-500 border-slate-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {p.lifecycle_status}
                    </span>
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center gap-0">
                    {STAGE_ORDER.map((stage, i) => {
                      const isActive = currentIdx >= i
                      const isCurrent = p.lifecycle_status === stage
                      const isLast = i === STAGE_ORDER.length - 1
                      const ts = i === 0 ? p.created_at
                        : stage === 'synced' && outbox ? outbox.created_at
                        : stage === 'processed' && currentIdx >= 2 ? p.updated_at
                        : stage === 'projected' && currentIdx >= 3 ? p.updated_at
                        : null

                      return (
                        <div key={stage} className="flex items-center gap-0 flex-1">
                          {/* Stage dot + label */}
                          <div className="flex flex-col items-center min-w-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                              isCurrent ? 'ring-2 ring-offset-1 ring-indigo-400' : ''
                            } ${
                              isActive
                                ? stage === 'created' ? 'bg-slate-500 text-white'
                                  : stage === 'synced' ? 'bg-blue-500 text-white'
                                  : stage === 'processed' ? 'bg-amber-500 text-white'
                                  : stage === 'projected' ? 'bg-emerald-500 text-white'
                                  : 'bg-violet-500 text-white'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                              isActive ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                              {STAGE_LABELS[stage]}
                            </span>
                            {ts && (
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                {new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                            {!ts && isActive && (
                              <span className="text-[9px] text-muted-foreground">—</span>
                            )}
                          </div>
                          {/* Connector line */}
                          {!isLast && (
                            <div className={`flex-1 h-px mx-1 mt-[-1.25rem] ${
                              currentIdx > i ? 'bg-foreground/20' : 'bg-muted'
                            }`} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Outbox detail row */}
                  {outbox && (
                    <div className="mt-2 pt-2 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-medium">Outbox:</span>
                      <span className={`px-1 py-0.5 rounded font-medium ${
                        outbox.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                        outbox.status === 'processing' ? 'bg-amber-50 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {outbox.status}
                      </span>
                      <span>{new Date(outbox.created_at).toLocaleString('en-IN')}</span>
                      <span className="font-mono text-[9px]">{outbox.id.slice(0, 8)}…</span>
                    </div>
                  )}

                  {/* Invoice / Customer row */}
                  {p.invoice_id && (
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>Invoice: <span className="font-mono">{p.invoice_id}</span></span>
                      {p.customer_id && <span>Customer: <span className="font-mono">{p.customer_id}</span></span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Summary footer */}
        <div className="bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Legend:</span>{' '}
            Each row shows a payment and its lifecycle. The checkmark indicates which stages have been reached.
            A green border means the payment is fully projected. An amber border means the pipeline is still in progress.
          </p>
        </div>
      </div>
    </div>
  )
}
