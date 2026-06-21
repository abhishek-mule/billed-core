"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Store, Receipt, MessageCircle, Users, Shield, ChevronRight, LogOut,
  Search, Clock, Download, Trash2, Zap, CheckCircle2, AlertCircle, XCircle,
  Wifi, Sun, Moon,
} from "lucide-react"
import { useTheme } from "@/lib/billzo/theme"
import { Button } from "@/components/billzo/Button"
import { db } from "@/lib/billzo/db"
import { getCookie, clearAuthCookies } from "@/lib/cookies"

type CategoryStatus = 'connected' | 'not_connected' | 'pending'

interface Category {
  id: string
  href: string
  icon: React.ReactNode
  title: string
  description: string
  status?: CategoryStatus
  statusLabel?: string
  danger?: boolean
}

const ICON_CLASS = "w-5 h-5"
const ICON_WRAPPER = "w-10 h-10 rounded-lg flex items-center justify-center shrink-0"

export default function SettingsPage() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [tenant, setTenant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const tenantId = getCookie('bz_tenant')
        const userId = getCookie('bz_user_id')
        if (!tenantId || !userId) { router.push('/auth'); return }
        const data = await db().tenants.get(tenantId)
        setTenant(data)
      } catch {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSignOut = () => {
    clearAuthCookies()
    localStorage.clear()
    router.push('/auth')
  }

  const categories: Category[] = useMemo(() => [
    {
      id: 'business',
      href: '/settings/business',
      icon: <Store className={ICON_CLASS} />,
      title: 'Business Profile',
      description: 'Shop name, address, GST, PAN, UPI ID',
    },
    {
      id: 'billing',
      href: '/settings/billing',
      icon: <Receipt className={ICON_CLASS} />,
      title: 'Billing & Invoice',
      description: 'Default actions, print format, white-label',
    },
    {
      id: 'whatsapp',
      href: '/settings/whatsapp',
      icon: <MessageCircle className={ICON_CLASS} />,
      title: 'WhatsApp',
      description: 'Connect WhatsApp, manage templates, auto-send',
      status: tenant?.whatsappConfig?.whatsappProvider ? 'connected' as CategoryStatus : 'not_connected' as CategoryStatus,
      statusLabel: tenant?.whatsappConfig?.whatsappProvider ? 'Connected' : 'Not Connected',
    },
    {
      id: 'recovery',
      href: '/settings/recovery',
      icon: <Clock className={ICON_CLASS} />,
      title: 'UDHARI Recovery',
      description: 'Auto-reminders, business hours, reminder tone',
    },
    {
      id: 'team',
      href: '/settings/team',
      icon: <Users className={ICON_CLASS} />,
      title: 'Team & Access',
      description: 'Users, roles, permissions',
    },
    {
      id: 'network',
      href: '/settings/network',
      icon: <Wifi className={ICON_CLASS} />,
      title: 'Network & Sync',
      description: 'Connection status, offline queue, sync health',
    },
    {
      id: 'data',
      href: '/settings/data',
      icon: <Download className={ICON_CLASS} />,
      title: 'Data & Privacy',
      description: 'Export data, manage storage',
      danger: true,
    },
  ], [tenant])

  const filtered = useMemo(() => {
    if (!q.trim()) return categories
    const query = q.toLowerCase()
    return categories.filter(c =>
      c.title.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query)
    )
  }, [categories, q])

  const STATUS_STYLES: Record<CategoryStatus, string> = {
    connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    not_connected: 'bg-amber-50 text-amber-700 border-amber-200',
    pending: 'bg-muted/50 text-muted-foreground border-border',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-16 bg-card border border-border rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-card border border-rose-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-rose-600 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Try Again</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* Shop identity banner */}
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-foreground text-background flex items-center justify-center text-base font-bold shrink-0">
            {tenant?.name?.charAt(0) || 'S'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{tenant?.name || 'My Shop'}</p>
            <p className="text-xs text-muted-foreground">{tenant?.phone || ''}{tenant?.plan ? ` · ${tenant.plan}` : ''}</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            Active
          </span>
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search settings... (/)"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {/* Category grid */}
        {filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">No settings match &ldquo;{q}&rdquo;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(cat => (
              <Link
                key={cat.id}
                href={cat.href}
                className={`bg-card border rounded-lg p-4 transition-colors hover:border-border ${
                  cat.danger ? 'border-rose-200 hover:border-rose-300' : 'border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`${ICON_WRAPPER} ${
                    cat.danger ? 'bg-rose-50 text-rose-500' :
                    cat.id === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' :
                    cat.id === 'recovery' ? 'bg-amber-50 text-amber-600' :
                    'bg-muted/50 text-muted-foreground'
                  }`}>
                    {cat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{cat.title}</p>
                      {cat.status && cat.statusLabel && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${STATUS_STYLES[cat.status]}`}>
                          {cat.statusLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 mt-1 ${cat.danger ? 'text-rose-300' : 'text-muted-foreground'}`} />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Appearance */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-muted/50 text-muted-foreground">
              {theme === 'light' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Appearance</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Currently {theme === 'light' ? 'Light' : 'Dark'} mode
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                theme === 'dark' ? 'bg-foreground/20' : 'bg-muted'
              }`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-card shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] transform transition-transform ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-rose-200 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <p className="text-xs font-medium text-rose-500 uppercase tracking-wider">Danger Zone</p>
          </div>
          <div className="bg-card border border-rose-200 rounded-lg divide-y divide-rose-100 overflow-hidden">
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-5 h-5 text-rose-500" />
              <div>
                <p className="text-sm font-medium text-rose-700">Sign out</p>
                <p className="text-xs text-rose-500">End your current session</p>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
