import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";

export async function GET(req: Request) {
  try {
    const { tenantId } = requireAuth(req);

    const [result] = await db.execute(sql`
      WITH payments AS (
        SELECT amount_paise, metadata->>'collectedVia' as source, created_at, (metadata->>'attributionDelayHours')::numeric as delay
        FROM events
        WHERE tenant_id = ${tenantId} AND event_name = 'payment.success'
      ),
      metrics AS (
        SELECT 
          SUM(amount_paise) as total,
          SUM(CASE WHEN source = 'auto' THEN amount_paise ELSE 0 END) as auto,
          SUM(CASE WHEN source != 'auto' THEN amount_paise ELSE 0 END) as manual
        FROM payments
      ),
      delay AS (
        SELECT AVG(delay) as avg_delay
        FROM payments
      )
      SELECT 
        m.total, m.auto, m.manual,
        d.avg_delay
      FROM metrics m, delay d;
    `);

    const total = Number(result.total ?? 0);
    const auto = Number(result.auto ?? 0);
    const manual = Number(result.manual ?? 0);

    return NextResponse.json({
      recoveryRate: 0, 
      avgCollectionTimeHours: 0,
      totalRecoveredPaise: total,
      autoRecoveredPaise: auto,
      manualRecoveredPaise: manual,
      autoRecoveryRate: total > 0 ? (auto / total) * 100 : 0,
      avgAttributionDelayHours: Number(result.avg_delay ?? 0),
      pendingPaise: 0,
      topReminderStage: null,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
