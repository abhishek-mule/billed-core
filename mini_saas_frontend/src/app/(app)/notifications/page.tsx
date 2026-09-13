import { cookies } from 'next/headers'
import { Bell } from 'lucide-react'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { resolveTenantIdentity } from '@/lib/billzo/auth-jwt'
import { notificationDeepLink, type NotificationTargetType } from '@billzo/shared'
import { NotificationItem, MarkAllReadButton } from './notification-actions'

export const dynamic = 'force-dynamic'

interface NotifDbRow {
  id: string
  type: string
  level: string
  title: string
  body: string | null
  target_type: string
  target_id: string | null
  action: string
  is_read: boolean
  created_at: string
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default async function NotificationsPage() {
  const cookieStore = cookies()
  const tenantId =
    resolveTenantIdentity({
      accessToken: cookieStore.get('bz_access')?.value,
      tenantCookie: cookieStore.get('bz_tenant')?.value,
      requireAccessToken: false,
    })?.tenantId ?? null

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="rounded-lg border border-danger bg-card p-6 text-center">
            <p className="text-sm text-danger">No tenant session found. Please log in.</p>
          </div>
        </div>
      </div>
    )
  }

  const { data: rows } = await supabaseAdmin
    .from('notifications')
    .select('id, type, level, title, body, target_type, target_id, action, is_read, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  const { count: unreadCount } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_read', false)

  const notifications: NotifDbRow[] = rows || []
  const unread = unreadCount ?? 0

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="mx-auto max-w-2xl px-4 lg:px-6 py-5 lg:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-soft text-info">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Notifications</h1>
              <p className="text-xs text-muted-foreground">
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          <MarkAllReadButton unreadCount={unread} />
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <Bell className="mx-auto mb-3 h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Recovery alerts, payment updates, and reminders will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const href = n.target_type
                ? notificationDeepLink({ targetType: n.target_type as NotificationTargetType, targetId: n.target_id })
                : null
              return (
                <NotificationItem
                  key={n.id}
                  id={n.id}
                  unread={!n.is_read}
                  href={href}
                  title={n.title}
                  body={n.body}
                  timeLabel={formatRelativeTime(n.created_at)}
                  actionLabel={n.action || null}
                  level={n.level}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}