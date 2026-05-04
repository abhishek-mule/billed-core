import { db } from "@/lib/db";
import { events } from "@/lib/schema";

type TrackEventInput = {
  tenantId: string;
  userId?: string;
  eventName: string;
  entityId: string;
  entityType: 'invoice' | 'payment';
  amountPaise?: number;
  source?: 'system' | 'manual' | 'auto';
  channel?: 'whatsapp' | 'dashboard' | 'link';
  followUpStage?: number;
  tone?: string;
  metadata?: Record<string, any>;
};

export async function trackEvent(tx: any, input: TrackEventInput) {
  await tx.insert(events).values({
    tenantId: input.tenantId,
    userId: input.userId,
    eventName: input.eventName,
    entityId: input.entityId,
    entityType: input.entityType,
    amountPaise: input.amountPaise?.toString(),
    source: input.source,
    channel: input.channel,
    followUpStage: input.followUpStage,
    tone: input.tone,
    metadata: input.metadata ?? {},
  });
}
