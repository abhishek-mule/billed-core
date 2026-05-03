import { db } from '@/lib/db';
import { payments, invoices } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, and, gte, sql, sum } from 'drizzle-orm';

export async function GET(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [metrics] = await db.select({
    recovered: sql`SUM(amount) FILTER (WHERE created_at >= ${oneWeekAgo})`,
    auto: sql`SUM(amount) FILTER (WHERE created_at >= ${oneWeekAgo} AND collected_via = 'auto')`,
    fees: sql`SUM(platform_fee) FILTER (WHERE created_at >= ${oneWeekAgo})`,
    pending: sql`SUM(grand_total - payment_amount) FILTER (WHERE status != 'paid')`
  })
  .from(payments)
  .leftJoin(invoices, eq(invoices.tenantId, tenantId))
  .where(eq(invoices.tenantId, tenantId));

  return Response.json({
    recoveredAmount: Number(metrics.recovered || 0),
    autoCollected: Number(metrics.auto || 0),
    earnedFees: Number(metrics.fees || 0),
    pendingAmount: Number(metrics.pending || 0)
  });
}
