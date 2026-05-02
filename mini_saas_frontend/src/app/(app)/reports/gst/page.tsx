'use client'

import { useState, useEffect } from 'react'
import { 
  FileText, 
  Download, 
  Filter, 
  Calendar, 
  ShieldCheck, 
  AlertCircle,
  TrendingUp,
  ArrowRight,
  PieChart as PieChartIcon
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export default function GSTReportsPage() {
  const [period, setPeriod] = useState('current-month')
  const [isLoading, setIsLoading] = useState(false)
  const [gstSummary, setGstSummary] = useState<any>(null)

  useEffect(() => {
    // In a real app, fetch GST summary based on period
    setGstSummary({
      totalSales: 125400,
      totalTax: 22572,
      cgst: 11286,
      sgst: 11286,
      igst: 0,
      liability: 22572,
      inputCredit: 4500,
      netPayable: 18072
    })
  }, [period])

  const handleExport = async (type: 'GSTR-1' | 'GSTR-3B') => {
    setIsLoading(true)
    try {
      // Simulate API call to generate Excel
      const res = await fetch(`/api/merchant/reports/gst/export?type=${type}&period=${period}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}_${period}.xlsx`
      a.click()
    } catch (e) {
      console.error('Export failed', e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-10 animate-fade-in pb-24 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-foreground italic">Compliance Shield</h1>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mt-1 opacity-60">Authorized GST Reporting Module</p>
        </div>
        
        <div className="flex items-center gap-3 bg-card/50 backdrop-blur-md p-2 rounded-2xl border border-border/50">
          <Calendar className="w-4 h-4 text-primary ml-2" />
          <select 
            value={period} 
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-transparent border-none focus:ring-0 text-xs font-black uppercase tracking-widest text-foreground outline-none"
          >
            <option value="current-month">May 2026 (Current)</option>
            <option value="last-month">April 2026</option>
            <option value="q1">Q1 FY 2026-27</option>
          </select>
        </div>
      </header>

      {/* Primary Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Tax Collected', val: `₹${gstSummary?.totalTax.toLocaleString()}`, color: 'text-primary', sub: 'Gross Liability' },
          { label: 'Input Tax Credit', val: `₹${gstSummary?.inputCredit.toLocaleString()}`, color: 'text-success', sub: 'Verified Purchases' },
          { label: 'Net GST Payable', val: `₹${gstSummary?.netPayable.toLocaleString()}`, color: 'text-warning', sub: 'Due by 20th Jun' },
        ].map((stat, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label}
            className="card-base p-6 bg-card/30 border-border/50 relative overflow-hidden"
          >
             <div className="absolute -right-4 -bottom-4 opacity-5">
                <TrendingUp className="w-24 h-24" />
             </div>
             <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">{stat.label}</p>
             <p className={cn("text-3xl font-black tracking-tighter", stat.color)}>{stat.val}</p>
             <p className="text-[9px] font-bold text-muted-foreground uppercase mt-3 tracking-widest opacity-60">{stat.sub}</p>
          </motion.div>
        ))}
      </section>

      {/* Tax Breakdown & Exports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Breakdown */}
        <section className="card-base p-8 space-y-8 bg-card/40 border-border/50">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-primary" /> Tax Composition
            </h2>
          </div>
          
          <div className="space-y-6">
            <BreakdownItem label="CGST (9%)" value={gstSummary?.cgst} total={gstSummary?.totalTax} color="bg-primary" />
            <BreakdownItem label="SGST (9%)" value={gstSummary?.sgst} total={gstSummary?.totalTax} color="bg-primary-glow" />
            <BreakdownItem label="IGST" value={gstSummary?.igst} total={gstSummary?.totalTax} color="bg-muted" />
          </div>

          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-4">
             <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
             <p className="text-[10px] font-bold text-primary/80 uppercase leading-relaxed tracking-wide">
               Calculations are based on finalized invoices only. Drafts and Voided bills are excluded from compliance reporting.
             </p>
          </div>
        </section>

        {/* Action Center */}
        <section className="space-y-6">
          <div className="card-base p-8 bg-black text-white relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                <Download className="w-20 h-20" />
             </div>
             <h3 className="text-xl font-black uppercase tracking-tighter italic italic">One-Click Exports</h3>
             <p className="text-[10px] font-bold text-white/50 uppercase mt-2 tracking-widest">Generate CA-Ready Documents</p>
             
             <div className="grid grid-cols-1 gap-4 mt-8">
                <Button 
                  variant="primary" 
                  fullWidth 
                  size="lg" 
                  loading={isLoading}
                  onClick={() => handleExport('GSTR-1')}
                  icon={<FileText className="w-4 h-4" />}
                >
                  Generate GSTR-1
                </Button>
                <Button 
                  variant="outline" 
                  fullWidth 
                  size="lg" 
                  className="border-white/20 hover:bg-white/5 text-white"
                  loading={isLoading}
                  onClick={() => handleExport('GSTR-3B')}
                  icon={<FileText className="w-4 h-4" />}
                >
                  Generate GSTR-3B
                </Button>
             </div>
          </div>

          <div className="card-base p-6 border-warning/20 bg-warning-soft/20 flex items-center justify-between group cursor-pointer hover:border-warning/40 transition-colors">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-warning text-warning-foreground rounded-xl flex items-center justify-center">
                   <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                   <p className="text-xs font-black uppercase tracking-tight text-foreground">Missing GSTINs</p>
                   <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">4 Customers need update</p>
                </div>
             </div>
             <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </section>
      </div>
    </div>
  )
}

function BreakdownItem({ label, value, total, color }: any) {
  const percentage = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">₹{value?.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={cn("h-full rounded-full", color)} 
        />
      </div>
    </div>
  )
}
