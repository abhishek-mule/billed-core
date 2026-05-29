"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Store, ArrowRight } from "lucide-react";
import { UsagePill } from "@/components/billzo/UsagePill";
import { Loader } from "@/components/billzo/Loader";
import { getCookie } from "@/lib/cookies";
import { AttentionFeed } from "@/components/attention-feed/AttentionFeed";

function getTenantName() {
  const raw = getCookie("bz_tenant_name");
  if (!raw) return null;
  try { return decodeURIComponent(raw) } catch { return raw }
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    const name = getTenantName();
    setTenantName(name);

    const userId = getCookie("bz_user_id");
    const tenantId = getCookie("bz_tenant");
    if (userId) localStorage.setItem("userId", userId);
    if (tenantId) {
      localStorage.setItem("tenantId", tenantId);
      if (name) localStorage.setItem("tenantName", name);
    }

    setLoading(false);
  }, []);

  const displayName = tenantName || "My Shop";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {tenantName && (
            <Image
              unoptimized
              src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(tenantName)}`}
              alt={displayName}
              width={48}
              height={48}
              className="rounded-2xl border-2 border-primary/10 shadow-sm"
            />
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{displayName}</h1>
            <p className="text-xs text-muted-foreground">
              {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}
            </p>
          </div>
        </div>
        <UsagePill />
      </div>

      <AttentionFeed />
    </div>
  );
}
