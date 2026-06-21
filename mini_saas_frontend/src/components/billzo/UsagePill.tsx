"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Zap, ArrowUpRight, Loader2 } from "lucide-react";

export function UsagePill() {
  const router = useRouter();
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    try {
      const res = await fetch('/api/paywall/enforce')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setPlan(data.plan)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  };

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (plan !== 'starter') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          {plan === 'growth' ? 'Growth' : 'Pro'} Plan
        </span>
        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Unlimited</span>
      </div>
    );
  }

  return (
    <div 
      onClick={() => router.push("/pricing")}
      className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full border bg-card border-border shadow-sm cursor-pointer transition-all hover:border-primary/30"
    >
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground">Free Plan</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground">Unlimited invoices &amp; reminders</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
