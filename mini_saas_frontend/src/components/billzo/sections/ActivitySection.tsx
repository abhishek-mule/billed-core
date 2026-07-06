"use client"

import React from "react"
import { Clock, FileText, IndianRupee, MessageSquare, Phone, Users } from "lucide-react"
import Link from "next/link"
import { MerchantLanguage } from "@billzo/shared"
import type { AnyDashboardSection, ActivitySectionPayload, ActivityEvent } from "@billzo/shared"
import { formatDistanceToNowStrict } from "date-fns"
import { enIN } from "date-fns/locale"

function ActivitySection({ section }: { section: AnyDashboardSection }) {
  if (section.type !== 'activity') return null
  const payload = section.payload as ActivitySectionPayload
  const { events, hasWorkItems } = payload
  const collapsible = section.collapsible ?? true

  return (
    <div>
      {events.length > 0 && (
        <div className={`space-y-3 ${collapsible ? 'max-h-60 overflow-y-auto pr-2' : ''}`}>
          {events.slice(0, 10).map((evt: ActivityEvent, i: number) => (
            <div key={`${evt.occurredAt}-${i}`} className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary/70" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{evt.label}</p>
              {evt.detail && <span className="text-xs text-muted-foreground whitespace-nowrap">{evt.detail}</span>}
              <time className="text-xs text-muted-foreground whitespace-nowrap" dateTime={evt.occurredAt}>
                {formatDistanceToNowStrict(new Date(evt.occurredAt), { addSuffix: true, locale: enIN })}
              </time>
            </div>
          ))}
          {events.length > 10 && collapsible && (
            <div className="mt-3 border-t pt-3">
              <span className="text-xs text-muted-foreground">
                +{events.length - 10} more — <span className="text-primary font-semibold cursor-pointer">{MerchantLanguage.common.viewAll}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No new activity today.</p>
      )}

      {/* Context-aware bottom actions */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {hasWorkItems ? (
          <>
            <Link href="/recovery" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <MessageSquare className="h-3.5 w-3.5" />
              View Pending Items
            </Link>
            <Link href="/udhar" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <IndianRupee className="h-3.5 w-3.5" />
              Receive Payment
            </Link>
            <Link href="/parties" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <Users className="h-3.5 w-3.5" />
              Open Customers
            </Link>
          </>
        ) : (
          <>
            <Link href="/invoices/create" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <FileText className="h-3.5 w-3.5" />
              Create Invoice
            </Link>
            <Link href="/parties" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <Users className="h-3.5 w-3.5" />
              Open Customers
            </Link>
            <Link href="/udhar" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <IndianRupee className="h-3.5 w-3.5" />
              View Outstanding
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export { ActivitySection }