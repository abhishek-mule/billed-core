"use client"

import { IndianRupee, User } from "lucide-react"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { useSession } from "@/lib/billzo/session"

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatDate() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function DashboardHeader() {
  const { userName, shopName } = useSession()

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting()}, {userName || "Merchant"}</h1>
          <p className="text-sm text-muted-foreground">{formatDate()}</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{shopName || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}