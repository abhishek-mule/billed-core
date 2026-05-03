import { db } from '@/lib/db';
import { customers, invoices, tenants } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, and, sql } from 'drizzle-orm';
import { decideNextAction } from '@/lib/ai/engine';

export async function GET(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;

  // 1. Get unpaid invoices with customer context
  const unpaid = await db.query.invoices.findMany({
    where: eq(invoices.paymentStatus, 'unpaid'),
    with: { customer: true }
  });

  // 2. Map to Actions
  const actions = unpaid.map(inv => {
    const decision = decideNextAction(inv, inv.customer);
    return {
      invoiceId: inv.id,
      customerName: inv.customer?.customerName,
      amount: inv.grandTotal,
      ...decision
    };
  })
  .filter(a => a.action !== 'wait')
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 3); // Top 3 actions only

  // 3. Get Tenant Auto-mode
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });

  return Response.json({
    nextActions: actions,
    autoModeEnabled: tenant?.subscriptionStatus === 'pro',
    recoveredToday: 0 // Fetch from payments summary
  });
}
