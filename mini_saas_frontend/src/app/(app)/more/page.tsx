"use client";

import { TrendingUp, Bell, Activity, Users, BarChart3, Settings as SettingsIcon, ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";

const items = [
  { href: "/cashflow", label: "Cashflow", icon: TrendingUp, desc: "Receivables & recovery" },
  { href: "/pulse", label: "Pulse", icon: Activity, desc: "Real-time payment stream" },
  { href: "/send", label: "Send", icon: Bell, desc: "Broadcasts & reminders" },
  { href: "/purchases", label: "Purchases", icon: ShoppingBag, desc: "Scan supplier invoices" },
  { href: "/parties", label: "Customers", icon: Users, desc: "Customers & suppliers" },
  { href: "/reports", label: "Reports", icon: BarChart3, desc: "GST & sales" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, desc: "Shop, users, security" },
];

export default function MorePage() {
  return (
    <div className="px-4 py-5 max-w-md mx-auto space-y-2">
      {items.map(({ href, label, icon: Icon, desc }) => (
        <Link
          key={href}
          href={href}
          className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/30 transition-colors"
        >
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}