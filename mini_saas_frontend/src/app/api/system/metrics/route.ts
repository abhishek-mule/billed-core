import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  // Aggregate system health metrics
  const [metrics] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour') as exec_count,
      COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour' AND metadata->>'status' = 'failed') as failed_count
    FROM events
    WHERE event_name = 'auto.executed'
  `);

  return NextResponse.json({
    autoExecutionsLastHour: Number(metrics.exec_count ?? 0),
    failedExecutionsLastHour: Number(metrics.failed_count ?? 0),
    status: Number(metrics.failed_count ?? 0) > 3 ? "degraded" : "healthy"
  });
}
