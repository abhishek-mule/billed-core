"use client"

import React from "react"
import { Clock } from "lucide-react"
import { MerchantLanguage } from "@billzo/shared"
import type { AnyDashboardSection, ActivitySectionPayload, ActivityEvent } from "@billzo/shared"
import { formatDistanceToNowStrict } from "date-fns"
import { enIN } from "date-fns/locale"

function ActivitySection({ section }: { section: AnyDashboardSection }) {
  if (section.type !== 'activity') return null
  const payload = section.payload as ActivitySectionPayload
  const { events } = payload
  const collapsible = section.collapsible ?? true

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{MerchantLanguage.empty.noActivity}</p>
    )
  }

  return (
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
  )
}

export { ActivitySection }