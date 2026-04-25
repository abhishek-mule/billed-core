'use client'

import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { dashboardCardInteractive } from './styles'

interface GSTReadinessCardProps {
  gstinVerified?: boolean
  hsnCodesConfigured?: number
  taxTemplatesConfigured?: boolean
}

export function GSTReadinessCard({ 
  gstinVerified = true, 
  hsnCodesConfigured = 0,
  taxTemplatesConfigured = true 
}: GSTReadinessCardProps) {
  const items = [
    {
      label: 'GSTIN Verified',
      status: gstinVerified ? 'ok' : 'warn',
      detail: gstinVerified ? 'Active' : 'Pending verification'
    },
    {
      label: 'HSN Codes',
      status: hsnCodesConfigured > 0 ? 'ok' : 'warn',
      detail: `${hsnCodesConfigured} codes configured`
    },
    {
      label: 'Tax Templates',
      status: taxTemplatesConfigured ? 'ok' : 'warn',
      detail: taxTemplatesConfigured ? 'Configured' : 'Setup required'
    }
  ]

  const allOk = items.every(item => item.status === 'ok')

  return (
    <div className={dashboardCardInteractive}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">GST Readiness</span>
        </div>
        <div className={`
          flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
          ${allOk ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}
        `}>
          {allOk ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {allOk ? 'Ready' : 'Action Needed'}
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-b-0">
            <span className="text-sm text-slate-300">{item.label}</span>
            <span className={`text-[11px] font-medium ${
              item.status === 'ok' ? 'text-slate-500' : 'text-amber-500'
            }`}>
              {item.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}