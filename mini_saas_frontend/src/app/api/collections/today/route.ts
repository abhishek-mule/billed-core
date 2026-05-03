import { db } from '@/lib/db';
import { customers, invoices, tenants } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, and, sql, desc } from 'drizzle-orm';

function getPriorityScore(customer: any, unpaidInvoices: any[]) {
  let score = 0;
  
  // Weights
  const balanceWeight = 0.4;
  const overdueWeight = 20;
  
  const udhar = Number(customer.udharBalance || 0);
  const overdueDays = Math.max(...unpaidInvoices.map(i => {
    const dueDate = i.dueDate ? new Date(i.dueDate) : new Date();
    return Math.max(0, Math.floor((new Date().getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
  }), 0);

  score += udhar * balanceWeight;
  score += overdueDays * overdueWeight;

  // Risk Level
  if (customer.riskLevel === 'high') score += 50;
  else if (customer.riskLevel === 'medium') score += 25;
  else score += 10;

  // Intent: Check latest invoice status
  const latestInvoice = unpaidInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (latestInvoice) {
    if (latestInvoice.waStatus === 'read') score += 40;
    else if (latestInvoice.waStatus === 'delivered') score += 10;
  }

  return score;
}

export async function GET(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;
  
  const allCustomers = await db.query.customers.findMany({
    where: eq(customers.tenantId, tenantId),
    with: { invoices: true }
  });

  const priorityList = allCustomers
    .filter(c => Number(c.udharBalance) > 0)
    .map(c => {
      const unpaid = c.invoices.filter((i: any) => i.paymentStatus !== 'paid');
      const latest = unpaid.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return {
        ...c,
        priorityScore: getPriorityScore(c, unpaid),
        waStatus: latest?.waStatus || 'pending',
        paymentStatus: latest?.paymentStatus || 'unpaid'
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    
  const proStatus = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const isPro = proStatus?.subscriptionStatus === 'pro' || (proStatus?.subscriptionStatus === 'trial' && proStatus.trialEndsAt! > new Date());

  return Response.json({
    data: isPro ? priorityList : priorityList.slice(0, 2),
    isLocked: !isPro && priorityList.length > 2
  });
}
