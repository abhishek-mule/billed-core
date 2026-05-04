import { db } from "@/lib/db";
import { invoices } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "@/server/auth/middleware";

export async function GET(req: Request) {
  try {
    const { tenantId } = requireAuth(req);
    
    // Check onboarding
    const invoiceCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId));

    return Response.json({ hasInvoices: Number(invoiceCount[0].count) > 0 });
  } catch (err) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
