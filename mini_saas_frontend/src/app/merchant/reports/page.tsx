'use client'

import { Button } from "@/components/ui/Button"
import { Download, FileText, CheckCircle2 } from "lucide-react"
import { formatINR } from "@/lib/api-client"
import { toast } from "sonner"

const Reports = () => {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-5">
      {/* GST card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/90 text-primary-foreground p-6 lg:p-8 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
              <CheckCircle2 className="h-3.5 w-3.5" /> April 2026
            </div>
            <h2 className="mt-3 text-2xl font-bold">GST Ready</h2>
            <p className="mt-1 text-sm opacity-80">All invoices reconciled. Send to your CA.</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500 text-white shadow-lg">
            <CheckCircle2 className="h-6 w-6" />
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Mini label="Total sales" value={formatINR(842300)} dark />
          <Mini label="Output GST" value={formatINR(74520)} dark />
          <Mini label="Input GST" value={formatINR(18420)} dark />
        </div>
        <Button 
          className="mt-5 bg-emerald-500 hover:bg-emerald-600 text-white"
          onClick={() => toast.success("GSTR-1 exported")}
        >
          <Download className="h-4 w-4 mr-2" /> Export GSTR-1
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ReportCard title="Sales summary" desc="Day, week & month-wise" />
        <ReportCard title="Party ledger" desc="Receivables & payables" />
        <ReportCard title="Stock report" desc="Movement & valuation" />
        <ReportCard title="Tax report" desc="HSN-wise breakdown" />
      </div>
    </div>
  )
}

const Mini = ({ label, value, dark }: { label: string; value: string; dark?: boolean }) => (
  <div className={`rounded-lg p-3 ${dark ? "bg-white/10" : "bg-secondary"}`}>
    <div className="text-[11px] opacity-70">{label}</div>
    <div className="mt-1 text-base font-bold">{value}</div>
  </div>
)

const ReportCard = ({ title, desc }: { title: string; desc: string }) => (
  <button 
    className="text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all flex items-center gap-4 w-full"
    onClick={() => toast.success(`${title} exported`)}
  >
    <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary">
      <FileText className="h-5 w-5" />
    </div>
    <div className="flex-1">
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </div>
    <Download className="h-4 w-4 text-muted-foreground" />
  </button>
)

export default Reports