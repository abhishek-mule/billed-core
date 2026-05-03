import { db } from '@/lib/db';
import { tenants, invoices } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, sql, gt } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;

  // 1. Get Tenant status
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId)
  });

  // 2. Check if user is eligible for trial
  if (tenant?.subscriptionStatus === 'free') {
    await db.update(tenants)
      .set({ 
        subscriptionStatus: 'trial', 
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
      })
      .where(eq(tenants.id, tenantId));
      
    return Response.json({ success: true, message: 'Trial activated' });
  }

  return Response.json({ error: 'Not eligible' }, { status: 400 });
}
