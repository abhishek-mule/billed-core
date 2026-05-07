"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Lock, Loader2, Check } from "lucide-react";
import { db } from "@/lib/billzo/db";

interface PaywallModalProps {
  type: "invoice" | "reminder";
  open: boolean;
  onClose: () => void;
  currentCount: number;
  limit: number;
}

export function PaywallModal({ type, open, onClose, currentCount, limit }: PaywallModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }

      // Simulate payment (in production, integrate with Razorpay/Stripe)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Update tenant to pro
      await db().tenants.update(tenantId, {
        plan: "pro",
        paywallUnlocked: true,
        updatedAt: new Date().toISOString(),
      });

      localStorage.setItem("isPaid", "true");
      setUpgraded(true);
      
      setTimeout(() => {
        onClose();
        setUpgraded(false);
      }, 1500);

    } catch (error) {
      console.error("Upgrade failed:", error);
      alert("Upgrade failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const whatYouUsed = type === "invoice" ? "invoices" : "reminders";
  const whatYouGet = type === "invoice" ? "Unlimited invoices" : "Unlimited reminders";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>

        <div className="p-8 text-center">
          {upgraded ? (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">Upgraded to Pro!</h2>
              <p className="mt-2 text-gray-500">Redirecting...</p>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-white" />
              </div>

              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                You&apos;ve used your free {whatYouUsed}
              </h2>
              <p className="mt-2 text-gray-500">
                You&apos;ve created {currentCount} {whatYouUsed}. Upgrade to Pro for {whatYouGet}.
              </p>

              <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Pro Plan</span>
                  <span className="text-2xl font-bold text-gray-900">₹299<span className="text-sm font-normal text-gray-500">/mo</span></span>
                </div>
              </div>

              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="mt-6 w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-medium hover:from-yellow-500 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Unlock Pro for ₹299/mo
                  </>
                )}
              </button>

              <button
                onClick={onClose}
                className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Maybe later
              </button>

              <p className="mt-4 text-xs text-gray-400">
                Or go to Settings → Pricing to compare plans
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}