"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, FileText, CheckCircle2, Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import { db } from "@/lib/billzo/db";
import Tesseract from "tesseract.js";

type Step = "scan" | "extracting" | "verify" | "saved";

export default function PurchasesPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("scan");
  const [loading, setLoading] = useState(true);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);
  const [data, setData] = useState({
    supplier: "",
    invoiceNo: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    gst: "18%",
  });

  useEffect(() => {
    loadPurchases();
  }, []);

  const loadPurchases = async () => {
    try {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const tenantId = getCookie('bz_tenant');
      if (!tenantId) {
        router.push("/login");
        return;
      }
      const data = await db().purchases.where("tenantId").equals(tenantId).toArray();
      setRecentPurchases(data.slice(0, 5));
    } catch (error) {
      console.error("Failed to load purchases:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("extracting");
    
    try {
      // Create local URL for Tesseract
      const imageUrl = URL.createObjectURL(file);
      
      const result = await Tesseract.recognize(imageUrl, 'eng', {
        logger: m => console.log(m)
      });
      
      const text = result.data.text;
      console.log("OCR Result:", text);
      
      // Simple Regex heuristics to extract data from raw OCR text
      // In production, an LLM API like GPT-4o-mini would be much more reliable
      let extractedAmount = "0";
      let extractedSupplier = "Unknown Supplier";
      
      const amountMatch = text.match(/(?:total|amount|amt|grand total)[\s:]*([0-9,.]+)/i);
      if (amountMatch) {
        extractedAmount = amountMatch[1].replace(/,/g, '');
      }

      // Try to find supplier (usually first line or after certain keywords)
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        extractedSupplier = lines[0]; // first line is often the company name
      }

      setData(prev => ({
        ...prev,
        amount: extractedAmount,
        supplier: extractedSupplier,
        invoiceNo: `INV-${Math.floor(Math.random() * 10000)}`
      }));

      setStep("verify");
      URL.revokeObjectURL(imageUrl);
    } catch (error) {
      console.error("OCR failed:", error);
      alert("Failed to read invoice. Please enter details manually.");
      setStep("verify");
    }
  };

  const save = async () => {
    try {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const tenantId = getCookie('bz_tenant');
      if (!tenantId) return;

      await db().purchases.add({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tenantId,
        supplier: data.supplier,
        amount: parseFloat(data.amount.replace(/,/g, "")) || 0,
        gstin: "",
        source: "scan",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
        version: 1,
      });

      setStep("saved");
      console.log("Purchase saved · 10 min saved ✨");
      setTimeout(() => {
        setStep("scan");
        loadPurchases();
      }, 1800);
    } catch (error) {
      console.error("Failed to save purchase:", error);
      console.error("Failed to save purchase");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-2xl mx-auto">
      <div className="text-sm text-muted-foreground">Scan a supplier invoice — we&apos;ll extract everything for you.</div>

      {step === "scan" && (
        <div className="mt-5 space-y-4 relative">
          <label className="w-full rounded-2xl border-2 border-dashed border-input bg-card p-8 flex flex-col items-center gap-3 hover:border-primary transition-colors cursor-pointer group">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Camera className="h-8 w-8" />
            </div>
            <div className="text-lg font-bold">Scan Invoice</div>
            <div className="text-xs text-muted-foreground text-center">Take a photo or upload an image<br/>(Powered by Tesseract OCR)</div>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              className="hidden" 
              onChange={handleImageUpload} 
            />
          </label>
        </div>
      )}

      {step === "extracting" && (
        <div className="mt-12 grid place-items-center text-center animate-in fade-in">
          <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
            <Sparkles className="h-9 w-9 animate-pulse" />
          </div>
          <h2 className="mt-5 text-xl font-bold">Reading your invoice…</h2>
          <p className="mt-1 text-sm text-muted-foreground">Extracting supplier, line items, tax</p>
        </div>
      )}

      {step === "verify" && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-6 animate-in scale-in">
          <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Extracted successfully
          </div>
          <h2 className="mt-3 font-bold text-lg">Verify the details</h2>

          <div className="mt-5 space-y-4">
            {[
              { k: "supplier", label: "Supplier" },
              { k: "invoiceNo", label: "Invoice #" },
              { k: "date", label: "Date" },
              { k: "amount", label: "Amount (₹)" },
              { k: "gst", label: "GST" },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">{f.label}</label>
                <input
                  value={(data as any)[f.k]}
                  onChange={(e) => setData({ ...data, [f.k]: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button className="flex-1 px-4 py-2 border border-input rounded-xl font-medium" onClick={() => setStep("scan")}>Cancel</button>
            <button className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium" onClick={save}>Save purchase</button>
          </div>
        </div>
      )}

      {step === "saved" && (
        <div className="mt-12 grid place-items-center text-center animate-in scale-in">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-green-500 text-white shadow-lg">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mt-5 text-xl font-bold">Saved!</h2>
          <p className="mt-1 text-sm text-green-600">You just saved 10 minutes of typing</p>
        </div>
      )}

      {step === "scan" && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent</h3>
          {recentPurchases.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              No recent purchases
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              {recentPurchases.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-4">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{p.supplier}</div>
                    <div className="text-xs text-muted-foreground">{p.invoiceNo}</div>
                  </div>
                  <div className="text-sm font-bold">{formatINR(p.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}