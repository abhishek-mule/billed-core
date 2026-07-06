"use client"

import React from "react"
import { TodaySection } from "./sections/TodaySection"
import { CashSection } from "./sections/CashSection"
import { ActivitySection } from "./sections/ActivitySection"
import { MemoriesSection } from "./sections/MemoriesSection"
import type { AnyDashboardSection, TodaySectionPayload, CashSectionPayload, ActivitySectionPayload, MemoriesSectionPayload } from "@billzo/shared"

function renderToday(section: AnyDashboardSection) {
  return <TodaySection section={section as AnyDashboardSection & { type: 'today'; payload: TodaySectionPayload }} />
}

function renderCash(section: AnyDashboardSection) {
  return <CashSection section={section as AnyDashboardSection & { type: 'cash'; payload: CashSectionPayload }} />
}

function renderActivity(section: AnyDashboardSection) {
  return <ActivitySection section={section as AnyDashboardSection & { type: 'activity'; payload: ActivitySectionPayload }} />
}

function renderMemories(section: AnyDashboardSection) {
  return <MemoriesSection section={section as AnyDashboardSection & { type: 'memories'; payload: MemoriesSectionPayload }} />
}

const renderers: Record<AnyDashboardSection["type"], (section: AnyDashboardSection) => React.ReactElement> = {
  today: renderToday,
  cash: renderCash,
  activity: renderActivity,
  memories: renderMemories,
}

export function DashboardSectionRenderer({ section }: { section: AnyDashboardSection }) {
  const render = renderers[section.type]
  if (!render) return null
  return render(section)
}