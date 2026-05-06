"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, Phone, Plus, Users } from "lucide-react";
import { db } from "@/lib/billzo/db";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function PartiesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadParties();
  }, []);

  const loadParties = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }
      const data = await db().customers.where("tenantId").equals(tenantId).toArray();
      setParties(data);
    } catch (error) {
      console.error("Failed to load parties:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = parties.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));
  const totalPending = parties.reduce((s, p) => s + (p.pending || 0), 0);
  const oweMoney = parties.filter((p) => (p.pending || 0) > 0).length;

  const handleRemind = (party: any) => {
    console.log(`Reminder sent to ${party.name} on WhatsApp`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Parties</h1>
        <button
          onClick={() => router.push("/parties/add")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {parties.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6">
          <div className="text-sm opacity-80">Total pending (Udhar)</div>
          <div className="mt-2 text-4xl font-bold">{formatINR(totalPending)}</div>
          <div className="mt-2 text-xs opacity-80">{oweMoney} parties owe you money</div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parties"
            className="w-full h-11 rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {parties.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No parties yet</h3>
          <p className="text-muted-foreground mt-1">Add customers and suppliers to track transactions</p>
          <button
            onClick={() => router.push("/parties/add")}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium"
          >
            <Plus className="h-4 w-4" /> Add Party
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((p) => (
            <div key={p.id} className="p-4 flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-full font-semibold text-sm ${
                (p.pending || 0) > 0 ? "bg-orange-100 text-orange-600" : "bg-secondary text-muted-foreground"
              }`}>
                {p.name?.charAt(0) || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Phone className="h-3 w-3" /> {p.phone || "—"}
                  {p.type && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary">{p.type}</span>}
                </div>
              </div>
              <div className="text-right">
                {(p.pending || 0) > 0 ? (
                  <>
                    <div className="text-sm font-bold text-orange-600">{formatINR(p.pending)}</div>
                    <div className="text-[10px] text-muted-foreground">pending</div>
                  </>
                ) : (
                  <span className="text-xs text-green-600 font-medium">Settled ✓</span>
                )}
              </div>
              {(p.pending || 0) > 0 && (
                <button
                  onClick={() => handleRemind(p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Remind
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}