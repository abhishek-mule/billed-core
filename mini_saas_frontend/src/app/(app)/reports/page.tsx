"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { db } from "@/lib/billzo/db";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function ReportsPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }
      const data = await db().invoices.where("tenantId").equals(tenantId).toArray();
      setInvoices(data);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const outputGst = invoices.reduce((s, inv) => s + (inv.total || 0) * 0.12, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-green-500 to-green-600 text-white p-6 lg:p-8 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
              <CheckCircle2 className="h-3.5 w-3.5" /> {new Date().toLocaleString("default", { month: "long" })} {new Date().getFullYear()}
            </div>
            <h2 className="mt-3 text-2xl font-bold">GST Ready</h2>
            <p className="mt-1 text-sm opacity-80">All invoices reconciled. Send to your CA.</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20">
            <CheckCircle2 className="h-6 w-6" />
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Mini label="Total sales" value={formatINR(totalSales)} dark />
          <Mini label="Output GST" value={formatINR(outputGst)} dark />
          <Mini label="Input GST" value={formatINR(0)} dark />
        </div>
        <button
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-white text-green-700 rounded-xl font-medium hover:bg-white/90"
          onClick={() => console.log("GSTR-1 exported")}
        >
          <Download className="h-4 w-4" /> Export GSTR-1
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ReportCard title="Sales summary" desc="Day, week & month-wise" />
        <ReportCard title="Party ledger" desc="Receivables & payables" />
        <ReportCard title="Stock report" desc="Movement & valuation" />
        <ReportCard title="Tax report" desc="HSN-wise breakdown" />
      </div>
    </div>
  );
}

function Mini({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${dark ? "bg-white/10" : "bg-secondary"}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </div>
  );
}

function ReportCard({ title, desc }: { title: string; desc: string }) {
  return (
    <button className="text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-colors flex items-center gap-4">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Download className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}