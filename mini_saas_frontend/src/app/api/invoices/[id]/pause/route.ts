import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { pause } = await req.json();
  
  await db.update(invoices)
    .set({ manualPause: pause })
    .where(eq(invoices.id, params.id));

  return Response.json({ success: true });
}
