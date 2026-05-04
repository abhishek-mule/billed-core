import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Mock helper - replace with actual session/tenant resolution
function getTenant() {
  return "tenant_id_here"; 
}

export async function GET() {
  const tenantId = getTenant();

  // Prescriptive Insights Query
  const [result] = await db.execute(sql`
    WITH tone_performance AS (
      SELECT 
        r.tone,
        COUNT(*) FILTER (WHERE p.created_at <= r.created_at + interval '24 hours') * 1.0 / COUNT(*) as conv_rate
      FROM events r
      LEFT JOIN events p ON r.entity_id = p.entity_id AND p.event_name = 'payment.success'
      WHERE r.tenant_id = ${tenantId} AND r.event_name = 'reminder.sent'
      GROUP BY r.tone
      ORDER BY conv_rate DESC
      LIMIT 1
    ),
    missed_ops AS (
      SELECT COUNT(*) as count
      FROM events
      WHERE tenant_id = ${tenantId} 
        AND event_name = 'invoice.created'
        AND created_at < now() - interval '7 days'
        AND entity_id NOT IN (SELECT entity_id FROM events WHERE event_name = 'payment.success')
    )
    SELECT 
      (SELECT tone FROM tone_performance) as best_tone,
      (SELECT count FROM missed_ops) as missed_count;
  `);

  const bestTone = result.best_tone ?? 'gentle';
  const missedCount = Number(result.missed_count ?? 0);

  let suggestedAction = {
    type: "increase_followups",
    reason: "Significant number of invoices remain unpaid after 7 days without recovery."
  };

  if (missedCount < 5 && bestTone !== 'gentle') {
    suggestedAction = {
      type: "switch_tone",
      reason: `Your ${bestTone} reminders are highly effective; consider applying this tone to all stages.`
    };
  }

  return NextResponse.json({
    recoveryRate72h: 0.35, // Placeholder for actual logic
    avgCollectionTimeHours: 48,
    bestPerformingTone: bestTone,
    worstPerformingSegment: "high_risk",
    missedOpportunities: missedCount,
    suggestedAction
  });
}
