"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Zap, ArrowUpRight } from "lucide-react";
import { getUsageLimits } from "@/lib/billzo/usage";

export function UsagePill() {
  const router = useRouter();
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        setLoading(false);
        return;
      }
      const limits = await getUsageLimits(tenantId);
      setUsage(limits);
    } catch (error) {
      console.error("Failed to load usage:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !usage) return null;

  if (usage.isPaid) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200">
        <Sparkles className="h-4 w-4 text-yellow-600" />
        <span className="text-sm font-semibold text-yellow-800">Pro</span>
        <span className="text-xs text-yellow-600">Unlimited</span>
      </div>
    );
  }

  const invoicesLeft = usage.invoiceLimit - usage.currentInvoiceCount;
  const remindersLeft = usage.reminderLimit - usage.currentReminderCount;
  const isApproachingLimit = invoicesLeft <= 1 || remindersLeft <= 2;

  return (
    <div 
      onClick={() => router.push("/pricing")}
      className={`inline-flex items-center gap-3 px-3 py-1.5 rounded-full border cursor-pointer transition-all hover:scale-105 ${
        isApproachingLimit 
          ? "bg-orange-50 border-orange-200 animate-pulse" 
          : "bg-secondary border-border"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Zap className={`h-4 w-4 ${isApproachingLimit ? "text-orange-500" : "text-muted-foreground"}`} />
        <span className={`text-sm font-medium ${isApproachingLimit ? "text-orange-700" : "text-foreground"}`}>
          Free Plan
        </span>
      </div>
      
      <div className="h-4 w-px bg-border" />
      
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          <span className={`font-semibold ${invoicesLeft <= 1 ? "text-orange-600" : "text-foreground"}`}>
            {usage.currentInvoiceCount}
          </span>/{usage.invoiceLimit} invoices
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="text-muted-foreground">
          <span className={`font-semibold ${remindersLeft <= 2 ? "text-orange-600" : "text-foreground"}`}>
            {usage.currentReminderCount}
          </span>/{usage.reminderLimit} reminders
        </span>
      </div>

      <ArrowUpRight className={`h-3.5 w-3.5 ${isApproachingLimit ? "text-orange-500" : "text-muted-foreground"}`} />
    </div>
  );
}