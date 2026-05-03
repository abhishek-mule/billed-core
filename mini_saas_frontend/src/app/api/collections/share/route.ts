import { db } from '@/lib/db';
import { customers, invoices } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, desc, sql } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;
  
  const debtors = await db.query.customers.findMany({
    where: eq(customers.tenantId, tenantId),
    limit: 10
  });

  const listText = debtors
    .filter(d => Number(d.udharBalance) > 0)
    .map(d => `${d.customerName}: ₹${d.udharBalance}`)
    .join('\n');

  const shareText = `📊 Outstanding Dues Summary:\n${listText}\n\nManaged via Billzo.`;
  
  return Response.json({ text: shareText });
}
