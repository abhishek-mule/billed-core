"use client"

import React from "react"
import { TodaySection } from "./sections/TodaySection"
import { CashSection } from "./sections/CashSection"
import { ActivitySection } from "./sections/ActivitySection"
import type { AnyDashboardSection, TodaySectionPayload, CashSectionPayload, ActivitySectionPayload } from "@billzo/shared"

function renderToday(section: AnyDashboardSection) {
  return <TodaySection section={section as AnyDashboardSection & { type: 'today'; payload: TodaySectionPayload }} />
}

function renderCash(section: AnyDashboardSection) {
  return <CashSection section={section as AnyDashboardSection & { type: 'cash'; payload: CashSectionPayload }} />
}

function renderActivity(section: AnyDashboardSection) {
  return <ActivitySection section={section as AnyDashboardSection & { type: 'activity'; payload: ActivitySectionPayload }} />
}

const renderers: Record<AnyDashboardSection["type"], (section: AnyDashboardSection) => React.ReactElement> = {
  today: renderToday,
  cash: renderCash,
  activity: renderActivity,
}

export function DashboardSectionRenderer({ section }: { section: AnyDashboardSection }) {
  const render = renderers[section.type]
  if (!render) return null
  return render(section)
}