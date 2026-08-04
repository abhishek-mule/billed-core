'use client'

import { useEffect } from 'react'
import { Send, Construction } from 'lucide-react'
import { PageShell, BackLink } from '@/components/billzo/PageShell'
import { trackEvent } from '@/lib/billzo/analytics'

export default function SendPage() {
  useEffect(() => {
    const m = document.cookie.match(/(?:^| )bz_tenant=([^;]+)/)
    trackEvent(m ? decodeURIComponent(m[2]) : "unknown", "placeholder_page_opened", { page: "/send" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PageShell>
      <BackLink href="/dashboard" label="Home" />
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <Construction className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-3 text-sm font-bold text-muted-foreground">Send</h2>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Broadcast messages, payment reminders, and more — coming soon.
        </p>
      </div>
    </PageShell>
  )
}