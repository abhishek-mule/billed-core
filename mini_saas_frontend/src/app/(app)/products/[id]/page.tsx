"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Trash2, AlertTriangle } from "lucide-react";
import { getTenantId } from "@/lib/billzo/tenant";
import { db } from "@/lib/billzo/db";
import { updateProduct, deleteProduct } from "@/lib/billzo/products-service";

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

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadProduct = async () => {
    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      const product = await db().products.get(id);
      if (!product) {
        setError("Product not found");
        setLoading(false);
        return;
      }

      if (product.tenantId !== tenantId) {
        setError("Unauthorized to view this product");
        setLoading(false);
        return;
      }

      setFormData({
        name: product.name || "",
        barcode: product.barcode || "",
        hsn: product.hsn || "",
        gstRate: String(product.gstRate ?? "18"),
        stock: String(product.stock ?? "0"),
        lowStockAt: String(product.lowStockAt ?? "10"),
        salePrice: String(product.salePrice ?? ""),
        purchasePrice: String(product.purchasePrice ?? ""),
        unit: product.unit || "pcs",
      });
    } catch (err: any) {
      console.error("Failed to load product:", err);
      setError("Failed to load product details");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      const result = await updateProduct(id, tenantId, {
        name: formData.name.trim(),
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
        setError(result.error || "Failed to update product");
        return;
      }

      setSuccess("Product updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      console.error("Failed to update product:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");

    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      const result = await deleteProduct(id, tenantId);
      if (!result.success) {
        setError(result.error || "Failed to delete product");
        setDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }

      router.push("/products");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      console.error("Failed to delete product:", err);
      setDeleting(false);
      setShowDeleteConfirm(false);
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
    <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="grid h-10 w-10 place-items-center rounded-lg border border-input hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Edit Product</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage details and inventory levels</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="h-10 px-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 text-sm font-semibold"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
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
          disabled={saving}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving Changes...
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Save Changes
            </>
          )}
        </button>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-xl p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-destructive">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold">Delete Product?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{formData.name}"</span>? This action will remove the product and cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl border border-input font-semibold text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl bg-destructive font-semibold text-sm text-white hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
