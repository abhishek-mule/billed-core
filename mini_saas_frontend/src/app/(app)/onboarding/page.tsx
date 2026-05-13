"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { autofillFromInput, validateGSTIN, validateUPI } from "@/lib/billzo/autofill";

interface AutofillData {
  shopName: string
  phone: string
  upiId?: string
  gstin?: string
}

export default function OnboardingPage() {
  const router = useRouter();
  const [shop, setShop] = useState("");
  const [upiId, setUpiId] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState<"idle" | "creating" | "done">("idle");
  const [errors, setErrors] = useState<{ shop?: string; upi?: string; gstin?: string }>({});
  const [autofilling, setAutofilling] = useState(false);

  useEffect(() => {
    function getCookie(name: string) {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
      return match ? match[2] : null
    }
    const tenantId = getCookie('bz_tenant')
    const accessToken = getCookie('bz_access')
    if (tenantId) {
      router.push("/dashboard");
    }
    if (!accessToken) {
      window.location.href = "/auth";
    }
  }, [router]);

  const handleAutofill = async () => {
    if (!upiId && !gstin) return;

    setAutofilling(true);
    setErrors({});

    try {
      if (gstin) {
        const gstValidation = validateGSTIN(gstin);
        if (!gstValidation.valid) {
          setErrors({ gstin: gstValidation.error });
          setAutofilling(false);
          return;
        }
      }

      if (upiId) {
        const upiValidation = validateUPI(upiId);
        if (!upiValidation.valid) {
          setErrors({ upi: upiValidation.error });
          setAutofilling(false);
          return;
        }
      }

      const data = await autofillFromInput({
        shopName: shop,
        phone,
        upiId,
        gstin,
      });

      if (data.shopName !== shop && data.inferredFrom !== 'manual') {
        setShop(data.shopName);
      }
    } catch (err) {
      console.error("Autofill error:", err);
    } finally {
      setAutofilling(false);
    }
  };

  const handleStart = async () => {
    const newErrors: { shop?: string; upi?: string; gstin?: string } = {};

    if (!shop.trim()) {
      newErrors.shop = "Shop name is required";
    } else if (shop.trim().length < 2) {
      newErrors.shop = "Shop name must be at least 2 characters";
    }

    if (gstin) {
      const gstValidation = validateGSTIN(gstin);
      if (!gstValidation.valid) {
        newErrors.gstin = gstValidation.error;
      }
    }

    if (upiId) {
      const upiValidation = validateUPI(upiId);
      if (!upiValidation.valid) {
        newErrors.upi = upiValidation.error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading("creating");
    setErrors({});

    try {
      function getCookie(name: string) {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
      return match ? match[2] : null
    }
    let userId = ''
    const accessToken = getCookie('bz_access')
    if (accessToken) {
      try { userId = JSON.parse(atob(accessToken.split('.')[1])).userId || '' } catch {}
    }
    if (!userId) {
      router.push("/auth");
      return;
    }

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopName: shop.trim(),
        phone: phone || undefined,
        upiId: upiId || undefined,
        gstin: gstin || undefined,
        userId,
      }),
    });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create shop");
      }

      setLoading("done");
      setTimeout(() => router.push("/dashboard"), 1700);
    } catch (error: any) {
      console.error("Failed to create tenant:", error);
      setErrors({ shop: error.message || "Failed to create shop. Please try again." });
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
              <p className="mt-1.5 text-sm text-muted-foreground">
                Just your shop name to start. Add more details later.
              </p>

              <div className="mt-7 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Shop name <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={shop}
                    onChange={(e) => {
                      setShop(e.target.value);
                      setErrors((prev) => ({ ...prev, shop: undefined }));
                    }}
                    placeholder="Ravi Electronics"
                    className={`mt-2 w-full rounded-xl border-2 bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${
                      errors.shop ? "border-red-500 focus:border-red-500" : "border-input focus:border-primary"
                    }`}
                  />
                  {errors.shop && (
                    <p className="mt-1 text-sm text-red-500">{errors.shop}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Phone (optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="9876543210"
                    className="mt-2 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base font-medium focus:border-primary focus:outline-none transition-colors"
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-muted-foreground">
                      Auto-fill with UPI or GSTIN (optional)
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    UPI ID
                  </label>
                  <input
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value);
                      setErrors((prev) => ({ ...prev, upi: undefined }));
                    }}
                    placeholder="9876543210@upi"
                    className={`mt-2 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${
                      errors.upi ? "border-red-500 focus:border-red-500" : "focus:border-primary"
                    }`}
                  />
                  {errors.upi && (
                    <p className="mt-1 text-sm text-red-500">{errors.upi}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    GSTIN
                  </label>
                  <input
                    value={gstin}
                    onChange={(e) => {
                      setGstin(e.target.value.toUpperCase());
                      setErrors((prev) => ({ ...prev, gstin: undefined }));
                    }}
                    placeholder="27ABCDE1234F1Z5"
                    maxLength={15}
                    className={`mt-2 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base font-medium focus:outline-none transition-colors ${
                      errors.gstin ? "border-red-500 focus:border-red-500" : "focus:border-primary"
                    }`}
                  />
                  {errors.gstin && (
                    <p className="mt-1 text-sm text-red-500">{errors.gstin}</p>
                  )}
                </div>

                <button
                  onClick={handleAutofill}
                  disabled={!upiId && !gstin || autofilling}
                  className="w-full px-4 py-2 text-sm text-primary hover:bg-gray-50 rounded-lg border border-border flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {autofilling ? "Auto-filling..." : "Auto-fill from UPI/GSTIN"}
                </button>

                <button
                  className="mt-7 w-full px-4 py-3 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={handleStart}
                  disabled={!shop.trim() || loading === "creating"}
                >
                  {loading === "creating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Start Billing
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-white shadow-lg p-10 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-600 animate-in zoom-in-95">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-bold">You&apos;re all set!</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Setting up your pricing plan...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
