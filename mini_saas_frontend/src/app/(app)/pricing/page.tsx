"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { db, uuid } from "@/lib/billzo/db";

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "forever",
    description: "Perfect to get started",
    features: [
      "3 free invoices",
      "10 reminders/month",
      "Basic POS",
      "Offline support",
    ],
    cta: "Current Plan",
    highlight: false,
  },
  {
    name: "Pro",
    price: "₹399",
    period: "/month",
    description: "For growing businesses",
    features: [
      "Unlimited invoices",
      "500 reminders/month",
      "Auto Recovery Mode",
      "Priority support",
      "Payment analytics",
      "Multi-device sync",
    ],
    cta: "Upgrade Now",
    highlight: true,
  },
];

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    // Load Razorpay checkout script
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleUpgrade = async () => {
    setLoading("pro");
    
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }

      const tenantName = localStorage.getItem("tenantName") || "Business";

      // Create subscription order
      const res = await fetch("/api/payment/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, tenantName }),
      });

      const data = await res.json();

      if (data.mock) {
        // Demo mode - no Razorpay keys configured
        await handleDemoUpgrade(tenantId);
        return;
      }

      // Open Razorpay checkout
      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || data.key_id,
        subscription_id: data.subscriptionId,
        name: "BillZo Pro",
        description: "₹399/month - Auto Recovery + Unlimited Invoices",
        handler: async (response: any) => {
          // Payment successful - verify with backend
          await handlePaymentSuccess(tenantId, response.razorpay_subscription_id);
        },
        prefill: {
          name: tenantName,
        },
        theme: {
          color: "#f59e0b",
        },
      });

      razorpay.open();

    } catch (error) {
      console.error("Upgrade failed:", error);
      alert("Upgrade failed. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleDemoUpgrade = async (tenantId: string) => {
    // Demo mode - simulate successful payment
    await new Promise(resolve => setTimeout(resolve, 1000));

    await db().tenants.update(tenantId, {
      plan: "pro",
      paywallUnlocked: true,
      updatedAt: new Date().toISOString(),
    });

    localStorage.setItem("isPaid", "true");
    alert("Upgraded to Pro successfully! (Demo Mode)");
    router.push("/dashboard");
  };

  const handlePaymentSuccess = async (tenantId: string, subscriptionId: string) => {
    // Verify payment and activate subscription
    // In production, call backend to verify and activate
    await db().tenants.update(tenantId, {
      plan: "pro",
      paywallUnlocked: true,
      subscriptionId,
      subscriptionStatus: "active",
      updatedAt: new Date().toISOString(),
    });

    localStorage.setItem("isPaid", "true");
    alert("Payment successful! You're now on Pro.");
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center text-white mb-12">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-4 py-2 rounded-full mb-6">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Simple pricing</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Choose your plan
          </h1>
          <p className="text-white/80 text-lg max-w-md mx-auto">
            Start free, upgrade when you&apos;re ready. No hidden fees.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl p-8 ${
                plan.highlight
                  ? "ring-4 ring-yellow-400 shadow-2xl scale-105"
                  : "shadow-xl"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </div>
              )}

              <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-gray-900">
                  {plan.price}
                </span>
                <span className="text-gray-500">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">{plan.description}</p>

              <ul className="mt-8 space-y-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="grid h-5 w-5 place-items-center rounded-full bg-green-100 text-green-600">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-sm text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={plan.highlight ? handleUpgrade : () => router.back()}
                disabled={loading === plan.name.toLowerCase()}
                className={`mt-8 w-full py-3 rounded-xl font-medium transition-all ${
                  plan.highlight
                    ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:from-yellow-500 hover:to-orange-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                } disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loading === plan.name.toLowerCase() && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-white/60 text-sm mt-12">
          7-day money-back guarantee • Cancel anytime
        </p>
      </div>
    </div>
  );
}