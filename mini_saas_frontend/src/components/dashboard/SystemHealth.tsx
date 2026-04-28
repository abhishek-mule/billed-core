'use client'

import { Shield, CheckCircle, AlertTriangle, Zap, Server, Activity } from 'lucide-react'
import { useState, useEffect } from 'react'

interface HealthStatus {
  erp: 'healthy' | 'warning' | 'error'
  razorpay: 'healthy' | 'warning' | 'error'
  database: 'healthy' | 'warning' | 'error'
  lastSync: string
  trustScore: number
}

export function SystemHealth() {
  const [status, setStatus] = useState<HealthStatus>({
    erp: 'healthy',
    razorpay: 'healthy',
    database: 'healthy',
    lastSync: '2 mins ago',
    trustScore: 99.8
  })

  // Simulated health check - in real app, fetch from /api/health
  useEffect(() => {
    const timer = setTimeout(() => {
      // Logic to fetch actual health metrics
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  const StatusIcon = ({ type }: { type: HealthStatus['erp'] }) => {
    if (type === 'healthy') return <CheckCircle className="w-4 h-4 text-emerald-500" />
    if (type === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />
    return <AlertTriangle className="w-4 h-4 text-rose-500" />
  }

  return (
    <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-2xl border border-slate-800 overflow-hidden relative">
      {/* Background Decorative Element */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold tracking-tight">System Integrity</h2>
          </div>
          <p className="text-slate-400 text-sm max-w-md">
            Your data is protected by multi-tenant isolation and real-time idempotency checks.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase font-black tracking-widest mb-1">Trust Score</div>
            <div className="text-3xl font-black text-indigo-400">{status.trustScore}%</div>
          </div>
          <div className="w-px h-10 bg-slate-700" />
          <Activity className="w-8 h-8 text-indigo-500 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-sm font-medium">ERP Integration</span>
          </div>
          <StatusIcon type={status.erp} />
        </div>

        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Zap className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-sm font-medium">Payment Gateway</span>
          </div>
          <StatusIcon type={status.razorpay} />
        </div>

        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-sm font-medium">Auto-Sync Engine</span>
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
            {status.lastSync}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs text-slate-400 font-medium">All systems operational in your region</span>
        </div>
        <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest">
          View Audit Logs →
        </button>
      </div>
    </div>
  )
}
