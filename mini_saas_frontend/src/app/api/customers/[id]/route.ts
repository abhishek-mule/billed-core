import { db } from '@/lib/db';
import { customers, ledgerEntries, invoices } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const tenantId = session.tenantId;
  const { id } = params;
  
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, id), eq(customers.tenantId, tenantId))
  });
  
  if (!customer) return Response.json({ error: 'Not found' }, { status: 404 });
  
  const [ledger, invs] = await Promise.all([
    db.select().from(ledgerEntries)
      .where(and(eq(ledgerEntries.customerId, id), eq(ledgerEntries.tenantId, tenantId)))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(50),
    db.select().from(invoices)
      .where(and(eq(invoices.customerId, id), eq(invoices.tenantId, tenantId)))
      .orderBy(desc(invoices.createdAt))
      .limit(20)
  ]);
  
  return Response.json({
    customer,
    ledger,
    invoices: invs
  });
}
