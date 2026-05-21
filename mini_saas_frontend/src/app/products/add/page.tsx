"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { getTenantId } from "@/lib/billzo/tenant";
import { createProduct } from "@/lib/billzo/products-service";

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

interface ProductFormData {
  name: string;
  barcode: string;
  hsn: string;
  gstRate: string;
  stock: string;
  lowStockAt: string;
  salePrice: string;
  purchasePrice: string;
  unit: string;
}

export default function AddProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    barcode: "",
    hsn: "",
    gstRate: "18",
    stock: "0",
    lowStockAt: "10",
    salePrice: "",
    purchasePrice: "",
    unit: "pcs",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const barcode = params.get('barcode') || ''
    const name = params.get('name') || ''
    const gstRate = params.get('gstRate') || '18'
    const stock = params.get('stock') || '0'
    const salePrice = params.get('salePrice') || ''
    const purchasePrice = params.get('purchasePrice') || ''
    const unit = params.get('unit') || 'pcs'

    if (!barcode && !name && !salePrice && !purchasePrice) return

    setFormData((prev) => ({
      ...prev,
      barcode: barcode || prev.barcode,
      name: name || prev.name,
      gstRate,
      stock,
      salePrice,
      purchasePrice,
      unit,
    }))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      const result = await createProduct({
        tenantId,
        name: formData.name,
        barcode: formData.barcode || undefined,
        hsn: formData.hsn || undefined,
        gstRate: parseFloat(formData.gstRate) || 0,
        stock: parseInt(formData.stock) || 0,
        lowStockAt: parseInt(formData.lowStockAt) || 10,
        salePrice: parseFloat(formData.salePrice) || 0,
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        unit: formData.unit,
      });

      if (!result.success) {
        setError(result.error || "Failed to create product");
        return;
      }

      router.push("/products");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      console.error("Failed to create product:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="grid h-10 w-10 place-items-center rounded-lg border border-input hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">Add Product</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
            Basic Details
          </h2>
          
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., Amul Taaza 1L"
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Barcode</label>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  placeholder="e.g., 8901262010129"
                  className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">HSN Code</label>
                <input
                  type="text"
                  name="hsn"
                  value={formData.hsn}
                  onChange={handleChange}
                  placeholder="e.g., 0401"
                  className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
            Pricing & Tax
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Sale Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <input
                  type="number"
                  name="salePrice"
                  value={formData.salePrice}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full h-11 rounded-lg border border-input bg-background pl-8 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Purchase Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <input
                  type="number"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full h-11 rounded-lg border border-input bg-background pl-8 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">GST Rate (%)</label>
              <select
                name="gstRate"
                value={formData.gstRate}
                onChange={handleChange}
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Unit</label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="pcs">Pieces (pcs)</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="L">Liter (L)</option>
                <option value="m">Meter (m)</option>
                <option value="box">Box</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
            Stock
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Current Stock</label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Low Stock Alert</label>
              <input
                type="number"
                name="lowStockAt"
                value={formData.lowStockAt}
                onChange={handleChange}
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Save Product
            </>
          )}
        </button>
      </form>
    </div>
  );
}
