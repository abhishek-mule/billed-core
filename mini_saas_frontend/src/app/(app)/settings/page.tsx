'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Building2, 
  Settings2, 
  Smartphone, 
  Shield, 
  LogOut,
  RefreshCcw,
  CloudOff
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('billzo_token')
    router.push('/login')
  }

  const triggerSync = () => {
    setSyncing(true)
    setTimeout(() => {
      setSyncing(false)
    }, 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your business profile and app preferences</p>
      </header>

      {/* Sync Status Card */}
      <div className="card-base p-5 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground border-none shadow-glow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
              <RefreshCcw className={cn("w-5 h-5 text-white", syncing && "animate-spin")} />
            </div>
            <div>
              <p className="font-bold text-white text-lg">App Synced</p>
              <p className="text-white/80 text-xs">Last updated 2 mins ago</p>
            </div>
          </div>
          <button 
            onClick={triggerSync}
            disabled={syncing}
            className="px-4 py-2 bg-white text-primary rounded-xl text-sm font-bold active:scale-95 transition-transform"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Business</h2>
        <div className="card-base divide-y divide-border">
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-sm text-foreground">Business Profile</span>
            </div>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-sm text-foreground">GST & Taxes</span>
            </div>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">App</h2>
        <div className="card-base divide-y divide-border">
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-sm text-foreground">Device Settings</span>
            </div>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <CloudOff className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-sm text-foreground">Offline Storage</span>
            </div>
          </button>
        </div>
      </div>

      <button 
        onClick={handleLogout}
        className="w-full card-base p-4 flex items-center justify-center gap-2 text-destructive hover:bg-destructive/5 transition-colors font-semibold"
      >
        <LogOut className="w-5 h-5" /> Logout
      </button>
      </div>

      <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Plan & Billing</h2>
      <div className="card-base p-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-foreground">Free Plan</p>
            <p className="text-xs text-muted-foreground">Limited to 50 invoices/mo</p>
          </div>
          <div className="px-2 py-1 rounded bg-primary/10 text-primary text-[10px] font-bold">CURRENT</div>
        </div>
        <button 
          onClick={() => router.push('/settings/upgrade')}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-glow hover:bg-primary/90"
        >
          Upgrade to Pro
        </button>
      </div>
      </div>

      <div className="text-center pb-8 pt-4">
        <p className="text-xs font-semibold text-muted-foreground">BillZo App v1.0.0</p>
      </div>
    </div>
  )
}
