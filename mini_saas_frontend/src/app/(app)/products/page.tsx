"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, AlertTriangle, Package } from "lucide-react";
import { db } from "@/lib/billzo/db";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function ProductsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }
      const data = await db().products.where("tenantId").equals(tenantId).toArray();
      setProducts(data);
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = products.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));
  const lowStock = products.filter((p) => (p.stock || 0) < 20).length;
  const stockValue = products.reduce((s, p) => s + (p.salePrice || 0) * (p.stock || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <button
          onClick={() => router.push("/products/add")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

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
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No products yet</h3>
          <p className="text-muted-foreground mt-1">Add your first product to get started</p>
          <button
            onClick={() => router.push("/products/add")}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium"
          >
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </div>
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
                  <span className={`text-sm font-semibold ${(p.stock || 0) < 20 ? "text-orange-600" : "text-green-600"}`}>
                    {(p.stock || 0) < 20 && <AlertTriangle className="inline h-3 w-3 mr-1" />}
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
    <div className={`rounded-xl border p-4 ${warn ? "border-orange-400/40 bg-orange-50" : "border-border bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${warn ? "text-orange-600" : ""}`}>{value}</div>
    </div>
  );
}