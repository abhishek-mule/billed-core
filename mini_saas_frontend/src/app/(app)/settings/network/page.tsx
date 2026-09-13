import { cookies } from 'next/headers'
import Link from 'next/link'
import { Bell, ChevronLeft, Smartphone } from 'lucide-react'
import { resolveTenantIdentity } from '@/lib/billzo/auth-jwt'
import { NotificationPreferencesControl } from '@/components/billzo/NotificationPreferencesControl'
import { PushNotificationControl } from '@/components/billzo/PushNotificationControl'

export const dynamic = 'force-dynamic'

export default async function NetworkSettingsPage() {
  const cookieStore = cookies()
  const tenantId =
    resolveTenantIdentity({
      accessToken: cookieStore.get('bz_access')?.value,
      tenantCookie: cookieStore.get('bz_tenant')?.value,
      requireAccessToken: false,
    })?.tenantId ?? null

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="mx-auto px-4 lg:px-8 py-5 lg:py-8 max-w-2xl space-y-5">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Settings
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-info-soft text-info">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              Choose what alerts you receive and how they reach you.
            </p>
          </div>
        </div>

        {!tenantId ? (
          <div className="bg-card border border-danger rounded-lg p-6 text-center">
            <Smartphone className="w-8 h-8 text-danger mx-auto mb-3" />
            <p className="text-sm text-danger">No tenant session found. Please log in.</p>
          </div>
        ) : (
          <>
            {/* Permission nudge + device registration + test */}
            <PushNotificationControl tenantId={tenantId} />

            {/* In-app notification preferences (server is source of truth) */}
            <NotificationPreferencesControl />
          </>
        )}
      </div>
    </div>
  )
}