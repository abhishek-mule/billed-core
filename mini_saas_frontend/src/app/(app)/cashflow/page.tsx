"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Send, Search, Loader2, Users } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { EmptyState } from "@/components/billzo/EmptyState";
import { db } from "@/lib/billzo/db";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";

type AgingBucket = "1-7" | "8-15" | "16-30" | "30+";

const bucketLabel: Record<AgingBucket, string> = {
  "1-7": "1–7 days",
  "8-15": "8–15 days",
  "16-30": "16–30 days",
  "30+": "30+ days",
};

const bucketColor: Record<AgingBucket, string> = {
  "1-7": "bg-yellow-50 border-yellow-200 text-yellow-700",
  "8-15": "bg-orange-50 border-orange-200 text-orange-700",
  "16-30": "bg-red-50 border-red-200 text-red-700",
  "30+": "bg-red-100 border-red-300 text-red-800",
};

const stageLabels: Record<string, string> = {
  t0_soft: "Soft notice",
  t1_reminder: "Reminder sent",
  t2_followup: "Follow-up",
  t3_escalation: "Escalated",
  t4_recovery: "Recovery",
  resolved: "Resolved",
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function getAgingBucket(days: number): AgingBucket {
  if (days <= 7) return "1-7";
  if (days <= 15) return "8-15";
  if (days <= 30) return "16-30";
  return "30+";
}

function getOutstanding(inv: any): number {
  return (inv.total || 0) - (inv.paidAmount || 0);
}

export default function CashflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [actingInvoice, setActingInvoice] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const tenantId = getCookie("bz_tenant");
      if (!tenantId) { router.push("/auth"); return; }
      const data = await db().invoices.where("tenantId").equals(tenantId).toArray();
      setInvoices(data);
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    const overdue = invoices.filter(i => i.status === "overdue" || i.status === "partial");
    const map = new Map<string, any[]>();
    for (const inv of overdue) {
      const key = inv.customerId || inv.customerName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    }

    return Array.from(map.entries())
      .map(([customerId, invs]) => {
        const firstDue = invs.reduce((earliest, inv) => inv.dueAt < earliest.dueAt ? inv : earliest, invs[0]);
        const totalOutstanding = invs.reduce((sum, inv) => sum + getOutstanding(inv), 0);
        const totalAmount = invs.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const days = daysSince(firstDue.dueAt);
        const stages = [...new Set(invs.map(i => i.recoveryStage).filter(Boolean))];

        return {
          customerId,
          customerName: invs[0].customerName || "Unknown",
          customerPhone: invs[0].customerPhone || "",
          invoiceCount: invs.length,
          totalOutstanding,
          totalAmount,
          daysSinceFirstDue: days,
          agingBucket: getAgingBucket(days),
          recoveryStage: stages[0] || "unknown",
          invoices: invs,
        };
      })
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [invoices]);

  const filtered = useMemo(() => {
    if (!q) return groups;
    const lq = q.toLowerCase();
    return groups.filter(g =>
      g.customerName.toLowerCase().includes(lq) ||
      g.customerPhone.includes(lq)
    );
  }, [groups, q]);

  const totals = useMemo(() => {
    let outstanding = 0, total = 0, count = 0;
    for (const g of groups) {
      outstanding += g.totalOutstanding;
      total += g.totalAmount;
      count += g.invoiceCount;
    }
    return { outstanding, total, count, customerCount: groups.length };
  }, [groups]);

  const bucketBreakdown = useMemo(() => {
    const buckets: Record<AgingBucket, { count: number; total: number; invoiceCount: number }> = {
      "1-7": { count: 0, total: 0, invoiceCount: 0 },
      "8-15": { count: 0, total: 0, invoiceCount: 0 },
      "16-30": { count: 0, total: 0, invoiceCount: 0 },
      "30+": { count: 0, total: 0, invoiceCount: 0 },
    };
    for (const g of groups) {
      buckets[g.agingBucket].count++;
      buckets[g.agingBucket].total += g.totalOutstanding;
      buckets[g.agingBucket].invoiceCount += g.invoiceCount;
    }
    return buckets;
  }, [groups]);

  const handleSendReminder = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActingInvoice(invoiceId);
    try {
      await fetch("/api/invoices/remind", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
    } catch {
      // silent
    } finally {
      setActingInvoice(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Cashflow</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {totals.customerCount} customers • {totals.count} invoices • {formatINR(totals.outstanding)} outstanding
        </p>
      </div>

      {/* Aging summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {(Object.keys(bucketLabel) as AgingBucket[]).map(bucket => {
          const b = bucketBreakdown[bucket];
          return (
            <div key={bucket} className={`rounded-xl border p-3 ${bucketColor[bucket]}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wider">{bucketLabel[bucket]}</div>
              <div className="mt-1 text-lg font-bold">{formatINR(b.total)}</div>
              <div className="text-[11px] opacity-75">{b.count} customers • {b.invoiceCount} invoices</div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by customer name or phone…"
          className="w-full h-11 rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Customer list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title={q ? "No customers match" : "No outstanding invoices"}
          description={q ? "Try a different search term" : "All invoices are paid — nothing needs your attention"}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(group => (
            <div key={group.customerId} className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Customer header */}
              <button
                onClick={() => setExpandedCustomer(expandedCustomer === group.customerId ? null : group.customerId)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold">
                  {group.customerName.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate">{group.customerName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAgingBadge(group.agingBucket)}`}>
                      {bucketLabel[group.agingBucket]}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {group.invoiceCount} invoice{group.invoiceCount !== 1 ? "s" : ""} • {group.daysSinceFirstDue}d overdue
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-bold">{formatINR(group.totalOutstanding)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatINR(group.totalAmount - group.totalOutstanding)} paid
                  </div>
                </div>

                {expandedCustomer === group.customerId
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>

              {/* Expanded invoices */}
              {expandedCustomer === group.customerId && (
                <div className="border-t border-border divide-y divide-border">
                  {group.invoices.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                        inv.status === "overdue" ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                      }`}>
                        {inv.status === "overdue" ? "!" : "P"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {inv.id.slice(0, 8)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Due {new Date(inv.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} • {daysSince(inv.dueAt)}d overdue
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold">{formatINR(getOutstanding(inv))}</div>
                        <div className="text-[10px] text-muted-foreground">of {formatINR(inv.total)}</div>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {stageLabels[inv.recoveryStage] || inv.recoveryStage || "—"}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={e => handleSendReminder(inv.id, e)}
                        disabled={actingInvoice === inv.id}
                      >
                        {actingInvoice === inv.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}

                  {/* Group actions */}
                  <div className="flex items-center gap-2 px-5 py-3 bg-muted/20">
                    <Button size="sm" variant="secondary">
                      <Send className="h-3.5 w-3.5" /> Remind all
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getAgingBadge(bucket: AgingBucket): string {
  switch (bucket) {
    case "1-7": return "bg-yellow-100 text-yellow-700";
    case "8-15": return "bg-orange-100 text-orange-700";
    case "16-30": return "bg-red-100 text-red-700";
    case "30+": return "bg-red-200 text-red-800";
  }
}
