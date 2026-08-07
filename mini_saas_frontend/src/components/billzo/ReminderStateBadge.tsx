"use client";

import { PhoneOff, Send, CheckCheck, Eye, HeartHandshake, CheckCircle2, Circle } from "lucide-react";
import type { RecoveryState, RecoveryStateInput } from "@/lib/billzo/reminder-state";
import { deriveRecoveryState } from "@/lib/billzo/reminder-state";
import { cn } from "@/lib/utils";

const ICONS = {
  phone_missing: PhoneOff,
  not_sent: Circle,
  sent: Send,
  delivered: CheckCheck,
  read: Eye,
  promised: HeartHandshake,
  paid: CheckCircle2,
} as const;

interface ReminderStateBadgeProps {
  input?: RecoveryStateInput | null;
  size?: "sm" | "md";
  className?: string;
  /** render the icon glyph inside the chip instead of a plain dot */
  showIcon?: boolean;
}

/**
 * The single source of truth for "what is happening with this customer".
 * Used identically on Home, Recovery, the queue and the customer page so the
 * story never changes between screens.
 */
export function ReminderStateBadge({ input, size = "sm", className, showIcon }: ReminderStateBadgeProps) {
  const st: RecoveryState = deriveRecoveryState(input);
  const Icon = ICONS[st.id] ?? Circle;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide",
        size === "sm" ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]",
        st.chip,
        className,
      )}
      data-recovery-state={st.id}
    >
      {showIcon ? <Icon size={size === "sm" ? 11 : 12} /> : <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />}
      {st.label}
    </span>
  );
}

/** Pure helper so callers that only need the state text/classes share one path. */
export { deriveRecoveryState };
