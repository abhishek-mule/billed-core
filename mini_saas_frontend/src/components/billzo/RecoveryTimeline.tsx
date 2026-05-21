"use client";

import { CheckCircle2, MessageCircle, AlertCircle, CreditCard, Clock, ArrowRight } from "lucide-react";

const eventIcons: Record<string, React.ReactNode> = {
  "recovery.reminder.sent": <MessageCircle className="h-4 w-4" />,
  "recovery.reminder.delivered": <CheckCircle2 className="h-4 w-4" />,
  "recovery.reminder.failed": <AlertCircle className="h-4 w-4" />,
  "payment.completed": <CreditCard className="h-4 w-4" />,
  "payment.reconciled": <CheckCircle2 className="h-4 w-4" />,
  "recovery.completed": <CheckCircle2 className="h-4 w-4" />,
};

const eventColors: Record<string, string> = {
  "recovery.reminder.sent": "bg-blue-100 text-blue-600",
  "recovery.reminder.delivered": "bg-green-100 text-green-600",
  "recovery.reminder.failed": "bg-red-100 text-red-600",
  "payment.completed": "bg-green-100 text-green-600",
  "payment.reconciled": "bg-green-100 text-green-600",
  "recovery.completed": "bg-green-100 text-green-600",
};

const eventLabels: Record<string, string> = {
  "recovery.reminder.sent": "Reminder sent",
  "recovery.reminder.delivered": "Reminder delivered",
  "recovery.reminder.failed": "Reminder failed",
  "payment.completed": "Payment received",
  "payment.reconciled": "Payment matched",
  "recovery.completed": "Recovery completed",
};

interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

interface RecoveryTimelineProps {
  events: TimelineEvent[];
  recoveredAmount?: number;
}

export function RecoveryTimeline({ events, recoveredAmount }: RecoveryTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Recovery Timeline
        </div>
        <div className="text-sm text-muted-foreground text-center py-4">
          No recovery activity yet
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Recovery Timeline
      </div>
      <div className="space-y-0">
        {events.map((event, index) => (
          <div key={event.id} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={`grid h-8 w-8 place-items-center rounded-full shrink-0 ${eventColors[event.type] || "bg-gray-100 text-gray-600"}`}>
                {eventIcons[event.type] || <Clock className="h-4 w-4" />}
              </div>
              {index < events.length - 1 && (
                <div className="w-0.5 h-8 bg-border mt-1" />
              )}
            </div>

            {/* Event details */}
            <div className="flex-1 pb-4">
              <div className="text-sm font-medium">{eventLabels[event.type] || event.type}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(event.timestamp).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {event.payload?.channel && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  via {event.payload.channel}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {recoveredAmount && recoveredAmount > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-xs text-green-700 font-medium">
            BillZo helped recover {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(recoveredAmount)}
          </span>
        </div>
      )}
    </div>
  );
}
