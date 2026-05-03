import { db } from '@/lib/db';
import { invoices, customers, tenants } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: { publicId: string } }) {
  const { publicId } = params;

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.publicId, publicId),
    with: {
      items: true,
      customer: true,
      tenant: true
    }
  });

  if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 });

  // Minimal public-facing response
  return Response.json({
    shopName: invoice.tenant?.companyName,
    invoiceNo: invoice.invoiceNumber,
    date: invoice.createdAt,
    customerName: invoice.customer?.customerName,
    items: invoice.items,
    subtotal: invoice.subtotal,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    total: invoice.grandTotal,
    paymentStatus: invoice.paymentStatus,
    pdfUrl: invoice.pdfUrl,
    publicId: invoice.publicId
  });
}
