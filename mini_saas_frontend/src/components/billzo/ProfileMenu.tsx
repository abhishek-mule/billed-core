'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Store, CreditCard, MessageCircle, Crown, Users, Settings,
  HelpCircle, MessageSquare, LogOut, Wifi, CheckCircle2,
  XCircle, IndianRupee, ArrowRight, BarChart3,
} from 'lucide-react'
import { BrandAvatar } from './Avatar'
import { getCookie } from '@/lib/cookies'
import { getTenantId } from '@/lib/billzo/tenant'
import { db } from '@/lib/billzo/db'
import { PLAN_LIMITS } from '@/lib/billzo/plan-limits'

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter Plan',
  pro: 'Pro Plan',
  business: 'Business Plan',
  enterprise: 'Enterprise',
}

interface ProfileMenuProps {
  onClose: () => void
  onLogout: () => void
}

interface ConnectionStatus {
  label: string
  icon: typeof Wifi
  ok: boolean
}

export function ProfileMenu({ onClose, onLogout }: ProfileMenuProps) {
  const [userName, setUserName] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [outstanding, setOutstanding] = useState<number | null>(null)
  const [plan, setPlan] = useState<string>('starter')
  const [usageCount, setUsageCount] = useState<number>(0)

  useEffect(() => {
    const name = getCookie('bz_tenant_name')
    setUserName(name ? decodeURIComponent(name) : 'My Shop')

    const tid = getTenantId()
    if (tid) {
      db().tenants.get(tid).then(t => {
        if (t?.logo) setLogo(t.logo)
        if (t?.plan) setPlan(t.plan)
      })
    }

    fetch('/api/recovery/workspace')
      .then(r => r.json())
      .then(d => {
        const total = d?.hero?.outstanding ?? null
        setOutstanding(total)
      })
      .catch(() => {})
  }, [])

  const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.reminders ?? 5
  const planLabel = PLAN_LABELS[plan] ?? 'Starter Plan'
  const daysLeft = 23

  const connections: ConnectionStatus[] = [
    { label: 'WhatsApp', icon: MessageCircle, ok: true },
    { label: 'Payment Gateway', icon: CreditCard, ok: true },
    { label: 'UPI', icon: IndianRupee, ok: true },
  ]

  const menuItems = [
    { href: '/settings/business', icon: Store, label: 'Business Profile', sub: 'GST, Address, Logo' },
    { href: '/settings/payments', icon: CreditCard, label: 'Receive Payments', sub: 'UPI, Bank, Cash' },
    { href: '/settings/whatsapp', icon: MessageCircle, label: 'WhatsApp', sub: 'Connected ✓' },
    { href: '/pricing', icon: Crown, label: 'Plans & Billing', sub: `${planLabel} · ${daysLeft}d left` },
    { href: '/settings/team', icon: Users, label: 'Team Members', sub: 'Staff & Permissions' },
    { href: '/settings/billing', icon: BarChart3, label: 'Usage', sub: 'Invoices · Reminder balance' },
    { href: '/settings', icon: Settings, label: 'Settings' },
    { href: '/settings/help', icon: HelpCircle, label: 'Help & Support' },
    { href: '/settings', icon: MessageSquare, label: 'Send Feedback' },
  ]

  return (
    <div className="bz-modal-backdrop" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto' }}
      >
        {/* Merchant header */}
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <BrandAvatar name={userName || 'My Shop'} logo={logo} className="w-10 h-10" size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{userName}</p>
          </div>
        </div>

        {/* Outstanding stat */}
        {outstanding !== null && outstanding > 0 && (
          <div className="px-4 py-3 bg-primary/5 border-b border-border">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Outstanding Today</p>
            <p className="text-xl font-bold text-primary mt-0.5">₹{outstanding.toLocaleString('en-IN')}</p>
          </div>
        )}

        {/* Subscription card */}
        <Link
          href="/pricing"
          onClick={onClose}
          className="block px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subscription</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground">{planLabel}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, (usageCount / limit) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{usageCount}/{limit} actions</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{daysLeft} days remaining</p>
        </Link>

        {/* Connection health */}
        <div className="px-4 py-3 border-b border-border space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            System Status
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {connections.map(c => (
              <div key={c.label} className="flex items-center gap-1.5">
                {c.ok
                  ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                  : <XCircle className="w-3 h-3 text-danger shrink-0" />
                }
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Menu items */}
        <div className="py-2">
          {menuItems.map((item, i) => (
            <Link
              key={i}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{item.label}</span>
                {item.sub && (
                  <span className="text-xs text-muted-foreground ml-2">{item.sub}</span>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Logout */}
        <div className="border-t border-border p-2">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm text-danger hover:bg-danger-soft transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
