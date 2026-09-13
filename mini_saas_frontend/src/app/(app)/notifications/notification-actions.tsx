'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CheckCheck, AlertTriangle, Clock, Info, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Level → visual mapping (shared levels: critical / attention / info) ───

const LEVEL_STYLES: Record<string, { badge: string; icon: React.ElementType }> = {
  critical:  { badge: 'bg-danger/10 text-danger',             icon: AlertTriangle },
  attention: { badge: 'bg-amber-500/10 text-amber-600',       icon: Clock },
  info:      { badge: 'bg-info/10 text-info',                 icon: Info },
}

async function markRead(id: string): Promise<void> {
  try {
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
  } catch {
    // fire-and-forget — server remains source of truth, refresh reconciles
  }
}

// ─── Single notification row ────────────────────────────────────────────────

export function NotificationItem({
  id, unread, href, title, body, timeLabel, actionLabel, level,
}: {
  id: string
  unread: boolean
  href?: string | null
  title: string
  body?: string | null
  timeLabel: string
  actionLabel?: string | null
  level: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES.info
  const Icon = style.icon

  const handleClick = () => {
    if (unread && !busy) {
      setBusy(true)
      markRead(id).finally(() => setBusy(false))
    }
    if (href) router.push(href)
    else router.refresh()
  }

  const content = (
    <>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.badge)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Unread" />}
        </span>
        {body && <span className="block truncate text-xs text-muted-foreground">{body}</span>}
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
          {actionLabel && <span className="font-medium text-info">{actionLabel}</span>}
          <span>{timeLabel}</span>
        </span>
      </span>
      {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
    </>
  )

  const base = cn(
    'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors',
    'hover:border-primary/40 hover:bg-muted/40',
  )

  return href ? (
    <Link href={href} className={base} onClick={handleClick}>
      {content}
    </Link>
  ) : (
    <div className={base} role="button" tabIndex={0} onClick={handleClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}>
      {content}
    </div>
  )
}

// ─── Mark all as read ───────────────────────────────────────────────────────

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (unreadCount <= 0) return null

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' })
          router.refresh()
        } finally {
          setBusy(false)
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40"
    >
      <CheckCheck className="h-3.5 w-3.5 text-info" aria-hidden="true" />
      Mark all as read
    </button>
  )
}