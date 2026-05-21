"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Store, Receipt, MessageCircle, Users, Shield, ChevronRight, LogOut, Printer, Send, Loader2 } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/billzo/db";
import { getTenantId } from "@/lib/billzo/tenant";

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

function clearAllCookies() {
  const cookies = ['bz_access', 'bz_refresh', 'bz_tenant', 'bz_tenant_name', 'bz_user_id', 'bz_prefs']
  cookies.forEach(name => {
    document.cookie = `${name}=; Max-Age=0; path=/`
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${window.location.hostname}`
  })
}

export default function SettingsPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({
    defaultAction: "whatsapp",
    printFormat: "thermal80",
    autoPrint: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const tenantId = getTenantId();
      const userId = getCookie('bz_user_id');
      if (!tenantId || !userId) {
        router.push("/auth");
        return;
      }

      const data = await db().tenants.get(tenantId);
      setTenant(data);

      const savedPrefs = getCookie('bz_prefs');
      if (savedPrefs) {
        try {
          setPrefs(JSON.parse(savedPrefs));
        } catch {
          // ignore parse errors
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updatePref = (key: string, value: any) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setCookie('bz_prefs', JSON.stringify(newPrefs));
  };

  const handleSignOut = () => {
    clearAllCookies();
    localStorage.clear();
    router.push("/auth");
  };

  const actionOpts: { key: string; label: string }[] = [
    { key: "whatsapp", label: "Send WhatsApp" },
    { key: "print", label: "Print" },
    { key: "ask", label: "Ask every time" },
  ];

  const formatOpts: { key: string; label: string }[] = [
    { key: "thermal80", label: "Thermal 80mm" },
    { key: "thermal58", label: "Thermal 58mm" },
    { key: "a4", label: "A4" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xl font-bold">
          {tenant?.name?.charAt(0) || "M"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{tenant?.name || "My Shop"}</div>
          <div className="text-xs text-muted-foreground">{tenant?.phone || "+91 98765 43210"} · {tenant?.plan || "Starter"} plan</div>
        </div>
        <span className="rounded-full bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1">Active</span>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Delivery & Print
        </div>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                <Send className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Default action after billing</div>
                <div className="text-xs text-muted-foreground">What happens the moment a sale is done</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {actionOpts.map((o) => (
                <button
                  key={o.key}
                  onClick={() => updatePref("defaultAction", o.key)}
                  className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                    prefs.defaultAction === o.key ? "border-primary bg-primary/5 text-primary" : "border-input hover:border-primary/40"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                <Printer className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Default print format</div>
                <div className="text-xs text-muted-foreground">Used for auto-print and quick print</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {formatOpts.map((o) => (
                <button
                  key={o.key}
                  onClick={() => updatePref("printFormat", o.key)}
                  className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                    prefs.printFormat === o.key ? "border-primary bg-primary/5 text-primary" : "border-input hover:border-primary/40"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <label className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/40">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
              <Printer className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Auto-print after billing</div>
              <div className="text-xs text-muted-foreground">Triggers print dialog on sale completion</div>
            </div>
            <input
              type="checkbox"
              checked={prefs.autoPrint}
              onChange={(e) => updatePref("autoPrint", e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Business</div>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          <Link href="/settings/whatsapp" className="w-full p-4 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-100 text-green-600">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">WhatsApp</div>
              <div className="text-xs text-muted-foreground">API key, templates, auto-send</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Account</div>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="w-full p-4 flex items-center gap-3 text-left opacity-50 cursor-not-allowed">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
              <Users className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Users & roles</div>
              <div className="text-xs text-muted-foreground">Coming soon</div>
            </div>
          </div>
          <div className="w-full p-4 flex items-center gap-3 text-left opacity-50 cursor-not-allowed">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
              <Shield className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Security</div>
              <div className="text-xs text-muted-foreground">Coming soon</div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full rounded-2xl border border-red-300 bg-red-50 p-4 flex items-center justify-center gap-2 text-red-600 font-medium hover:bg-red-100 transition-colors"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
