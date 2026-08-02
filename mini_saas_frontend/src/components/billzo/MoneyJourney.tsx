"use client"

import { cn } from "@/lib/utils"

interface MoneyJourneyProps {
  steps: { label: string; done: boolean; current?: boolean }[]
}

export function MoneyJourney({ steps }: MoneyJourneyProps) {
  const activeIndex = steps.findIndex((s) => s.current)
  const current = activeIndex >= 0 ? activeIndex : steps.filter((s) => s.done).length

  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((step, i) => {
        const isCompleted = step.done
        const isCurrent = step.current || i === current
        const isLast = i === steps.length - 1

        return (
          <div key={step.label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors",
                  isCompleted && "bg-success text-success-foreground",
                  !isCompleted && isCurrent && "bg-recovery text-recovery-foreground ring-2 ring-recovery/30",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap",
                  isCompleted && "text-success",
                  isCurrent && !isCompleted && "text-recovery",
                  !isCompleted && !isCurrent && "text-muted-foreground/60",
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "flex-1 h-[2px] mx-1.5 mt-[-1.25rem]",
                  isCompleted ? "bg-success" : "bg-muted",
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
