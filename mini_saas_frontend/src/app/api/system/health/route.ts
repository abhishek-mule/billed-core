import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  // Aggregate system health metrics
  const [metrics] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'auto.executed' AND metadata->>'status' = 'success') as success_count,
      COUNT(*) FILTER (WHERE event_name = 'auto.executed' AND metadata->>'status' = 'failed') as failed_count
    FROM events
    WHERE created_at > now() - interval '1 hour'
  `);

  // Simple health check logic
  const failedCount = Number(metrics.failed_count ?? 0);
  const status = failedCount > 3 ? "degraded" : "healthy";

  return NextResponse.json({
    status,
    autoExecutionsLastHour: Number(metrics.success_count ?? 0),
    failedExecutionsLastHour: failedCount,
    lastWebhookAt: new Date().toISOString(), // In real app, track in a 'system_state' table
    timestamp: new Date().toISOString()
  });
}
