"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, AlertTriangle, RefreshCw, Plus, Filter, Loader2, Download, FileSpreadsheet, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { EmptyState } from '@/components/billzo/EmptyState';
import { db } from "@/lib/billzo/db";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";

const tabs = ["All", "Synced", "Pending", "Failed"] as const;
type Tab = typeof tabs[number];

const statusStyle: Record<string, string> = {
  synced: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function InvoicesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("All");
  const [q, setQ] = useState("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const tenantId = getCookie('bz_tenant');
      if (!tenantId) {
        router.push("/auth");
        return;
      }
      const data = await db().invoices.where("tenantId").equals(tenantId).toArray();
      setInvoices(data);
    } catch (error) {
      console.error("Failed to load invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = invoices.filter((i) => {
    const matchTab = tab === "All" || i.syncStatus === tab.toLowerCase();
    const matchQ = !q || i.customerName?.toLowerCase().includes(q.toLowerCase()) || i.id?.toLowerCase().includes(q.toLowerCase());
    return matchTab && matchQ;
  });
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleInvoices = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [q, tab]);

  const failedCount = invoices.filter((i) => i.syncStatus === "failed").length;

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      ID: i.id,
      Date: new Date(i.createdAt).toLocaleString(),
      Customer: i.customerName,
      Phone: i.customerPhone,
      Amount: i.total,
      Status: i.status,
      SyncStatus: i.syncStatus
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, "Invoices_Export.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Invoices Report", 14, 15);
    
    autoTable(doc, {
      startY: 20,
      head: [["ID", "Date", "Customer", "Amount", "Status"]],
      body: filtered.map(i => [
        i.id.slice(0, 8),
        new Date(i.createdAt).toLocaleDateString(),
        i.customerName,
        formatINR(i.total),
        i.status
      ]),
    });
    
    doc.save("Invoices_Export.pdf");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-4">
      {failedCount > 0 && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-yellow-700">{failedCount} invoices failed to sync.</span>
            <span className="text-muted-foreground ml-1">Retry anytime — your data is safe.</span>
          </div>
          <Button size="sm" onClick={() => console.log("Retrying sync…")}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry all
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by party or invoice #"
            className="w-full h-11 rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportPDF}>
          <FileText className="h-4 w-4 text-red-600" /> PDF
        </Button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-secondary w-fit">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="No invoices yet"
          description="Create your first invoice from POS"
          action={<Link href="/pos"><Button><Plus className="h-4 w-4" /> Create Invoice</Button></Link>}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1fr_120px_120px_100px] gap-4 px-5 py-3 border-b border-border bg-secondary/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Party</span><span>Invoice</span><span>Method</span><span className="text-right">Amount</span><span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.length === 0 ? (
              <li className="p-12 text-center text-sm text-muted-foreground">No invoices match.</li>
            ) : visibleInvoices.map((inv) => (
              <li
                key={inv.id}
                className={`hover:bg-muted/40 transition-colors ${inv.syncStatus === "failed" ? "bg-red-50" : ""}`}
              >
                <Link
                  href={`/invoices/${inv.id}`}
                  className="md:grid md:grid-cols-[1fr_1fr_120px_120px_100px] md:gap-4 md:items-center px-5 py-4 block"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold">
                      {inv.customerName?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{inv.customerName}</div>
                      <div className="text-xs text-muted-foreground md:hidden">{inv.id?.slice(0, 8)} • {new Date(inv.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="hidden md:block text-sm">
                    <div className="font-medium">{inv.id?.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="hidden md:block text-sm capitalize text-muted-foreground">{inv.status}</div>
                  <div className="md:text-right mt-2 md:mt-0 flex md:block justify-between items-center">
                    <span className="text-sm font-bold">{formatINR(inv.total)}</span>
                    <span className={`md:hidden ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[inv.syncStatus] || statusStyle.pending}`}>
                      {inv.syncStatus || "pending"}
                    </span>
                  </div>
                  <div className="hidden md:flex justify-end items-center gap-2">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusStyle[inv.syncStatus] || statusStyle.pending}`}>
                      {inv.syncStatus || "pending"}
                    </span>
                    {inv.syncStatus === "failed" && (
                      <button onClick={(e) => { e.preventDefault(); console.log("Retrying…"); }} className="grid h-7 w-7 place-items-center rounded-md text-yellow-600 hover:bg-yellow-100">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Link>
              </li>
            ))}
            {hasMore && (
              <li className="p-4 text-center border-t border-border">
                <Button variant="ghost" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                  Show more ({filtered.length - visibleCount} remaining)
                </Button>
              </li>
            )}
          </ul>
        </div>
      )}

      <Link
        href="/pos"
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg hover:scale-110 transition-transform"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}