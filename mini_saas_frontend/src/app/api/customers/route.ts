import { db } from '@/lib/db';
import { customers } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;
  
  const url = new URL(req.url);
  const page = Number(url.searchParams.get('page') || 1);
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = (page - 1) * limit;
  
  const data = await db.select({
      id: customers.id,
      name: customers.customerName,
      phone: customers.phone,
      udharBalance: customers.udharBalance,
      // Calculate overdue days based on latest unpaid invoice
      overdueDays: sql<number>`(SELECT MAX(CURRENT_DATE - due_date) FROM invoices WHERE invoices.customer_id = ${customers.id} AND payment_status != 'paid')`
    })
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(desc(customers.udharBalance))
    .limit(limit)
    .offset(offset);
    
  return Response.json(data);
}
