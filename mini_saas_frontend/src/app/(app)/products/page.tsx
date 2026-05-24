"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, AlertTriangle, Package, Loader2, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { db } from "@/lib/billzo/db";
import { getTenantId } from "@/lib/billzo/tenant";
import { useLiveQueryState } from "@/lib/billzo/use-live-query";
import { useSyncHealth } from "@/lib/billzo/sync-health";
import { retryProductSync } from "@/lib/billzo/products-service";
import { EmptyState } from '@/components/billzo/EmptyState';
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatINR } from "@/lib/utils";

export default function ProductsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const tenantId = getTenantId();

  const { data: products, loading: productsLoading, error: productsError } = useLiveQueryState<any[]>(
    async () => {
      if (!tenantId) return [];
      return db().products.where("tenantId").equals(tenantId).toArray();
    },
    [tenantId],
    [],
  );

  const { data: syncHealth } = useSyncHealth(tenantId);

  const loading = productsLoading;
  const loadError = productsError;

  const filtered = products.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));
  const lowStock = products.filter((p) => (p.stock || 0) < (p.lowStockAt || 20)).length;
  const stockValue = products.reduce((s, p) => s + (p.salePrice || 0) * (p.stock || 0), 0);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(p => ({
      Name: p.name,
      Barcode: p.barcode || "",
      HSN: p.hsn || "",
      GST_Rate: `${p.gstRate || 0}%`,
      Sale_Price: p.salePrice || 0,
      Purchase_Price: p.purchasePrice || 0,
      Stock: p.stock || 0
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Products_Export.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Products Report", 14, 15);
    
    autoTable(doc, {
      startY: 20,
      head: [["Name", "HSN", "GST", "Price", "Stock"]],
      body: filtered.map(p => [
        p.name,
        p.hsn || "—",
        `${p.gstRate || 0}%`,
        formatINR(p.salePrice || 0),
        (p.stock || 0).toString()
      ]),
    });
    
    doc.save("Products_Export.pdf");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-4">
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}
      {(syncHealth.failedCount > 0 || syncHealth.conflictCount > 0) && (
        <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex items-center justify-between gap-3">
          <span>
            {syncHealth.failedCount + syncHealth.conflictCount} product sync operation{syncHealth.failedCount + syncHealth.conflictCount > 1 ? "s" : ""} failed. Data may be stale.
          </span>
          <Button size="sm" variant="outline" onClick={() => retryProductSync()}>
            Retry sync
          </Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total products" value={products.length.toString()} />
        <Stat label="Low stock" value={lowStock.toString()} warn={lowStock > 0} />
        <Stat label="Stock value" value={formatINR(stockValue)} />
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            className="w-full h-11 rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <FileSpreadsheet className="h-4 w-4 text-green-600" /> <span className="hidden sm:inline">Excel</span>
        </Button>
        <Button variant="outline" size="sm" onClick={exportPDF}>
          <FileText className="h-4 w-4 text-red-600" /> <span className="hidden sm:inline">PDF</span>
        </Button>
        <Button onClick={() => router.push("/products/add")}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-12 w-12" />}
          title="No products yet"
          description="Add your first product to get started"
          action={<Button onClick={() => router.push("/products/add")}><Plus className="h-4 w-4" /> Add Product</Button>}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_100px_100px_100px_100px] gap-4 px-5 py-3 border-b border-border bg-secondary/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Name</span><span>HSN</span><span>GST</span><span className="text-right">Price</span><span className="text-right">Stock</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li
                key={p.id}
                onClick={() => router.push(`/products/${p.id}`)}
                className="sm:grid sm:grid-cols-[1fr_100px_100px_100px_100px] sm:gap-4 sm:items-center px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground sm:hidden mt-0.5">HSN {p.hsn || "—"} • GST {p.gstRate || 0}%</div>
                </div>
                <div className="hidden sm:block text-sm text-muted-foreground">{p.hsn || "—"}</div>
                <div className="hidden sm:block text-sm text-muted-foreground">{p.gstRate || 0}%</div>
                <div className="sm:text-right mt-2 sm:mt-0 flex sm:block justify-between text-sm">
                  <span className="sm:hidden text-muted-foreground">Price</span>
                  <span className="font-bold">{formatINR(p.salePrice || 0)}</span>
                </div>
                <div className="sm:text-right mt-1 sm:mt-0 flex sm:block justify-between items-center">
                  <span className="sm:hidden text-muted-foreground text-sm">Stock</span>
                  <span className={`text-sm font-semibold ${(p.stock || 0) < (p.lowStockAt || 20) ? "text-yellow-600" : "text-green-600"}`}>
                    {(p.stock || 0) < (p.lowStockAt || 20) && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                    {p.stock || 0}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-yellow-400/40 bg-yellow-50" : "border-border bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${warn ? "text-yellow-600" : ""}`}>{value}</div>
    </div>
  );
}
