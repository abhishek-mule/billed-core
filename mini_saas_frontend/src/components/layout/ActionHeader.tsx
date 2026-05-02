'use client'

import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { cn } from '@/lib/utils'
import { WifiOff, RefreshCw, AlertCircle, CheckCircle2, Save } from 'lucide-react'

interface ActionHeaderProps {
  businessName?: string
}

export function ActionHeader({ businessName = 'Complete Setup' }: ActionHeaderProps) {
  const { isOnline, isSyncing, pendingCount, failedCount } = useOfflineQueue()

  const getSyncStatus = () => {
    if (!isOnline) return { label: 'Offline Mode', color: 'text-warning', icon: WifiOff, dot: 'bg-warning' }
    if (failedCount > 0) return { label: 'Sync Failed', color: 'text-destructive', icon: AlertCircle, dot: 'bg-destructive' }
    if (isSyncing) return { label: 'Syncing...', color: 'text-primary', icon: RefreshCw, dot: 'bg-primary animate-pulse' }
    if (pendingCount > 0) return { label: 'Saved Locally', color: 'text-info', icon: Save, dot: 'bg-info' }
    return { label: 'Synced', color: 'text-success', icon: CheckCircle2, dot: 'bg-success' }
  }

  const status = getSyncStatus()
  const StatusIcon = status.icon

  return (
    <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b border-border transition-all duration-300">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold text-lg shadow-glow transition-transform group-active:scale-90">
            B
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tight text-foreground truncate max-w-[150px] sm:max-w-none leading-none">
              {businessName.toUpperCase()}
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border/50 transition-all duration-500",
            status.color
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]", status.dot)} />
            <span className="text-[10px] font-black uppercase tracking-tighter hidden sm:inline">
              {status.label}
            </span>
            <StatusIcon className={cn("w-3.5 h-3.5", status.label === 'Syncing...' && "animate-spin")} />
          </div>
        </div>
      </div>
    </header>
  )
}
