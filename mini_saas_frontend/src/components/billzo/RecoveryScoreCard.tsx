"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScoreDriver {
  title: string
  status: "good" | "warning" | "critical"
  impact: "high" | "medium" | "low"
}

interface RecoveryScoreCardProps {
  score: number
  drivers: ScoreDriver[]
}

function scoreColor(score: number) {
  if (score >= 75) return { text: "text-success", bar: "bg-success", bg: "bg-success-soft" }
  if (score >= 45) return { text: "text-warning", bar: "bg-warning", bg: "bg-warning-soft" }
  return { text: "text-danger", bar: "bg-danger", bg: "bg-danger-soft" }
}

function DriverIcon({ status }: { status: string }) {
  if (status === "good") return <CheckCircle2 size={12} className="text-success flex-shrink-0 mt-0.5" />
  if (status === "warning") return <AlertTriangle size={12} className="text-warning flex-shrink-0 mt-0.5" />
  return <XCircle size={12} className="text-danger flex-shrink-0 mt-0.5" />
}

export function RecoveryScoreCard({ score, drivers }: RecoveryScoreCardProps) {
  const [open, setOpen] = useState(false)
  const colors = scoreColor(score)

  const positive = drivers.filter((d) => d.status === "good")
  const negative = drivers.filter((d) => d.status === "warning" || d.status === "critical")

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn("flex items-center justify-center w-10 h-10 rounded-xl", colors.bg)}>
            <span className={cn("text-lg font-bold tabular-nums", colors.text)}>{score}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Recovery Score</p>
            <p className={cn("text-xs font-medium", colors.text)}>
              {score >= 75 ? "Good" : score >= 45 ? "Needs attention" : "Critical"}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3 pt-3 border-t border-border">
          {positive.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-success uppercase tracking-wider">Positive</p>
              {positive.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 size={12} className="text-success flex-shrink-0 mt-0.5" />
                  <span>{d.title}</span>
                </div>
              ))}
            </div>
          )}

          {negative.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-danger uppercase tracking-wider">Negative</p>
              {negative.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <DriverIcon status={d.status} />
                  <span>{d.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
