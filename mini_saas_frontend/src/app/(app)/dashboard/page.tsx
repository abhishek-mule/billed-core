"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, ScanLine, Package, Users, AlertTriangle, CheckCircle2, ArrowRight, TrendingUp, Loader2, Store } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { UsagePill } from "@/components/billzo/UsagePill";
import { Loader } from "@/components/billzo/Loader";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function getTenantName() {
  const raw = getCookie('bz_tenant_name')
  if (!raw) return null
  try { return decodeURIComponent(raw) } catch { return raw }
}

const statusBadge: Record<string, string> = {
  synced: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function DashboardPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayStats, setTodayStats] = useState({ revenue: 0, invoiceCount: 0, failedCount: 0, yesterdayRevenue: 0 });
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    const name = getTenantName()
    setTenantName(name)
    loadData()
  }, []);

  const loadData = async () => {
    try {
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) {
        router.push("/auth")
        return
      }

      const invoiceData = await db().invoices.where("tenantId").equals(tenantId).toArray();
      setInvoices(invoiceData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayInvoices = invoiceData.filter((inv: any) => new Date(inv.createdAt) >= today);
      const revenue = todayInvoices.reduce((s: number, inv: any) => s + (inv.total || 0), 0);
      const yesterdayInvoices = invoiceData.filter((inv: any) => {
        const d = new Date(inv.createdAt);
        return d >= yesterday && d < today;
      });
      const yesterdayRevenue = yesterdayInvoices.reduce((s: number, inv: any) => s + (inv.total || 0), 0);
      const failedCount = invoiceData.filter((inv: any) => inv.syncStatus === "failed").length;

      setTodayStats({
        revenue,
        invoiceCount: todayInvoices.length,
        failedCount,
        yesterdayRevenue,
      });
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const allSynced = todayStats.failedCount === 0;

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const displayName = tenantName || 'My Shop'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {tenantName && (
            <Image
              unoptimized
              src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(tenantName)}`}
              alt={displayName}
              width={48}
              height={48}
              className="rounded-2xl border-2 border-primary/10 shadow-sm"
            />
          )}
          <div>
            <p className="text-sm text-muted-foreground font-medium">{greeting}</p>
            <h1 className="text-xl font-bold leading-tight">{displayName}</h1>
            <p className="text-xs text-muted-foreground">Dashboard</p>
          </div>
        </div>
        <UsagePill />
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 to-green-600 text-white p-6 lg:p-8 shadow-lg">
        <div className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,hsl(142,76%,36%),transparent_50%)]" />
        </div>
        <div className="relative">
          <div className="text-sm opacity-80">Today&apos;s revenue</div>
          <div className="mt-2 text-5xl lg:text-6xl font-bold tracking-tight">
            {formatINR(todayStats.revenue)}
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm opacity-90">
            <span>{todayStats.invoiceCount} invoices</span>
            <span className="opacity-50">•</span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> {todayStats.yesterdayRevenue > 0 ? `+${Math.round(((todayStats.revenue - todayStats.yesterdayRevenue) / todayStats.yesterdayRevenue) * 100)}% vs yesterday` : "First day!"}
            </span>
          </div>
        </div>
      </div>

      <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
        allSynced ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50"
      }`}>
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${
          allSynced ? "bg-green-500 text-white" : "bg-yellow-500 text-white"
        }`}>
          {allSynced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${allSynced ? "text-green-700" : "text-yellow-700"}`}>
            {allSynced ? "All invoices synced" : `${todayStats.failedCount} invoices failed to sync`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {allSynced ? "Last synced just now" : "Tap retry to send them again"}
          </div>
        </div>
        {!allSynced && (
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm">
            Retry
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { href: "/pos", label: "Bill", icon: Plus, primary: true },
          { href: "/purchases", label: "Scan", icon: ScanLine },
          { href: "/products", label: "Products", icon: Package },
          { href: "/parties", label: "Parties", icon: Users },
        ].map(({ href, label, icon: Icon, primary }) => (
          <Link
            key={label}
            href={href}
            className={`rounded-2xl p-4 flex flex-col items-center gap-2 border transition-transform active:scale-95 ${
              primary
                ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-transparent shadow-lg"
                : "bg-card border-border hover:border-primary/30 hover:shadow-md"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-semibold">{label}</span>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Recent invoices</h2>
          <Link href="/invoices" className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {invoices.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No invoices yet</div>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.slice(0, 6).map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">
                  {inv.customerName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{inv.customerName}</div>
                  <div className="text-xs text-muted-foreground">{inv.id?.slice(0, 8)} • {new Date(inv.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{formatINR(inv.total)}</div>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge[inv.syncStatus] || statusBadge.pending}`}>
                    {inv.syncStatus || "pending"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}