interface SyncStatusProps {
  status: 'PENDING' | 'SYNCING' | 'RETRYING' | 'SYNCED' | 'FAILED'
  attempts?: number
}

export function SyncStatusBadge({ status, attempts = 0 }: SyncStatusProps) {
  const styles = {
    PENDING: 'bg-gray-500/10 text-gray-400',
    SYNCING: 'bg-blue-500/10 text-blue-400 animate-pulse',
    RETRYING: 'bg-amber-500/10 text-amber-400',
    SYNCED: 'bg-green-500/10 text-green-400',
    FAILED: 'bg-red-500/10 text-red-400',
  }

  const labels = {
    PENDING: 'Pending',
    SYNCING: 'Syncing...',
    RETRYING: `Retrying (${attempts})`,
    SYNCED: 'Synced',
    FAILED: 'Failed',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
      styles[status]
    }`}>
      {status === 'SYNCING' && (
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
      )}
      {status === 'RETRYING' && (
        <span className="w-2 h-2 rounded-full bg-amber-400" />
      )}
      {status === 'SYNCED' && (
        <span className="w-2 h-2 rounded-full bg-green-400" />
      )}
      {status === 'FAILED' && (
        <span className="w-2 h-2 rounded-full bg-red-400" />
      )}
      {labels[status]}
    </span>
  )
}

export function SyncStatusIndicator({ status, lastAttemptAt }: { status: string; lastAttemptAt?: number }) {
  if (status === 'PENDING') {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Ready to sync
      </div>
    )
  }

  if (status === 'SYNCING') {
    return (
      <div className="flex items-center gap-2 text-xs text-blue-400">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Syncing to ERPNext...
      </div>
    )
  }

  if (status === 'RETRYING') {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Retrying sync...
      </div>
    )
  }

  if (status === 'FAILED') {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Sync failed - manual retry available
      </div>
    )
  }

  if (status === 'SYNCED') {
    const syncedTime = lastAttemptAt 
      ? new Date(lastAttemptAt).toLocaleTimeString()
      : 'recently'
    return (
      <div className="flex items-center gap-2 text-xs text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Synced {syncedTime}
      </div>
    )
  }

  return null
}