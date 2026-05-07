"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/billzo/db";

export default function OnboardingPage() {
  const router = useRouter();
  const [shop, setShop] = useState("");
  const [loading, setLoading] = useState<"idle" | "creating" | "done">("idle");

  useEffect(() => {
    const tenantId = localStorage.getItem("tenantId");
    if (tenantId) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleStart = async () => {
    if (!shop.trim()) return;
    setLoading("creating");

    try {
      const tenantId = `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await db().tenants.add({
        id: tenantId,
        name: shop.trim(),
        ownerUserId: `user-${Date.now()}`,
        plan: "starter",
        paywallUnlocked: true,
        invoiceCount: 0,
        reminderCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      localStorage.setItem("tenantId", tenantId);
      localStorage.setItem("tenantName", shop.trim());

      setLoading("done");
      setTimeout(() => router.push("/dashboard"), 1700);
    } catch (error) {
      console.error("Failed to create tenant:", error);
      setLoading("idle");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col">
      <header className="container py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-green-500 to-green-600 text-white">
            <Store className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold">BillZo</span>
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-4 pb-16">
        <div className="w-full max-w-md animate-in zoom-in-95 duration-300">
          {loading === "idle" || loading === "creating" ? (
            <div className="rounded-2xl border border-border bg-white shadow-lg p-7">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
                <Store className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-2xl font-bold tracking-tight">Set up your shop</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Just two quick fields. You can change everything later.</p>

              <label className="mt-7 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Shop name <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                placeholder="Ravi Electronics"
                className="mt-2 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base font-medium focus:border-primary focus:outline-none transition-colors"
              />

              

              <button
                className="mt-7 w-full px-4 py-3 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-lg font-medium"
                onClick={handleStart}
                disabled={!shop.trim() || loading === "creating"}
              >
                {loading === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Billing"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-white shadow-lg p-10 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-600 animate-in zoom-in-95">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-bold">You&apos;re all set!</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Opening POS…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}