"use client";

import { CheckCircle2 } from "lucide-react";

interface RecoveryBadgeProps {
  recoveredAmount: number;
  attributionType?: string;
  confidenceScore?: number;
}

export function RecoveryBadge({ recoveredAmount, attributionType, confidenceScore }: RecoveryBadgeProps) {
  if (recoveredAmount <= 0) return null;

  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(recoveredAmount);

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
      <CheckCircle2 className="h-3 w-3" />
      Recovered {formatted}
      {attributionType && attributionType !== "none" && (
        <span className="text-green-600 opacity-70">via BillZo</span>
      )}
    </div>
  );
}
