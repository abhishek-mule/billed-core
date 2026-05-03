import { db } from '@/lib/db';
import { tenants, invoices } from '@/lib/schema';
import { getSession } from '@/lib/auth/session';
import { eq, count } from 'drizzle-orm';

export async function GET(req: Request) {
  const session = await getSession(req);
  const tenantId = session.tenantId;

  // Check if tenant has sent any invoices
  const invoiceCount = await db.select({ value: count() })
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId));

  const hasInvoices = invoiceCount[0].value > 0;

  return Response.json({
    shouldShowOnboarding: !hasInvoices
  });
}
