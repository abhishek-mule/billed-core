"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle, AlertCircle, CreditCard, Clock, ArrowRight, FileText, ShieldBan, ShieldCheck, UserCheck, UserX, ChevronDown, ChevronUp } from "lucide-react";

const eventIcons: Record<string, React.ReactNode> = {
  "invoice.created": <FileText className="h-4 w-4" />,
  "recovery.reminder.sent": <MessageCircle className="h-4 w-4" />,
  "recovery.reminder.delivered": <CheckCircle2 className="h-4 w-4" />,
  "recovery.reminder.failed": <AlertCircle className="h-4 w-4" />,
  "payment.completed": <CreditCard className="h-4 w-4" />,
  "payment.reconciled": <CheckCircle2 className="h-4 w-4" />,
  "recovery.completed": <CheckCircle2 className="h-4 w-4" />,
  "decision.engine.blocked": <ShieldBan className="h-4 w-4" />,
  "decision.engine.allowed": <ShieldCheck className="h-4 w-4" />,
  "recovery.override.approved": <UserCheck className="h-4 w-4" />,
  "recovery.override.rejected": <UserX className="h-4 w-4" />,
};

const eventColors: Record<string, string> = {
  "invoice.created": "bg-slate-100 text-slate-600",
  "recovery.reminder.sent": "bg-blue-100 text-blue-600",
  "recovery.reminder.delivered": "bg-green-100 text-green-600",
  "recovery.reminder.failed": "bg-red-100 text-red-600",
  "payment.completed": "bg-green-100 text-green-600",
  "payment.reconciled": "bg-green-100 text-green-600",
  "recovery.completed": "bg-green-100 text-green-600",
  "decision.engine.blocked": "bg-amber-100 text-amber-700",
  "decision.engine.allowed": "bg-indigo-100 text-indigo-600",
  "recovery.override.approved": "bg-purple-100 text-purple-700",
  "recovery.override.rejected": "bg-red-100 text-red-700",
};

const eventLabels: Record<string, string> = {
  "invoice.created": "Invoice created",
  "recovery.reminder.sent": "Reminder sent",
  "recovery.reminder.delivered": "Reminder delivered",
  "recovery.reminder.failed": "Reminder failed",
  "payment.completed": "Payment received",
  "payment.reconciled": "Payment matched",
  "recovery.completed": "Recovery completed",
  "decision.engine.blocked": "Decision Engine: Blocked",
  "decision.engine.allowed": "Decision Engine: Allowed",
  "recovery.override.approved": "Merchant Override: Approved",
  "recovery.override.rejected": "Merchant Override: Rejected",
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
  onOverride?: (reason: string) => void;
}

export function RecoveryTimeline({ events, recoveredAmount, onOverride }: RecoveryTimelineProps) {
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());

  const toggleDecision = (id: string) => {
    setExpandedDecisions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
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

              {/* Decision engine detail */}
              {event.type === 'decision.engine.blocked' && !!String(event.payload?.reason || '') && (
                <div className="mt-1.5">
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 border border-amber-200">
                    <span className="font-medium">Blocked:</span>{' '}
                    {String(event.payload?.reason || '')}
                  </div>
                  {!!event.payload?.rules_snapshot && typeof event.payload.rules_snapshot === 'object' && (
                    <>
                      <button
                        onClick={() => toggleDecision(event.id)}
                        className="mt-1 text-[11px] font-medium text-amber-600 hover:text-amber-800 flex items-center gap-1"
                      >
                        {expandedDecisions.has(event.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {expandedDecisions.has(event.id) ? 'Hide rules' : 'Show all 9 rules'}
                      </button>
                      {expandedDecisions.has(event.id) && (
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          {Object.entries(event.payload.rules_snapshot as Record<string, boolean>).map(([rule, passed]) => (
                            <div
                              key={rule}
                              className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${
                                rule === 'merchant_override'
                                  ? 'bg-indigo-50 text-indigo-700'
                                  : passed
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-red-50 text-red-700'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                rule === 'merchant_override'
                                  ? 'bg-indigo-400'
                                  : passed ? 'bg-green-400' : 'bg-red-400'
                              }`} />
                              <span className="truncate">{rule.replace(/_/g, ' ')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {event.type === 'decision.engine.allowed' && !!String(event.payload?.reason || '') && (
                <div className="mt-1.5 text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5 border border-indigo-200">
                  <span className="font-medium">Allowed:</span>{' '}
                  {String(event.payload?.reason || '')}
                  {!!event.payload?.override && String(event.payload.override) === 'true' && (
                    <span className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-800 font-medium">
                      merchant override
                    </span>
                  )}
                </div>
              )}

              {/* Override events */}
              {event.type === 'recovery.override.approved' && (
                <div className="mt-1.5 text-xs text-purple-700 bg-purple-50 rounded-lg px-2.5 py-1.5 border border-purple-200">
                  <span className="font-medium">Reason:</span>{' '}
                  {String(event.payload?.reason || 'Not specified')}
                </div>
              )}
              {event.type === 'recovery.override.rejected' && !!String(event.payload?.reason || '') && (
                <div className="mt-1.5 text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5 border border-red-200">
                  <span className="font-medium">Reason:</span>{' '}
                  {String(event.payload?.reason || '')}
                </div>
              )}

              {/* Override button on latest blocked event */}
              {event.type === 'decision.engine.blocked' && onOverride && index === events.length - 1 && (
                <button
                  onClick={() => onOverride(String(event.payload?.reason || 'Customer blocked'))}
                  className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  Override & Send
                </button>
              )}

              {!!event.payload?.channel && (
                <div className="text-xs text-muted-foreground mt-1">
                  via {String(event.payload.channel)}
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
