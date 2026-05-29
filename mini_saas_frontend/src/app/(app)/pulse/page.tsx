"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Clock, Search, Loader2, ArrowUpRight, CreditCard, Banknote, Smartphone } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { EmptyState } from "@/components/billzo/EmptyState";
import { db } from "@/lib/billzo/db";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";

const providerIcons: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  upi: <Smartphone className="h-4 w-4" />,
  razorpay_test: <CreditCard className="h-4 w-4" />,
};

const statusBadge: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
}

export default function PulsePage() {
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    loadAnomalies();
  }, []);

  const loadData = async () => {
    try {
      const tenantId = getCookie("bz_tenant");
      if (!tenantId) { router.push("/auth"); return; }

      const [pmtData, invData] = await Promise.all([
        db().payments.where("tenantId").equals(tenantId).toArray(),
        db().invoices.where("tenantId").equals(tenantId).toArray(),
      ]);

      setPayments(pmtData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setInvoices(invData);
    } finally {
      setLoading(false);
    }
  };

  const loadAnomalies = async () => {
    try {
      const res = await fetch("/api/situations?state=active&category=payment_anomaly&limit=5", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAnomalies(data.situations || []);
      }
    } catch {}
  };

  const invMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const inv of invoices) map.set(inv.id, inv);
    return map;
  }, [invoices]);

  const todayPayments = useMemo(() => payments.filter(p => isToday(p.createdAt) && p.status === "success"), [payments]);
  const todayTotal = useMemo(() => todayPayments.reduce((s, p) => s + (p.amount || 0), 0), [todayPayments]);

  const groupedPayments = useMemo(() => {
    const groups: { label: string; payments: any[] }[] = [];
    const today: any[] = [];
    const yesterday: any[] = [];
    const older: any[] = [];

    for (const p of payments) {
      if (isToday(p.createdAt)) today.push(p);
      else if (isYesterday(p.createdAt)) yesterday.push(p);
      else older.push(p);
    }

    if (today.length) groups.push({ label: "Today", payments: today });
    if (yesterday.length) groups.push({ label: "Yesterday", payments: yesterday });
    if (older.length) groups.push({ label: "Earlier", payments: older });

    return groups;
  }, [payments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Payment Pulse</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {payments.length} payments tracked · {formatINR(todayTotal)} received today
        </p>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="text-[11px] font-semibold text-green-600 uppercase tracking-wider">Received today</div>
          <div className="mt-1 text-xl font-bold text-green-700">{formatINR(todayTotal)}</div>
          <div className="text-[11px] text-green-600 mt-0.5">{todayPayments.length} payment{todayPayments.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total received</div>
          <div className="mt-1 text-xl font-bold">{formatINR(payments.filter(p => p.status === "success").reduce((s, p) => s + (p.amount || 0), 0))}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{payments.filter(p => p.status === "success").length} successful</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Failed</div>
          <div className="mt-1 text-xl font-bold text-red-600">{payments.filter(p => p.status === "failed").length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{payments.filter(p => p.status === "pending").length} pending</div>
        </div>
      </div>

      {/* Anomaly alerts from cognition */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anomalies</p>
          {anomalies.map(a => (
            <div key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">{a.headline}</p>
                <p className="text-xs text-amber-700 mt-0.5">{a.narrative}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment stream */}
      {payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title="No payments yet"
          description="Payments from your customers will appear here in real time"
        />
      ) : (
        <div className="space-y-6">
          {groupedPayments.map(group => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.label} · {group.payments.length} payment{group.payments.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-1">
                {group.payments.map(p => {
                  const inv = invMap.get(p.invoiceId);
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/30 transition-colors"
                    >
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        p.status === "success" ? "bg-green-100 text-green-600"
                        : p.status === "failed" ? "bg-red-100 text-red-600"
                        : "bg-yellow-100 text-yellow-600"
                      }`}>
                        {providerIcons[p.provider] || <CreditCard className="h-4 w-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{formatINR(p.amount)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge[p.status] || statusBadge.pending}`}>
                            {p.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {inv ? inv.customerName || "Unknown" : "Unknown customer"} · {formatTimeAgo(p.createdAt)}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-medium capitalize text-muted-foreground">{p.provider?.replace("_", " ")}</div>
                        {p.providerPaymentId && (
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">ID: {p.providerPaymentId.slice(0, 8)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
