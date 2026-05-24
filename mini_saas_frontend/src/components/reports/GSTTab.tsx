'use client'

import { Download, FileText, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { GSTReport, PlanType } from '@/lib/billzo/report-engine'
import { formatINR, exportToCSV } from '@/lib/billzo/report-engine'
import { downloadGSTReportPDF } from '@/lib/billzo/pdf'
import { MetricCard, PaywallTeaser } from './MetricCard'

const money = (n: number) => formatINR(n)

interface GSTTabProps {
  report: GSTReport
  plan: PlanType
}

export function GSTTab({ report, plan }: GSTTabProps) {
  const handleExport = () => {
    const rows = report.hsnBreakdown.map(item => ({
      HSN: item.hsn,
      Description: item.description,
      Qty: item.qty,
      'Taxable Value': item.taxableValue,
      Rate: `${item.rate}%`,
      CGST: item.cgst,
      SGST: item.sgst,
      Total: item.total,
    }))
    exportToCSV(rows, 'gst-report')
  }

  const router = useRouter()

  return (
    <div className="animate-fade-in space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-emerald-600 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">GST Summary</p>
            <p className="mt-1 text-4xl font-black">
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </p>
            <p className="mt-1 text-sm opacity-70">{report.invoiceCount} invoices</p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/20">
            <FileText className="h-6 w-6" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs opacity-70">Total Sales</div>
            <div className="mt-1 text-lg font-bold">{money(report.totalSales)}</div>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs opacity-70">Output GST</div>
            <div className="mt-1 text-lg font-bold">{money(report.outputGST)}</div>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs opacity-70">Net GST</div>
            <div className="mt-1 text-lg font-bold">{money(report.netGST)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="CGST Collected"
          value={money(report.cgst)}
          sub="Half of output GST"
          icon={<ArrowRight className="h-4 w-4" />}
        />
        <MetricCard
          label="SGST Collected"
          value={money(report.sgst)}
          sub="Half of output GST"
          icon={<ArrowRight className="h-4 w-4" />}
        />
      </div>

      {report.hsnBreakdown.length > 0 ? (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">HSN-wise Summary</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">HSN</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Taxable Value</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Rate</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">CGST</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">SGST</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.hsnBreakdown.map(item => (
                  <tr key={item.hsn} className="border-b last:border-0">
                    <td className="py-2 font-mono font-medium">{item.hsn}</td>
                    <td className="py-2 text-right">{money(item.taxableValue)}</td>
                    <td className="py-2 text-right">{item.rate}%</td>
                    <td className="py-2 text-right">{money(item.cgst)}</td>
                    <td className="py-2 text-right">{money(item.sgst)}</td>
                    <td className="py-2 text-right font-bold">{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-2 font-semibold text-muted-foreground">No GST data yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create invoices to see GST breakdown</p>
        </div>
      )}

      <PaywallTeaser plan={plan} />

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-border py-4 text-sm font-bold text-muted-foreground transition-all hover:border-border/80 hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          CSV Export
        </button>
        <button
          onClick={() => downloadGSTReportPDF(report, 'BillZo Business')}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-primary/20 bg-primary/5 py-4 text-sm font-bold text-primary transition-all hover:border-primary/30 hover:bg-primary/10"
        >
          <FileText className="h-4 w-4" />
          Download PDF
        </button>
      </div>
    </div>
  )
}