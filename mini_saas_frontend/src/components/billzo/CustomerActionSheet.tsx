"use client";

import Link from "next/link";
import { Send, Phone, CreditCard, HeartHandshake, User, Loader2 } from "lucide-react";
import type { DominantAction } from "@/lib/billzo/reminder-state";
import { cn } from "@/lib/utils";

export interface CustomerActionSheetProps {
  /** which action to visually emphasise (sheet stays identical regardless) */
  dominant?: DominantAction;
  onWhatsApp?: () => void;
  onCall?: () => void;
  onRecordPayment?: () => void;
  onPromise?: () => void;
  /** right-most "Open Customer" target */
  openHref?: string;
  onOpenCustomer?: () => void;
  /** true while a request to send is in-flight */
  busy?: boolean;
  /** lock WhatsApp (and de-emphasise it) when the phone number is missing */
  canWhatsApp?: boolean;
  /** vertical ("page") stacked layout vs the default inline row */
  layout?: "row" | "column";
}

interface ActionDef {
  key: DominantAction;
  icon: typeof Send;
  label: string;
}

const ACTIONS: ActionDef[] = [
  { key: "whatsapp", icon: Send, label: "Send WhatsApp" },
  { key: "call", icon: Phone, label: "Call" },
  { key: "record_payment", icon: CreditCard, label: "Record Payment" },
  { key: "promise", icon: HeartHandshake, label: "Promise" },
];

/**
 * The fixed action sheet. Every customer — on Home, Recovery, queue,
 * customer page — shows the exact same buttons in the exact same order so
 * merchant muscle memory works. Only one button is emphasised (dominant),
 * never re-labelled or hidden.
 */
export function CustomerActionSheet({
  dominant,
  onWhatsApp,
  onCall,
  onRecordPayment,
  onPromise,
  openHref,
  onOpenCustomer,
  busy,
  canWhatsApp = true,
  layout = "row",
}: CustomerActionSheetProps) {
  const handlerFor = (key: DominantAction): (() => void) | undefined =>
    key === "whatsapp" ? onWhatsApp
      : key === "call" ? onCall
      : key === "record_payment" ? onRecordPayment
      : onPromise;

  const OpenTrigger = openHref
    ? ({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) => (
        <Link href={openHref} className={className} title={title} onClick={onOpenCustomer}>{children}</Link>
      )
    : ({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) => (
        <button type="button" onClick={onOpenCustomer} title={title} className={className}>{children}</button>
      );

  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";
  const regular = "h-9 border border-border bg-card text-foreground hover:bg-muted";
  const emphasized = "h-9 bg-primary text-primary-foreground shadow-sm hover:opacity-90";

  const isDominant = (key: DominantAction) =>
    !!dominant && dominant === key;

  return (
    <div
      className={cn(
        "w-full",
        layout === "row" ? "flex items-center gap-2" : "grid grid-cols-2 gap-2",
      )}
    >
      {ACTIONS.map(({ key, icon: Icon, label }) => {
        const dominantFlag = isDominant(key);
        const disabled =
          busy ||
          (key === "whatsapp" && !canWhatsApp) ||
          (key === "call" && !onCall) ||
          (key === "record_payment" && !onRecordPayment) ||
          (key === "promise" && !onPromise);
        return (
          <button
            key={key}
            type="button"
            onClick={handlerFor(key)}
            disabled={disabled}
            className={cn(
              base,
              dominantFlag ? emphasized : regular,
              layout === "row" ? "flex-1" : "",
              dominantFlag && "ring-1 ring-primary/30",
            )}
          >
            {key === "whatsapp" && busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
            {dominantFlag ? label : label.startsWith("Send") ? "WhatsApp" : label}
          </button>
        );
      })}

      {openHref || onOpenCustomer ? (
        <OpenTrigger
          title="Open Customer"
          className={cn(
            base,
            "border border-border text-muted-foreground hover:bg-muted",
            layout === "row"
              ? "flex-none h-9 px-2.5"
              : "col-span-2 h-9 px-3",
          )}
        >
          <User size={13} />
          <span>{layout === "column" ? "Open Customer" : ""}</span>
        </OpenTrigger>
      ) : null}
    </div>
  );
}

export default CustomerActionSheet;