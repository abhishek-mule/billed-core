// src/lib/analytics.ts
import { db } from '@/lib/db';
import { eventLogs } from '@/lib/schema';

export async function trackEvent(
  tenantId: string, 
  eventName: string, 
  metadata: Record<string, any> = {}
) {
  await db.insert(eventLogs).values({
    tenantId,
    eventName,
    metadata
  });
}
