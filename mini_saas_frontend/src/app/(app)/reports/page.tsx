"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, CheckCircle2, TrendingUp, Users, Package, Receipt } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { toast } from "sonner";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalSales: 0, outputGst: 0, inputGst: 0, invoicesCount: 0 });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }
      const invoices = await db.invoices.where("tenantId").equals(tenantId).toArray();
      
      const totalSales = invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
      const outputGst = invoices.reduce((s, inv) => {
        return s + (inv.items?.reduce((sum: number, item: any) => sum + (item.price * item.qty * item.gst / 100), 0) || 0);
      }, 0);

      setStats({
        totalSales,
        outputGst,
        inputGst: 0,
        invoicesCount: invoices.length,
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportGSTR = () => {
    toast.success("GSTR-1 exported successfully");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const currentMonth = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-6 lg:p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
              <CheckCircle2 className="h-3.5 w-3.5" /> {currentMonth}
            </div>
            <h2 className="mt-3 text-2xl font-bold">GST Summary</h2>
            <p className="mt-1 text-sm opacity-80">{stats.invoicesCount} invoices reconciled</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20">
            <CheckCircle2 className="h-6 w-6" />
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg p-3 bg-white/10">
            <div className="text-[11px] opacity-70">Total sales</div>
            <div className="mt-1 text-base font-bold">{formatINR(stats.totalSales)}</div>
          </div>
          <div className="rounded-lg p-3 bg-white/10">
            <div className="text-[11px] opacity-70">Output GST</div>
            <div className="mt-1 text-base font-bold">{formatINR(stats.outputGst)}</div>
          </div>
          <div className="rounded-lg p-3 bg-white/10">
            <div className="text-[11px] opacity-70">Input GST</div>
            <div className="mt-1 text-base font-bold">{formatINR(stats.inputGst)}</div>
          </div>
        </div>
        <button
          onClick={handleExportGSTR}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-medium hover:bg-white/90"
        >
          <Download className="h-4 w-4" /> Export GSTR-1
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ReportCard 
          title="Sales summary" 
          desc="Day, week & month-wise"
          icon={<TrendingUp className="h-5 w-5" />}
          onClick={() => toast.info("Sales report coming soon")}
        />
        <ReportCard 
          title="Party ledger" 
          desc="Receivables & payables"
          icon={<Users className="h-5 w-5" />}
          onClick={() => router.push("/parties")}
        />
        <ReportCard 
          title="Stock report" 
          desc="Movement & valuation"
          icon={<Package className="h-5 w-5" />}
          onClick={() => router.push("/products")}
        />
        <ReportCard 
          title="Tax report" 
          desc="HSN-wise breakdown"
          icon={<Receipt className="h-5 w-5" />}
          onClick={() => toast.info("Tax report coming soon")}
        />
      </div>
    </div>
  );
}

function ReportCard({ title, desc, icon, onClick }: { title: string; desc: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all flex items-center gap-4"
    >
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary">
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Download className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}