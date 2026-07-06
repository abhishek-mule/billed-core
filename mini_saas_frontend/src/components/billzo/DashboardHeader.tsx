"use client"

import { useSession } from "@/lib/billzo/session"

function formatDate() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

export function DashboardHeader() {
  const { shopName } = useSession()

  return (
    <div>
      <p className="text-sm text-muted-foreground">{formatDate()}</p>
      <h1 className="mt-0.5 text-xl font-bold tracking-tight">{shopName || "Dashboard"}</h1>
    </div>
  )
}