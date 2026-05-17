"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, Phone, Plus, Loader2, Upload, Users } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { getUsageLimits, incrementReminderCount } from "@/lib/billzo/usage";
import { PaywallModal } from "@/components/billzo/PaywallModal";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function PartiesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usageLimits, setUsageLimits] = useState<any>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) {
        router.push("/auth");
        return;
      }
      const [data, usage] = await Promise.all([
        db().customers.where("tenantId").equals(tenantId).toArray(),
        getUsageLimits(tenantId),
      ]);
      setCustomers(data);
      setUsageLimits(usage);
    } catch (error) {
      console.error("Failed to load customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));
  const totalPending = 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-gradient-to-br from-green-500 to-green-600 text-white p-6 shadow-lg flex-1">
          <div className="text-sm opacity-80">Total pending (Udhar)</div>
          <div className="mt-2 text-4xl font-bold">{formatINR(totalPending)}</div>
          <div className="mt-2 text-xs opacity-80">{customers.filter((p) => p.pending > 0).length} parties owe you money</div>
        </div>
        <button
          onClick={() => router.push('/parties/import')}
          className="ml-4 h-14 w-14 rounded-2xl border-2 border-indigo-200 bg-indigo-50 flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 transition-colors"
        >
          <Upload className="h-5 w-5 text-indigo-600" />
          <span className="text-[10px] font-bold text-indigo-600">Import</span>
        </button>
      </div>

      <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search parties"
                  className="w-full h-11 rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={() => router.push('/parties/add')}
                className="h-11 px-4 bg-primary text-primary-foreground rounded-xl font-medium flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>

      {customers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <h3 className="text-lg font-semibold">No parties yet</h3>
          <p className="text-muted-foreground mt-1">Add customers and suppliers</p>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium">
            <Plus className="h-4 w-4" /> Add Party
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((p) => (
            <div key={p.id} className="p-4 flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-full font-semibold text-sm ${
                p.pending > 0 ? "bg-yellow-100 text-yellow-700" : "bg-secondary text-muted-foreground"
              }`}>
                {p.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Phone className="h-3 w-3" /> {p.phone}
                </div>
              </div>
              <div className="text-right">
                {p.pending > 0 ? (
                  <>
                    <div className="text-sm font-bold text-yellow-700">{formatINR(p.pending)}</div>
                    <div className="text-[10px] text-muted-foreground">pending</div>
                  </>
                ) : (
                  <span className="text-xs text-green-600 font-medium">Settled ✓</span>
                )}
              </div>
              {p.pending > 0 && (
                <button
                  className="px-3 py-1.5 border border-input rounded-lg font-medium text-sm"
                  onClick={async () => {
                    const getCookie = (name: string) => {
                      if (typeof document === 'undefined') return null
                      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
                      return match ? match[2] : null
                    }
                    const tenantId = getCookie('bz_tenant')
                    if (!tenantId) return;

                    const limits = await getUsageLimits(tenantId);
                    if (!limits.canSendReminder) {
                      setShowPaywall(true);
                      return;
                    }

                    console.log(`Reminder sent to ${p.name} on WhatsApp`);
                    await incrementReminderCount(tenantId);
                    const newLimits = await getUsageLimits(tenantId);
                    setUsageLimits(newLimits);
                  }}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Remind
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <PaywallModal
        type="reminder"
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        currentCount={usageLimits?.currentReminderCount || 0}
        limit={usageLimits?.reminderLimit || 10}
      />
    </div>
  );
}